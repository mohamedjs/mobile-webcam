// Webcamo landing page: language, theme, OS detection, live download links.
"use strict";

const REPO = "mohamedjs/mobile-webcam";
const FALLBACK_VERSION = "v0.1.0";

const T = {
  en: {
    "nav.download": "Download",
    "nav.features": "Features",
    "nav.mobile": "Mobile Apps",
    "nav.faq": "FAQ",
    "nav.github": "GitHub",

    "hero.badge": "Zero Cloud · Hardware H.264 · 50ms Latency",
    "hero.title": "Turn your phone into a studio webcam over USB.",
    "hero.lead": "Broadcast pristine 4K & 1080p60 video with ultra-low latency. Hardware encoded directly on your iPhone or Android, streamed over cable straight to Zoom, Meet, Teams, and OBS.",
    "hero.download": "Download for {os}",
    "hero.other": "Other platforms",
    "hero.mobileNotice": "Webcamo desktop app runs on your computer — install the mobile app below.",
    "hero.version": "Version {v} · 100% Local & Free",

    "dl.title": "Download Webcamo",
    "dl.sub": "Free, open source, and private. Connect with a USB cable for crystal-clear video and synchronized microphone.",
    "dl.yours": "Your Computer",
    "dl.copy": "Copy",
    "dl.copied": "Copied!",

    "dl.win.title": "Windows",
    "dl.win.req": "Windows 10 or 11 (64-bit)",
    "dl.win.setup": "Download Installer (.exe)",
    "dl.win.portable": "Portable Zip (.zip)",
    "dl.win.cmd": "winget install mohamedjs.webcamo",
    "dl.win.note": "Windows SmartScreen may prompt on new releases: click More info → Run anyway.",

    "dl.mac.title": "macOS",
    "dl.mac.req": "macOS 12 Monterey or later",
    "dl.mac.dmg": "Download for Mac (.dmg)",
    "dl.mac.arm": "Apple Silicon (M1–M4)",
    "dl.mac.intel": "Intel Mac",
    "dl.mac.cmd": "brew install mohamedjs/tap/webcamo",

    "dl.linux.title": "Linux",
    "dl.linux.req": "Ubuntu, Debian, Fedora & Arch (64-bit)",
    "dl.linux.deb": "Download .deb Package",
    "dl.linux.tar": "Universal Tarball (.tar.gz)",
    "dl.linux.cmd": "sudo apt install ./webcamo_*_amd64.deb",
    "dl.linux.note": "Creates virtual video device /dev/video9 via v4l2loopback and PipeWire mic.",

    "mobile.title": "Companion Mobile Apps",
    "mobile.sub": "Runs locally on your phone. Hardware H.264 fMP4 encoder and high-performance camera server.",
    "mobile.android.title": "Android",
    "mobile.android.req": "Android 8.0 (Oreo) or later (API 26+)",
    "mobile.android.apk": "Download Android APK",
    "mobile.android.feat": "Camera2 hardware encoder, zero-copy MediaCodec, USB Debugging (ADB forward).",
    "mobile.ios.title": "iOS",
    "mobile.ios.req": "iOS 16.4 or later",
    "mobile.ios.app": "Download on App Store / TestFlight",
    "mobile.ios.feat": "AVFoundation 4K60, VideoToolbox hardware encoder, usbmuxd tunnel.",

    "feat.title": "Built for Broadcast Quality",
    "feat.sub": "Engineered without shortcuts. No flaky Wi-Fi, no battery overheating, and no cloud middlemen.",
    "feat.1.t": "Rock-Solid USB Cable",
    "feat.1.d": "Direct host-to-device streaming over USB. No Wi-Fi congestion, no jitter, and phone stays charged during long meetings.",
    "feat.2.t": "Zero Cloud, 100% Private",
    "feat.2.d": "Runs purely on localhost (127.0.0.1). No analytics, no tracking, no external accounts, and no telemetry leaves your machine.",
    "feat.3.t": "Hardware Video & Audio",
    "feat.3.d": "Encodes in hardware on the phone (H.264/AAC fMP4) and writes to native virtual webcam and virtual microphone devices.",
    "feat.4.t": "Camera Controls in Real-Time",
    "feat.4.d": "Switch lenses (Wide, Ultra-Wide, Telephoto), adjust zoom, exposure, bitrate, torch, and orientation live from your desktop.",
    "feat.5.t": "Background Blur & Bokeh",
    "feat.5.d": "Built-in real-time person segmentation and cinematic depth blur with live intensity control.",
    "feat.6.t": "Chromeless Desktop App",
    "feat.6.d": "Lightweight native desktop window powered by your system's browser runtime. Zero heavy Electron overhead.",

    "faq.title": "Frequently Asked Questions",
    "faq.1.q": "Why USB cable instead of Wi-Fi?",
    "faq.1.a": "Wi-Fi connections suffer from packet loss, channel interference, and latency spikes. A USB cable guarantees continuous 50ms latency, zero dropped frames, and keeps your phone fully charged.",
    "faq.2.q": "Does Webcamo send any video or data to the cloud?",
    "faq.2.a": "Never. Webcamo operates strictly over local loopback (127.0.0.1) between your phone and your computer. It requires zero internet access to stream.",
    "faq.3.q": "Will my phone overheat during long calls?",
    "faq.3.a": "Webcamo utilizes dedicated on-chip hardware encoding (MediaCodec on Android, VideoToolbox on iOS) and automatically sleeps the phone screen while keeping the camera sensor active.",
    "faq.4.q": "Can I use the phone's microphone for meetings?",
    "faq.4.a": "Yes! Webcamo captures synchronized high-fidelity AAC audio from your phone and registers a virtual microphone on your operating system (PipeWire on Linux, BlackHole on macOS, VB-Cable on Windows).",
    "faq.5.q": "Which video apps are supported?",
    "faq.5.a": "Because Webcamo exposes standard system virtual camera and audio devices, it works automatically in Google Meet, Zoom, Microsoft Teams, Discord, OBS Studio, and WebRTC browsers.",

    "foot.copy": "Webcamo is open source under the MIT license.",
    "foot.made": "Crafted for privacy, quality, and simplicity.",
  },
  ar: {
    "nav.download": "التحميل",
    "nav.features": "المميزات",
    "nav.mobile": "تطبيقات الموبايل",
    "nav.faq": "الأسئلة الشائعة",
    "nav.github": "جيت هاب",

    "hero.badge": "بدون سحابة · تشفير عتادي H.264 · تأخير 50 ملي ثانية فقط",
    "hero.title": "حوّل موبايلك لكاميرا احترافية فائقة الجودة عبر كابل الـ USB.",
    "hero.lead": "بث فيديو نقي بدقة 4K و 1080p60 مع استجابة فورية بدون أي تأخير. تشفير عتادي مباشر على معالج آيفون أو أندرويد عبر الكابل مباشرة لبرامج Zoom و Meet و Teams و OBS.",
    "hero.download": "تحميل لنظام {os}",
    "hero.other": "أنظمة أخرى",
    "hero.mobileNotice": "تطبيق ويبكامو المكتبي يعمل على الكمبيوتر — حمّل تطبيق الموبايل بالأسفل.",
    "hero.version": "الإصدار {v} · مجاني ومحلي 100%",

    "dl.title": "تحميل ويبكامو",
    "dl.sub": "مجاني ومفتوح المصدر وخاص تماماً. وصّل الموبايل بكابل USB واستمتع بكاميرا ومايكروفون عالي النقاء.",
    "dl.yours": "نظام جهازك",
    "dl.copy": "نسخ",
    "dl.copied": "تم النسخ!",

    "dl.win.title": "ويندوز",
    "dl.win.req": "ويندوز 10 أو 11 (64 بت)",
    "dl.win.setup": "تحميل برنامج التثبيت (.exe)",
    "dl.win.portable": "نسخة محمولة (.zip)",
    "dl.win.cmd": "winget install mohamedjs.webcamo",
    "dl.win.note": "قد تظهر رسالة الحماية من ويندوز: اضغط على More info ثم Run anyway.",

    "dl.mac.title": "ماك",
    "dl.mac.req": "macOS 12 أو أحدث",
    "dl.mac.dmg": "تحميل لأجهزة الماك (.dmg)",
    "dl.mac.arm": "معالجات Apple Silicon (M1–M4)",
    "dl.mac.intel": "أجهزة ماك Intel",
    "dl.mac.cmd": "brew install mohamedjs/tap/webcamo",

    "dl.linux.title": "لينكس",
    "dl.linux.req": "أوبونتو، ديبيان، فيدورا وآرش (64 بت)",
    "dl.linux.deb": "تحميل حزمة .deb",
    "dl.linux.tar": "ملف أرشيف عام (.tar.gz)",
    "dl.linux.cmd": "sudo apt install ./webcamo_*_amd64.deb",
    "dl.linux.note": "ينشئ كاميرا افتراضية /dev/video9 عبر v4l2loopback ومايكروفون عبر PipeWire.",

    "mobile.title": "تطبيقات الموبايل",
    "mobile.sub": "يعمل محلياً على هاتفك بأعلى كفاءة وسرعة عبر معالج الرسوميات وبدون استهلاك للبطارية.",
    "mobile.android.title": "أندرويد",
    "mobile.android.req": "أندرويد 8.0 أو أحدث (API 26+)",
    "mobile.android.apk": "تحميل ملف APK للأندرويد",
    "mobile.android.feat": "دعم Camera2 وتشفير عتادي كامل عبر MediaCodec وتوصيل ADB عبر USB.",
    "mobile.ios.title": "آيفون (iOS)",
    "mobile.ios.req": "iOS 16.4 أو أحدث",
    "mobile.ios.app": "تحميل عبر App Store / TestFlight",
    "mobile.ios.feat": "دقة 4K60 عبر AVFoundation وتشفير عتادي VideoToolbox ونفق usbmuxd سريع.",

    "feat.title": "مصمم للبث الاحترافي",
    "feat.sub": "مبني بدون تنازلات: لا انقطاع في الواي فاي، ولا سخونة في البطارية، ولا خوادم وسيطة.",
    "feat.1.t": "كابل USB فائق الاستقرار",
    "feat.1.d": "بث مباشر عبر الكابل بدون زحام شبكات الواي فاي وبدون تقطيع، مع شحن الهاتف طوال فترة الاجتماع.",
    "feat.2.t": "بدون سحابة وخاص 100%",
    "feat.2.d": "يعمل محلياً بالكامل على 127.0.0.1. لا توجد أي تحليلات ولا تتبع ولا تتطلب أي حساب خارجي.",
    "feat.3.t": "فيديو وصوت مشفر عتادياً",
    "feat.3.d": "تشفير عتادي على معالج الموبايل (H.264/AAC fMP4) مع إرسال مباشر لكاميرا ومايكروفون النظام الافتراضي.",
    "feat.4.t": "تحكم كامل بالكاميرا من الكمبيوتر",
    "feat.4.d": "تنقل بين العدسات (الواسعة، المقربة، السيلفي)، وتحكم في الزووم والإضاءة والإطار والفلاش مباشرة من الشاشة.",
    "feat.5.t": "عزل الخلفية وضبابية سينمائية",
    "feat.5.d": "عزل ذكي للأشخاص في الوقت الفعلي مع تحكم مرن في قوة التعتيم والضبابية السينمائية.",
    "feat.6.t": "تطبيق مكتبي خفيف جداً",
    "feat.6.d": "نافذة مكتبية بدون متصفح ثقيل (صفر إلكترون)، مبنية على محرك النظام الأصلي لتوفير الرام والبطارية.",

    "faq.title": "الأسئلة الشائعة",
    "faq.1.q": "ليه كابل USB مش واي فاي؟",
    "faq.1.a": "شبكات الواي فاي بتعاني من تقطيع وتأخير وبتسحب بطارية الموبايل بسرعة. كابل الـ USB بيضمن استجابة فورية 50 ملي ثانية وبدون أي سقوط للفريمات مع شحن الموبايل في نفس الوقت.",
    "faq.2.q": "هل بيتم إرسال أي فيديو أو بيانات للإنترنت؟",
    "faq.2.a": "نهائياً. ويبكامو بيشتغل داخلياً فقط بين الموبايل والكمبيوتر عبر الشبكة المحلية (127.0.0.1)، ومبيحتاجش إنترنت أصلاً عشان يشتغل.",
    "faq.3.q": "هل الموبايل هيسخن في المكالمات الطويلة؟",
    "faq.3.a": "ويبكامو بيستخدم التشفير العتادي المدمج في معالج الموبايل (MediaCodec في أندرويد و VideoToolbox في آبل)، مع إطفاء شاشة الموبايل تلقائياً للحفاظ على برودته والبطارية.",
    "faq.4.q": "أقدر أستخدم مايك الموبايل في الاجتماعات؟",
    "faq.4.a": "أيوه! التطبيق بيبث الصوت من مايكروفون الموبايل بجودة AAC نقية جداً ومتزامنة تماماً مع الفيديو، وبيتعرف في النظام كمايكروفون افتراضي.",
    "faq.5.q": "إيه البرامج اللي بيشتغل معاها؟",
    "faq.5.a": "بيشتغل مع كل البرامج زي Zoom و Google Meet و Microsoft Teams و Discord و OBS Studio وأي متصفح بيدعم كاميرا الويب.",

    "foot.copy": "ويبكامو برنامج مفتوح المصدر برخصة MIT.",
    "foot.made": "صُنع بعناية للخصوصية والأداء العالي والبساطة.",
  },
};

