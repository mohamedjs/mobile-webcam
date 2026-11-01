import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from '../../../kernel/logging/logger.js';

const SIZE = { width: 1220, height: 880 };
let activeWindow: ChildProcess | null = null;

export function findChromiumBrowsers(): string[] {
  if (process.platform === 'win32') {
    const roots = [
      process.env['PROGRAMFILES(X86)'] ?? '',
      process.env['PROGRAMFILES'] ?? '',
      process.env['LOCALAPPDATA'] ?? '',
    ].filter(Boolean);
    const rels = [
      'Microsoft\\Edge\\Application\\msedge.exe',
      'Google\\Chrome\\Application\\chrome.exe',
      'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];
    const found: string[] = [];
    for (const r of roots) {
      for (const rel of rels) {
        const full = join(r, rel);
        if (existsSync(full)) found.push(full);
      }
    }
    return found;
  }

  if (process.platform === 'darwin') {
    const apps = ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium'];
    return apps
      .map((a) => `/Applications/${a}.app/Contents/MacOS/${a}`)
      .filter((p) => existsSync(p));
  }

  // Linux
  const names = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
    'microsoft-edge-stable',
    'brave-browser',
  ];
  const found: string[] = [];
  for (const name of names) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) found.push(p);
    } catch {}
  }
  return found;
}

export function openFallbackBrowser(url: string, log?: Logger): void {
  log?.info({ url }, 'opening dashboard in system default browser');
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    log?.warn({ err }, 'failed to launch system default browser');
  }
}

export function launchNativeWindow(url: string, dataDir: string, log?: Logger): void {
  if (activeWindow && activeWindow.exitCode === null) {
    log?.debug('window already open');
    return;
  }

  const profileDir = join(dataDir, 'window-profile');
  try {
    mkdirSync(profileDir, { recursive: true });
  } catch {}

  const browsers = findChromiumBrowsers();
  for (const browser of browsers) {
    try {
      log?.info({ browser, url }, 'launching chromeless app window');
      const child = spawn(
        browser,
        [
          `--app=${url}`,
          `--window-size=${SIZE.width},${SIZE.height}`,
          `--user-data-dir=${profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
        ],
        {
          detached: process.platform !== 'win32',
          stdio: 'ignore',
          windowsHide: true,
        },
      );

      activeWindow = child;

      child.on('error', (err) => {
        log?.warn({ err }, 'app window crashed or failed to open; falling back to browser');
        activeWindow = null;
        openFallbackBrowser(url, log);
      });

      child.on('exit', (code) => {
        activeWindow = null;
        if (code !== 0 && code !== null) {
          log?.warn({ code }, 'app window exited with error; falling back to browser');
          openFallbackBrowser(url, log);
        }
      });

      child.unref();
      return;
    } catch {
      continue;
    }
  }

  openFallbackBrowser(url, log);
}

export class NativeWindowLauncher {
  readonly #log?: Logger;
  readonly #dataDir: string;

  constructor(deps?: { log?: Logger; dataDir?: string }) {
    this.#log = deps?.log;
    this.#dataDir = deps?.dataDir ?? (process.env.HOME ? join(process.env.HOME, '.local/share/webcamo') : '/tmp');
  }

  openAppWindowOrBrowser(url: string): void {
    launchNativeWindow(url, this.#dataDir, this.#log);
  }

  findChromium(): string | null {
    const list = findChromiumBrowsers();
    return list.length > 0 ? (list[0] ?? null) : null;
  }
}

