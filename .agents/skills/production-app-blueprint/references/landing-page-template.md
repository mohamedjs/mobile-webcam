# Production Landing Page Reference (`site/` + `.github/workflows/pages.yml`)

Zero-dependency, bilingual (EN/AR with RTL support), light/dark/auto themed static landing page with automatic OS detection and live GitHub Release asset binding.

---

## 1. `site/index.html` Template

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AppName — Tagline</title>
<meta name="description" content="App description for Windows, macOS, Linux, iOS, and Android.">
<meta property="og:title" content="AppName — Tagline">
<meta property="og:description" content="App description.">
<meta property="og:image" content="assets/intro-en.jpg">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f4f5f9">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="site.css">
<script src="site.js" defer></script>
</head>
<body>
<div class="paper">

<nav class="nav">
  <a class="brand" href="#top"><img src="assets/favicon.svg" alt="" class="logo"><span data-i18n="brand.name">AppName</span></a>
  <div class="links">
    <a href="#download" data-i18n="nav.download"></a>
    <a href="#features" data-i18n="nav.features"></a>
    <a href="#open" data-i18n="nav.open"></a>
    <a href="#faq" data-i18n="nav.faq"></a>
  </div>
  <div class="nav-actions">
    <div class="seg small" id="lang" role="group" aria-label="Language"><button data-value="en">EN</button><button data-value="ar">ع</button></div>
    <button class="icon-btn" id="theme" aria-label="Theme">◐</button>
  </div>
</nav>

<header class="hero" id="top">
  <div class="hero-copy">
    <h1 data-i18n="hero.title"></h1>
    <p class="lead" data-i18n="hero.lead"></p>
    <div class="row">
      <a class="btn primary big" id="hero-download" href="#download"><span class="os-icon" id="hero-icon"></span><span id="hero-download-text"></span></a>
      <a class="btn ghost" href="#download" data-i18n="hero.other"></a>
    </div>
    <p class="hint" id="hero-version"></p>
  </div>
  <div class="hero-face card">
    <canvas id="hero-canvas" width="520" height="520" aria-hidden="true"></canvas>
    <div class="say"><span class="dot"></span><span data-i18n="hero.badge"></span></div>
  </div>
</header>

<section id="download" class="section">
  <h2 data-i18n="dl.title"></h2>
  <p class="sub" data-i18n="dl.sub"></p>
  <div class="grid3" id="platforms">
    <article class="card platform" data-os="windows">
      <div class="os-head"><span class="os-icon win"></span><h3>Windows</h3><span class="badge" data-i18n="dl.yours"></span></div>
      <p class="hint" data-i18n="dl.win.req"></p>
      <a class="btn primary block" data-asset="setup" data-i18n="dl.win.setup"></a>
      <a class="btn ghost block" data-asset="portable" data-i18n="dl.win.portable"></a>
      <p class="note" data-i18n="dl.win.note"></p>
    </article>
    <article class="card platform" data-os="macos">
      <div class="os-head"><span class="os-icon mac"></span><h3>macOS</h3><span class="badge" data-i18n="dl.yours"></span></div>
      <p class="hint" data-i18n="dl.mac.req"></p>
      <a class="btn primary block" data-asset="mac-arm" data-i18n="dl.mac.arm"></a>
      <a class="btn ghost block" data-asset="mac-intel" data-i18n="dl.mac.intel"></a>
      <div class="cmd"><code id="brew-cmd">brew install --cask owner/tap/app</code><button class="copy" data-i18n="dl.copy"></button></div>
    </article>
    <article class="card platform" data-os="linux">
      <div class="os-head"><span class="os-icon linux"></span><h3>Linux</h3><span class="badge" data-i18n="dl.yours"></span></div>
      <p class="hint" data-i18n="dl.linux.req"></p>
      <a class="btn primary block" data-asset="deb" data-i18n="dl.linux.deb"></a>
      <a class="btn ghost block" data-asset="tar" data-i18n="dl.linux.tar"></a>
      <div class="cmd"><code id="apt-cmd">sudo apt install ./app_amd64.deb</code><button class="copy" data-i18n="dl.copy"></button></div>
    </article>
  </div>
  <p class="center hint"><a id="all-releases" target="_blank" rel="noopener" data-i18n="dl.all"></a> · <a id="checksums" target="_blank" rel="noopener">SHA256</a></p>
