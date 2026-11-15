// Webcamo desktop shell. The dashboard is served by the Webcamo daemon on
// 127.0.0.1; this process only makes sure a daemon is running (attaching to an
// existing one, or starting the bundled one as a child) and shows its UI.
'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, session } = require('electron');
const { spawn } = require('node:child_process');
const { createWriteStream, existsSync, mkdirSync } = require('node:fs');
const { join, dirname } = require('node:path');

const PORT = Number(process.env.WEBCAMO_PORT) || 47800;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const STATUS_URL = `${ORIGIN}/api/status`;
const READY_TIMEOUT_MS = 15_000;
const MAX_RESTARTS = 3;
const STABLE_RUN_MS = 30_000; // a child that lived this long resets the restart budget
const SELFTEST = process.env.WEBCAMO_SELFTEST === '1';

const BUNDLE = process.env.WEBCAMO_BUNDLE
  || (app.isPackaged
    ? join(process.resourcesPath, 'server', 'webcamo-bundle.cjs')
    : join(__dirname, '..', '..', 'server', 'dist', 'webcamo-bundle.cjs'));

let win = null;
let tray = null;
let child = null;      // the daemon we started, if any
let mode = 'none';     // 'owned' | 'attached' | 'none'
let quitting = false;
let attempts = 0;
let bringing = null;
let logPath = '';
let logStream = null;
let lastError = '';

const log = (...a) => {
  const line = `[desktop ${new Date().toISOString()}] ${a.join(' ')}\n`;
  if (logStream) logStream.write(line);
  if (!app.isPackaged || SELFTEST) process.stdout.write(line);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isUp() {
  try {
    const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(1500) });
    return res.status === 200;
  } catch {
    return false;
  }
}

// ---- daemon child process -------------------------------------------------

function spawnServerAndWait() {
  return new Promise((resolve) => {
    if (!existsSync(BUNDLE)) {
      lastError = `Server bundle not found: ${BUNDLE}`;
      log(lastError);
      return resolve(false);
    }
    log(`starting daemon: ${BUNDLE}`);
    const proc = spawn(process.execPath, [BUNDLE, 'run', '--no-window'], {
      cwd: dirname(BUNDLE),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WEBCAMO_VERSION: app.getVersion() },
      // Always piped: the daemon enables a pretty-print worker (needs node_modules) on a TTY.
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child = proc;
    const startedAt = Date.now();
    let ready = false;
    let settled = false;
    const settle = (v) => { if (!settled) { settled = true; resolve(v); } };

    proc.stdout.pipe(logStream, { end: false });
    proc.stderr.pipe(logStream, { end: false });
    proc.on('error', (e) => { lastError = `Could not start daemon: ${e.message}`; log(lastError); });
    proc.on('exit', (code, signal) => {
      log(`daemon exited (code=${code}, signal=${signal})`);
      if (child === proc) child = null;
      if (!ready) {
        lastError = `The Webcamo daemon exited during startup (code ${code ?? signal}).`;
        return settle(false);
      }
      if (quitting) return;
      // It was serving and died: bring it back (bringUp applies the backoff).
      mode = 'none';
      if (Date.now() - startedAt > STABLE_RUN_MS) attempts = 0;
      lastError = `The Webcamo daemon stopped unexpectedly (code ${code ?? signal}).`;
      bringUp();
    });

    (async () => {
      const deadline = Date.now() + READY_TIMEOUT_MS;
      while (!settled && Date.now() < deadline) {
        if (await isUp()) { ready = true; return settle(true); }
        await sleep(300);
      }
      if (!settled) {
        lastError = `The Webcamo daemon did not answer ${STATUS_URL} within ${READY_TIMEOUT_MS / 1000} s.`;
        log(lastError);
        await stopChild();
        settle(false);
      }
    })();
  });
}

// SIGTERM, then SIGKILL after 3 s. Only ever touches the process we spawned.
function stopChild() {
  const proc = child;
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { log('daemon did not stop in 3 s; killing'); proc.kill('SIGKILL'); }, 3000);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
    log(`stopping daemon pid ${proc.pid}`);
    proc.kill('SIGTERM');
  });
}

// Make sure a daemon answers, then show the dashboard. Serialised.
function bringUp() {
  if (!bringing) bringing = doBringUp().finally(() => { bringing = null; });
  return bringing;
}

async function doBringUp() {
  showPage('loading.html');
  if (await isUp()) {
    mode = 'attached';
    log(`attached to running daemon at ${ORIGIN}`);
    return showDashboard();
  }
  for (;;) {
    if (attempts > 0) await sleep(1000 * 2 ** (attempts - 1));
    if (quitting) return;
    const ok = await spawnServerAndWait();
    if (quitting) return;
    if (ok) { mode = 'owned'; return showDashboard(); }
    if (await isUp()) { // another daemon (e.g. the service) won the port
      mode = 'attached';
      log('another daemon is serving; attaching');
      return showDashboard();
    }
    if (++attempts > MAX_RESTARTS) {
      log('giving up on the daemon');
      return showPage('error.html', { reason: lastError || 'The Webcamo daemon failed to start.', log: logPath });
    }
  }
}

// Attached daemons belong to someone else (e.g. systemd); if one disappears we
// start our own.
setInterval(async () => {
  if (quitting || mode !== 'attached' || bringing) return;
  if (!(await isUp())) { mode = 'none'; log('attached daemon went away'); bringUp(); }
}, 5000).unref();

// ---- window ---------------------------------------------------------------

function showPage(file, query) {
  if (win && !win.isDestroyed()) win.loadFile(join(__dirname, file), query ? { query } : undefined);
}