const OS_NAMES = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  android: "Android",
  ios: "iOS",
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let currentLang = store.get("webcamo-lang") || ((navigator.language || "").startsWith("ar") ? "ar" : "en");
let currentTheme = store.get("webcamo-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
let releaseData = null;
const userOS = detectOS();

function detectOS() {
  const ua = navigator.userAgent || "";
  const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/win/i.test(p) || /windows/i.test(ua)) return "windows";
  if (/mac/i.test(p) || /mac os x/i.test(ua)) return "macos";
  if (/linux|x11|cros/i.test(p + ua)) return "linux";
  return "windows";
}

function t(key, vars = {}) {
  let s = (T[currentLang] && T[currentLang][key]) || T.en[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, v);
  }
  return s;
}

function applyLanguage(lang) {
  currentLang = lang;
  store.set("webcamo-lang", lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";

  const osDisplayName = OS_NAMES[userOS] || "Desktop";
  const version = releaseData?.tag_name || FALLBACK_VERSION;

  $$("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key, { os: osDisplayName, v: version });
  });

  const langBtn = $("#btn-lang-toggle");
  if (langBtn) langBtn.textContent = lang === "ar" ? "English" : "العربية";
}

function applyTheme(theme) {
  currentTheme = theme;
  store.set("webcamo-theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
  const themeBtn = $("#btn-theme-toggle");
  if (themeBtn) themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

// ── Release asset resolution ──
const ASSET_PATTERNS = {
  winSetup: /^webcamo.*setup.*\.exe$/i,
  winZip: /^webcamo.*windows.*\.zip$/i,
  macDmg: /^webcamo.*\.dmg$/i,
  macZip: /^webcamo.*macos.*\.zip$/i,
  linuxDeb: /^webcamo.*\.deb$/i,
  linuxTar: /^webcamo.*linux.*\.tar\.gz$/i,
  androidApk: /^webcamo.*\.apk$/i,
};

async function fetchLatestRelease() {
  for (const url of ["release.json", `https://api.github.com/repos/${REPO}/releases/latest`]) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        releaseData = await res.json();
        break;
      }
    } catch {}
  }

  const version = releaseData?.tag_name || FALLBACK_VERSION;
  const assets = releaseData?.assets || [];

  function findUrl(pattern, fallback) {
    const found = assets.find((a) => pattern.test(a.name));
    return found ? found.browser_download_url : fallback;
  }

  const baseReleaseUrl = `https://github.com/${REPO}/releases/download/${version}`;

  const urls = {
    winSetup: findUrl(ASSET_PATTERNS.winSetup, `${baseReleaseUrl}/webcamo-setup-${version}.exe`),
    winZip: findUrl(ASSET_PATTERNS.winZip, `${baseReleaseUrl}/webcamo-windows-x64-${version}.zip`),
    macDmg: findUrl(ASSET_PATTERNS.macDmg, `${baseReleaseUrl}/webcamo-${version}.dmg`),
    linuxDeb: findUrl(ASSET_PATTERNS.linuxDeb, `${baseReleaseUrl}/webcamo_${version}_amd64.deb`),
    linuxTar: findUrl(ASSET_PATTERNS.linuxTar, `${baseReleaseUrl}/webcamo-linux-x64-${version}.tar.gz`),
    androidApk: findUrl(ASSET_PATTERNS.androidApk, `${baseReleaseUrl}/webcamo-${version}.apk`),
  };

  // Wire download links
  const setLink = (id, url) => {
    const el = document.getElementById(id);
    if (el) el.href = url;
  };

  setLink("dl-win-setup", urls.winSetup);
  setLink("dl-win-portable", urls.winZip);
  setLink("dl-mac-dmg", urls.macDmg);
  setLink("dl-linux-deb", urls.linuxDeb);
  setLink("dl-linux-tar", urls.linuxTar);
  setLink("dl-android-apk", urls.androidApk);

  // Wire Hero button
  const heroBtn = $("#hero-dl-btn");
  if (heroBtn) {
    if (userOS === "windows") heroBtn.href = urls.winSetup;
    else if (userOS === "macos") heroBtn.href = urls.macDmg;
    else if (userOS === "linux") heroBtn.href = urls.linuxDeb;
    else if (userOS === "android") heroBtn.href = urls.androidApk;
    else heroBtn.href = "#downloads";
  }
}

function setupOSHighlight() {
  const card = $(`[data-os-card="${userOS}"]`);
  if (card) {
    card.classList.add("mine");
    const badge = card.querySelector(".badge");
    if (badge) badge.style.display = "inline-block";
  }
}

function setupClipboard() {
  $$(".copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.closest(".cmd")?.querySelector("code")?.textContent || "";
      try {
        await navigator.clipboard.writeText(code);
        const originalText = btn.textContent;
        btn.textContent = t("dl.copied");
        setTimeout(() => { btn.textContent = originalText; }, 2000);
      } catch {}
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(currentTheme);
  applyLanguage(currentLang);
  setupOSHighlight();
  setupClipboard();
  fetchLatestRelease();

  $("#btn-lang-toggle")?.addEventListener("click", () => {
    applyLanguage(currentLang === "ar" ? "en" : "ar");
  });

  $("#btn-theme-toggle")?.addEventListener("click", () => {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });
});