</section>

<section class="section" id="how">
  <h2 data-i18n="how.title"></h2>
  <div class="steps">
    <div class="card step"><span class="num">1</span><h3 data-i18n="how.1.t"></h3><p data-i18n="how.1.d"></p></div>
    <div class="card step"><span class="num">2</span><h3 data-i18n="how.2.t"></h3><p data-i18n="how.2.d"></p></div>
    <div class="card step"><span class="num">3</span><h3 data-i18n="how.3.t"></h3><p data-i18n="how.3.d"></p></div>
  </div>
</section>

<section class="section" id="features">
  <h2 data-i18n="feat.title"></h2>
  <div class="grid3">
    <div class="card feat"><span class="emoji">⚡</span><h3 data-i18n="feat.1.t"></h3><p data-i18n="feat.1.d"></p></div>
    <div class="card feat"><span class="emoji">🎥</span><h3 data-i18n="feat.2.t"></h3><p data-i18n="feat.2.d"></p></div>
    <div class="card feat"><span class="emoji">🎙️</span><h3 data-i18n="feat.3.t"></h3><p data-i18n="feat.3.d"></p></div>
    <div class="card feat"><span class="emoji">🔌</span><h3 data-i18n="feat.4.t"></h3><p data-i18n="feat.4.d"></p></div>
    <div class="card feat"><span class="emoji">🖥️</span><h3 data-i18n="feat.5.t"></h3><p data-i18n="feat.5.d"></p></div>
    <div class="card feat"><span class="emoji">🛡️</span><h3 data-i18n="feat.6.t"></h3><p data-i18n="feat.6.d"></p></div>
  </div>
</section>

<section class="section" id="open">
  <div class="card open">
    <div>
      <h2 data-i18n="open.title"></h2>
      <p class="lead" data-i18n="open.lead"></p>
      <ul class="ticks"><li data-i18n="open.f1"></li><li data-i18n="open.f2"></li><li data-i18n="open.f3"></li></ul>
    </div>
    <div class="open-actions">
      <a class="btn primary" id="repo-link" target="_blank" rel="noopener" data-i18n="open.cta"></a>
      <p class="hint" data-i18n="open.note"></p>
    </div>
  </div>
</section>

<section class="section" id="faq">
  <h2 data-i18n="faq.title"></h2>
  <div class="faq">
    <details class="card"><summary data-i18n="faq.1.q"></summary><p data-i18n="faq.1.a"></p></details>
    <details class="card"><summary data-i18n="faq.2.q"></summary><p data-i18n="faq.2.a"></p></details>
    <details class="card"><summary data-i18n="faq.3.q"></summary><p data-i18n="faq.3.a"></p></details>
  </div>
</section>

<footer class="foot">
  <img src="assets/favicon.svg" alt="" class="logo small">
  <p><span data-i18n="foot.made"></span> · <a id="foot-repo" target="_blank" rel="noopener">GitHub</a> · <span id="foot-version"></span></p>
</footer>
</div>
</body>
</html>
```

---

## 2. `site/site.js` Template (OS Detection, i18n, Theme, Live Release Assets)

```js
"use strict";

const REPO = "mohamedjs/your-repo"; // <-- Replace with owner/repo
const STORAGE_PREFIX = "app";       // <-- Replace with app slug