function showDashboard() {
  if (win && !win.isDestroyed()) win.loadURL(`${ORIGIN}/`);
}

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    if (u.origin === ORIGIN) return true;
    return u.protocol === 'file:' && decodeURIComponent(u.pathname).startsWith(__dirname.replace(/\\/g, '/').replace(/^(?=[A-Za-z]:)/, '/'));
  } catch {
    return false;
  }
}

function openExternally(url) {
  if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) return;
  if (SELFTEST) return log(`selftest: would open externally ${url}`);
  shell.openExternal(url);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 480,
    minHeight: 400,
    title: 'Webcamo',
    icon: join(__dirname, '..', 'assets', 'icon.png'),
    autoHideMenuBar: true,
    show: !SELFTEST || process.env.WEBCAMO_SELFTEST_SHOW === '1',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, 'preload.js'),
    },
  });
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => { openExternally(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => {
    if (!isAllowedUrl(url)) { e.preventDefault(); openExternally(url); }
  });
  wc.on('will-redirect', (e, url) => { if (!isAllowedUrl(url)) e.preventDefault(); });
  wc.on('will-attach-webview', (e) => e.preventDefault());
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted */ || !url.startsWith(ORIGIN)) return;
    log(`dashboard failed to load: ${desc}`);
    lastError = `Could not load the dashboard (${desc}).`;
    showPage('error.html', { reason: lastError, log: logPath });
  });
  win.on('close', (e) => {
    if (!quitting && tray) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'tray.png'));
    tray = new Tray(img);
    tray.setToolTip('Webcamo');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show Webcamo', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
    tray.on('click', showWindow);
  } catch (e) {
    tray = null; // no system tray (some Linux desktops): closing the window quits
    log(`no tray available: ${e.message}`);
  }
}

// ---- self-test ------------------------------------------------------------

async function runSelfTest() {
  const finish = async (pass, detail) => {
    console.log(`WEBCAMO_SELFTEST ${pass ? 'PASS' : 'FAIL'} mode=${mode} ${detail}`);
    quitting = true;
    await stopChild();
    app.exit(pass ? 0 : 1);
  };
  const timer = setTimeout(() => finish(false, `timeout; lastError=${lastError}`), 45_000);
  for (;;) {
    await sleep(500);
    if (!win || win.webContents.isLoading()) continue;
    const url = win.webContents.getURL();
    if (url.includes('error.html')) { clearTimeout(timer); return finish(false, `error page: ${lastError}`); }
    if (!url.startsWith(ORIGIN)) continue;
    break;
  }
  clearTimeout(timer);
  try {
    const r = await win.webContents.executeJavaScript(`(async () => {
      const ws = await new Promise((res) => {
        const s = new WebSocket('ws://' + location.host + '/api/ws');
        const t = setTimeout(() => res('timeout'), 5000);
        s.onopen = () => { clearTimeout(t); s.close(); res('open'); };
        s.onerror = () => { clearTimeout(t); res('error'); };
      });
      const status = await fetch('/api/status').then((x) => x.status, () => 0);
      const popup = window.open('https://example.com/');
      return { title: document.title, ws, status, popupBlocked: popup === null,
               node: typeof require !== 'undefined' || typeof process !== 'undefined' };
    })()`);
    // Navigation away from the daemon origin must be refused.
    await win.webContents.executeJavaScript(`location.href = 'https://example.com/'; 1`);
    await sleep(1000);
    const stayed = win.webContents.getURL().startsWith(ORIGIN);
    const pass = r.title === 'mobile_webcam' && r.ws === 'open' && r.status === 200 && r.popupBlocked && !r.node && stayed;
    await finish(pass, JSON.stringify({ ...r, navigationBlocked: stayed, childPid: child?.pid ?? null }));
  } catch (e) {
    await finish(false, `executeJavaScript failed: ${e.message}`);
  }
}

// ---- app lifecycle --------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.on('before-quit', (e) => {
    if (quitting) return;
    e.preventDefault();
    quitting = true;
    stopChild().then(() => app.quit());
  });

  app.on('window-all-closed', () => app.quit());
  app.on('activate', showWindow); // macOS dock click

  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.quit());

  ipcMain.on('webcamo:retry', (e) => {
    if (!isAllowedUrl(e.senderFrame?.url ?? '')) return;
    attempts = 0;
    bringUp();
  });
  ipcMain.on('webcamo:open-log', (e) => {
    if (!isAllowedUrl(e.senderFrame?.url ?? '') || !logPath) return;
    shell.showItemInFolder(logPath);
  });

  app.whenReady().then(() => {
    const logDir = app.getPath('logs');
    mkdirSync(logDir, { recursive: true });
    logPath = join(logDir, 'webcamo-daemon.log');
    logStream = createWriteStream(logPath, { flags: 'a' });
    log(`Webcamo desktop ${app.getVersion()} (electron ${process.versions.electron}); log: ${logPath}`);

    // The only browser permission the dashboard gets: video capture, so its
    // preview can show the virtual camera. Never the microphone, never other
    // origins, never anything else.
    const isDashboard = (url) => { try { return new URL(url).origin === ORIGIN; } catch { return false; } };
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => {
      const videoOnly = perm === 'media'
        && Array.isArray(details?.mediaTypes) && details.mediaTypes.length > 0
        && details.mediaTypes.every((t) => t === 'video');
      cb(videoOnly && isDashboard(details?.requestingUrl || wc.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, perm, origin, details) =>
      perm === 'media' && details?.mediaType === 'video' && isDashboard(origin));

    createWindow();
    createTray();
    bringUp();
    if (SELFTEST) runSelfTest();
  });
}