const T = {
  en: {
    "brand.name": "AppName",
    "nav.download": "Download", "nav.features": "Features", "nav.open": "Open source", "nav.faq": "FAQ",
    "hero.title": "Headline here.",
    "hero.lead": "Lead description here.",
    "hero.download": "Download for {os}", "hero.other": "Other platforms", "hero.badge": "Ready",
    "hero.version": "Version {v} · free & open source",
    "hero.mobile": "Download the companion app or open on your computer.",
    "dl.title": "Download", "dl.sub": "Free for Windows, macOS and Linux.",
    "dl.yours": "your device", "dl.copy": "Copy", "dl.copied": "Copied",
    "dl.win.req": "Windows 10 or 11, 64-bit", "dl.win.setup": "Download installer", "dl.win.portable": "Portable zip (no install)",
    "dl.win.note": "Windows may show “Windows protected your PC” for new apps: choose More info → Run anyway.",
    "dl.mac.req": "macOS 12 Monterey or later", "dl.mac.arm": "Apple Silicon (M1–M4)", "dl.mac.intel": "Intel Mac",
    "dl.linux.req": "Ubuntu, Debian and friends, 64-bit", "dl.linux.deb": "Download .deb", "dl.linux.tar": "Other distros (.tar.gz)",
    "dl.all": "All releases",
  },
  ar: {
    "brand.name": "اسم التطبيق",
    "nav.download": "التحميل", "nav.features": "المميزات", "nav.open": "مفتوح المصدر", "nav.faq": "أسئلة",
    "hero.title": "العنوان الرئيسي هنا.",
    "hero.lead": "وصف التطبيق بالعربي هنا.",
    "hero.download": "حمّل لـ {os}", "hero.other": "أنظمة تانية", "hero.badge": "جاهز",
    "hero.version": "إصدار {v} · مجاني ومفتوح المصدر",
    "hero.mobile": "حمّل تطبيق الموبايل أو افتح الصفحة من الكمبيوتر.",
    "dl.title": "التحميل", "dl.sub": "مجاني على ويندوز وماك ولينكس.",
    "dl.yours": "جهازك", "dl.copy": "انسخ", "dl.copied": "اتنسخ",
    "dl.win.req": "ويندوز 10 أو 11، 64-bit", "dl.win.setup": "حمّل ملف التسطيب", "dl.win.portable": "نسخة محمولة (من غير تسطيب)",
    "dl.win.note": "ممكن ويندوز يقولك «Windows protected your PC» للبرامج الجديدة: اختار More info وبعدين Run anyway.",
    "dl.mac.req": "macOS 12 أو أحدث", "dl.mac.arm": "Apple Silicon (M1–M4)", "dl.mac.intel": "ماك Intel",
    "dl.linux.req": "أوبونتو وديبيان وأخواتهم، 64-bit", "dl.linux.deb": "حمّل ‎.deb", "dl.linux.tar": "توزيعات تانية (.tar.gz)",
    "dl.all": "كل الإصدارات",
  },
};

const OS_NAME = { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android" };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let lang = store.get(`${STORAGE_PREFIX}-lang`) || ((navigator.language || "").startsWith("ar") ? "ar" : "en");
let release = null;
const OS = detectOS();

function t(key, vars = {}) {
  let s = (T[lang] && T[lang][key]) || T.en[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function detectOS() {
  const ua = navigator.userAgent || "";
  const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "mobile";
  if (/win/i.test(p) || /windows/i.test(ua)) return "windows";
  if (/mac/i.test(p) || /mac os x/i.test(ua)) return "macos";
  if (/linux|x11|cros/i.test(p + ua)) return "linux";
  return "windows";
}

const PICK = {
  setup: /-Setup-.*\.exe$/i,
  portable: /windows-x64-portable\.zip$/i,
  "mac-arm": /macos-arm64\.zip$/i,
  "mac-intel": /macos-x86_64\.zip$/i,
  deb: /_amd64\.deb$/i,
  tar: /linux-x86_64\.tar\.gz$/i,
  apk: /-android\.apk$/i,
  sums: /^SHA256SUMS/i,
};
const HERO_ASSET = { windows: "setup", macos: "mac-arm", linux: "deb", android: "apk" };

async function loadRelease() {
  for (const url of ["release.json", `https://api.github.com/repos/${REPO}/releases/latest`]) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        if (data && data.assets) return data;
      }
    } catch {}
  }
  return null;
}

function asset(kind) {
  return release && release.assets.find((a) => PICK[kind] && PICK[kind].test(a.name));
}

function renderDownloads() {
  const fallback = `https://github.com/${REPO}/releases/latest`;
  if ($("#all-releases")) $("#all-releases").href = `https://github.com/${REPO}/releases`;
  if ($("#repo-link")) $("#repo-link").href = `https://github.com/${REPO}`;
  if ($("#foot-repo")) $("#foot-repo").href = `https://github.com/${REPO}`;

  $$("[data-asset]").forEach((el) => {
    const a = asset(el.dataset.asset);
    const label = t(el.dataset.i18n);
    el.href = a ? a.browser_download_url : fallback;
    el.innerHTML = "";
    el.append(label);
    if (a) {
      const s = document.createElement("small");
      s.textContent = ` · ${(a.size / 1e6).toFixed(0)} MB`;
      el.append(s);
    }
  });

  const sums = asset("sums");
  if ($("#checksums")) $("#checksums").href = sums ? sums.browser_download_url : fallback;
  const deb = asset("deb");
  if (deb && $("#apt-cmd")) $("#apt-cmd").textContent = `sudo apt install ./${deb.name}`;

  const v = release ? release.tag_name.replace(/^v/, "") : "";
  if ($("#hero-version")) {
    $("#hero-version").textContent = OS === "mobile" ? t("hero.mobile") : v ? t("hero.version", { v }) : "";
  }
  if ($("#foot-version")) $("#foot-version").textContent = v ? `v${v}` : "";

  $$(".platform").forEach((card) => card.classList.toggle("mine", card.dataset.os === OS));
  const hero = $("#hero-download");
  if (hero) {
    if (OS in HERO_ASSET) {
      const a = asset(HERO_ASSET[OS]);
      hero.href = a ? a.browser_download_url : "#download";
      $("#hero-icon").dataset.os = OS;
      $("#hero-icon").hidden = false;
      $("#hero-download-text").textContent = t("hero.download", { os: OS_NAME[OS] });
    } else {
      hero.href = "#download";
      $("#hero-icon").hidden = true;
      $("#hero-download-text").textContent = t("dl.title");
    }
  }
}

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  $$("[data-i18n]").forEach((el) => {
    if (!el.dataset.asset) el.textContent = t(el.dataset.i18n);
  });
  $$("#lang button").forEach((b) => b.classList.toggle("on", b.dataset.value === lang));
  document.title = `${t("brand.name")} — ${t("hero.title").replace(/\.$/, "")}`;
  renderDownloads();
}

function applyTheme() {
  const theme = store.get(`${STORAGE_PREFIX}-theme`) || "auto";
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  applyLang();
  $$("#lang button").forEach((b) => (b.onclick = () => {
    lang = b.dataset.value;
    store.set(`${STORAGE_PREFIX}-lang`, lang);
    applyLang();
  }));
  $("#theme").onclick = () => {
    const order = ["auto", "dark", "light"];
    const now = store.get(`${STORAGE_PREFIX}-theme`) || "auto";
    store.set(`${STORAGE_PREFIX}-theme`, order[(order.indexOf(now) + 1) % order.length]);
    applyTheme();
  };
  $$(".copy").forEach((b) => (b.onclick = async () => {
    const code = b.parentElement.querySelector("code").textContent;
    try {
      await navigator.clipboard.writeText(code);
      b.textContent = t("dl.copied");
      setTimeout(() => (b.textContent = t("dl.copy")), 1500);
    } catch {}
  }));
  release = await loadRelease();
  renderDownloads();
});
```

---

## 3. `site/site.css` Reference

Copy `/var/www/html/lura/site/site.css` directly (uses `--bg`, `--surface`, `--sunken`, `--ink`, `--muted`, `--line`, `--accent`, `--accent-soft`, `--teal` CSS variables with `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` plus SVG masks for `.os-icon.win`, `.os-icon.mac`, `.os-icon.linux`).

---

## 4. `site/build.sh` & `.github/workflows/pages.yml`

### `site/build.sh`

```bash
#!/usr/bin/env bash
# Assemble the landing page into _site/ for GitHub Pages.
set -euo pipefail
REPO="mohamedjs/your-repo"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/_site"
rm -rf "$OUT"
mkdir -p "$OUT/assets/shots" "$OUT/fonts"
cp "$ROOT"/site/index.html "$ROOT"/site/site.css "$ROOT"/site/site.js "$OUT/"
[ -d "$ROOT/site/assets" ] && cp -r "$ROOT"/site/assets/. "$OUT/assets/"

if command -v curl >/dev/null; then
  auth=()
  [ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  curl -fsSL "${auth[@]}" "https://api.github.com/repos/$REPO/releases/latest" -o "$OUT/release.json" \
    || echo "warning: no release.json; the page will ask the GitHub API"
fi
touch "$OUT/.nojekyll"
echo "built $OUT ($(du -sh "$OUT" | cut -f1))"
```

### `.github/workflows/pages.yml`

```yaml
name: Landing page

on:
  push:
    branches: [main]
    paths: ["site/**", "docs/screenshots/**", ".github/workflows/pages.yml"]
  release:
    types: [published]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Assemble the site
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: site/build.sh
      - uses: actions/configure-pages@v5
        with: { enablement: true }
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
