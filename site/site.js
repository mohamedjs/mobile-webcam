// Webcamo landing page: language, theme, OS detection, live download links.
"use strict";

const REPO = "mohamedjs/mobile-webcam";
const FALLBACK_VERSION = "v0.1.0";

const T = {
  ar: {
    "nav.demo": "الديمو",
    "nav.how": "إزاي",
    "nav.download": "التحميل",
    "nav.features": "المميزات",
    "nav.faq": "أسئلة",

    "hero.badge": "بالكابل بس · من غير واي فاي ولا أكونت ولا cloud",
    "hero.title": "موبايلك يبقى <em class=\"hl\">كاميرا ويب</em> بالكابل.",
    "hero.lead": "وصّل الآيفون أو الأندرويد، وZoom وMeet وOBS وأي برنامج كاميرا هيشوفوا كاميرا 1080p واضحة. الموبايل بيضغط الفيديو بالـ hardware ويبعته على الكابل، ومفيش حاجة بتطلع على الإنترنت.",
    "hero.download": "حمّل لـ {os}",
    "hero.watch": "شوف الديمو",
    "hero.note": "وصّله، وهو يتوصل لوحده",
    "hero.version": "الإصدار {v} · مفتوح المصدر",
    "hero.sticky": "آيفون حقيقي، ومكالمة حقيقية.",
    "hero.stickyNote": "بتأخير حوالي ٠٫٣ ثانية",

    "video.kick": "شوفه شغّال",
    "video.title": "شغّال قدامك بآيفون حقيقي",
    "video.sub": "جولة في 100 ثانية متصوّرة من البرنامج الحقيقي: توصّل الموبايل فيتوصل لوحده، تغيّر الريزوليوشن والزوم وإنت لايف، وتختار Webcamo في المكالمة.",

    "how.kick": "إزاي",
    "how.title": "تلات خطوات، مرة واحدة",
    "how.1.t": "نزّل برنامج الكمبيوتر",
    "how.1.d": "على ويندوز أو ماك أو لينكس. بيعمل كاميرا افتراضية تختارها من أي برنامج.",
    "how.2.t": "افتح Webcamo على الموبايل",
    "how.2.d": "ووصّل الكابل. البرنامج بيلاقي الموبايل ويبدأ الستريم لوحده.",
    "how.3.t": "اختاره في المكالمة",
    "how.3.d": "اختار «Mobile Webcam» من قايمة الكاميرات في Meet أو Zoom أو OBS، وخلاص.",

    "dl.kick": "التحميل",
    "dl.title": "نزّل Webcamo",
    "dl.sub": "مفتوح المصدر وخاص بيك. برنامج للكمبيوتر، وأبلكيشن للموبايل.",
    "dl.yours": "جهازك",
    "dl.yoursPhone": "موبايلك",
    "dl.copy": "انسخ",
    "dl.copied": "اتنسخ",
    "dl.win.title": "ويندوز",
    "dl.win.req": "ويندوز 10 أو 11 (64 بت)",
    "dl.win.setup": "نزّل الـ Installer (.exe)",
    "dl.win.portable": "نسخة Portable (.zip)",
    "dl.win.note": "ممكن ويندوز يظهر تحذير SmartScreen مع الإصدارات الجديدة: دوس More info وبعدين Run anyway.",
    "dl.mac.title": "ماك",
    "dl.mac.req": "macOS 12 أو أحدث",
    "dl.mac.arm": "Apple Silicon (M1–M4)",
    "dl.mac.intel": "ماك Intel",
    "dl.mac.note": "بيشتغل مع OBS Virtual Camera.",
    "dl.linux.title": "لينكس",
    "dl.linux.req": "أوبونتو وديبيان وفيدورا وآرش (64 بت)",
    "dl.linux.deb": "نزّل حزمة .deb",
    "dl.linux.tar": "أرشيف عام (.tar.gz)",
    "dl.linux.note": "بيعمل الكاميرا الافتراضية ‎/dev/video9 (v4l2loopback) ومايك على PipeWire.",

    "mobile.android.title": "أندرويد",
    "mobile.android.req": "أندرويد 8.0 أو أحدث",
    "mobile.android.feat": "Camera2 مع الـ hardware encoder، على adb (USB debugging).",
    "mobile.android.apk": "نزّل الـ APK",
    "mobile.android.note": "فعّل USB debugging من Developer options، ووصّل الكابل.",
    "mobile.ios.title": "آيفون",
    "mobile.ios.req": "iOS 16.4 أو أحدث",
    "mobile.ios.feat": "تصوير بـ AVFoundation وضغط بـ VideoToolbox، على usbmuxd.",
    "mobile.ios.app": "ابنيه من الكود (Xcode)",
    "mobile.ios.note": "وصّل الآيفون بكابل Lightning أو USB-C ودوس Trust This Computer.",

    "feat.kick": "ليه بيشتغل كويس",
    "feat.title": "معمول للمكالمات الطويلة",
    "feat.sub": "من غير واي فاي بيقطع، ولا أكونت، ولا cloud في النص.",
    "feat.1.t": "كابل، مش واي فاي",
    "feat.1.d": "الكمبيوتر بيسحب الستريم من الموبايل على الـ USB: مفيش تقطيع من الشبكة، والموبايل بيشحن طول المكالمة.",
    "feat.2.t": "خاص بيك من الأساس",
    "feat.2.d": "كل حاجة على 127.0.0.1 بين الموبايل والكمبيوتر. مفيش تتبع، ولا أكونت، ولا محتاج إنترنت.",
    "feat.3.t": "ضغط بالـ hardware",
    "feat.3.d": "الموبايل بيضغط H.264 بالـ hardware، والكمبيوتر بيكتبه على كاميرا افتراضية عادية أي برنامج يستخدمها.",
    "feat.4.t": "غيّر وإنت لايف",
    "feat.4.d": "الريزوليوشن والفريمات والعدسة والزوم والإضاءة والـ rotation من الكمبيوتر، والكاميرا ما بتختفيش من المكالمة.",
    "feat.5.t": "بيرجع لوحده",
    "feat.5.d": "الكابل اتشد أو الأبلكيشن اتقفل؟ بيتوصل تاني. ولو الموبايل سخن جدًا بيقلل الجودة، ويرجّعها لما يبرد.",
    "feat.6.t": "برنامج لكل نظام",
    "feat.6.d": "داشبورد فيه preview لايف للي المكالمة شايفاه، على ويندوز وماك ولينكس.",

    "faq.kick": "أسئلة",
    "faq.title": "أسئلة بتتسأل كتير",
    "faq.1.q": "ليه كابل USB مش واي فاي؟",
    "faq.1.a": "الواي فاي بيضيّع باكتات ويعمل تأخير مفاجئ وبيسحب بطارية الموبايل. على الكابل الستريم ثابت، والموبايل بيشحن، ومفيش حاجة بتخرج من مكتبك.",
    "faq.2.q": "هل Webcamo بيبعت أي فيديو للإنترنت؟",
    "faq.2.a": "لأ. بيشتغل بين الموبايل والكمبيوتر بس على 127.0.0.1، ومش محتاج إنترنت خالص.",
    "faq.3.q": "التأخير قد إيه؟",
    "faq.3.a": "حوالي 0.3 لـ 0.4 ثانية من الكاميرا لحد المكالمة، متقاس بآيفون حقيقي. 30 فريم كفاية جدًا لـ Meet وZoom، و60 أنعم لو بتسجّل.",
    "faq.4.q": "الموبايل هيسخن؟",
    "faq.4.a": "الموبايل بيستخدم الـ hardware encoder فالحمل قليل. ولو سخن جدًا، Webcamo بيقلل الجودة ويرجّعها لما يبرد.",
    "faq.5.q": "أقدر أستخدم مايك الموبايل؟",
    "faq.5.a": "على الآيفون أيوه: اسمح بالمايك لـ Webcamo، وهيظهر كمايك افتراضي على الكمبيوتر. الأندرويد بيبعت فيديو بس دلوقتي.",
    "faq.6.q": "بيشتغل مع أنهي برامج؟",
    "faq.6.a": "أي حاجة بتستخدم كاميرا: Google Meet وZoom وMicrosoft Teams وDiscord وOBS Studio والمتصفحات.",

    "final.title": "وصّل الكابل. الكاميرا جاهزة.",
    "final.sub": "نزّل برنامج الكمبيوتر، افتح Webcamo على الموبايل، واختاره في المكالمة الجاية.",
    "final.cta": "نزّل Webcamo",
    "foot.copy": "مفتوح المصدر على GitHub.",
  },
  en: {
    "nav.demo": "Demo",
    "nav.how": "How",
    "nav.download": "Download",
    "nav.features": "Features",
    "nav.faq": "FAQ",

    "hero.badge": "USB only · no Wi-Fi · no account · no cloud",
    "hero.title": "Your phone becomes a <em class=\"hl\">webcam</em> over USB.",
    "hero.lead": "Plug in your iPhone or Android phone and Zoom, Meet, OBS and any camera app see a sharp 1080p camera. The phone encodes the video in hardware and sends it over the cable; nothing goes to the internet.",
    "hero.download": "Download for {os}",
    "hero.watch": "Watch the demo",
    "hero.note": "plug it in, it connects by itself",
    "hero.version": "Version {v} · open source",
    "hero.sticky": "Real iPhone, real call.",
    "hero.stickyNote": "1080p · about 0.3 s delay",

    "video.kick": "watch it",
    "video.title": "See it working with a real iPhone",
    "video.sub": "A 100-second tour filmed from the real app: plug in the phone, it connects by itself, change resolution and zoom live, then pick Webcamo in your call. Narrated in Egyptian Arabic.",

    "how.kick": "how",
    "how.title": "Three steps, once",
    "how.1.t": "Install the desktop app",
    "how.1.d": "On Windows, macOS or Linux. It creates a virtual camera your other apps can pick.",
    "how.2.t": "Open Webcamo on the phone",
    "how.2.d": "Then plug in the cable. Webcamo finds the phone and starts the stream by itself.",
    "how.3.t": "Pick it in your call",
    "how.3.d": "Choose “Mobile Webcam” from the camera list in Meet, Zoom or OBS. Done.",

    "dl.kick": "download",
    "dl.title": "Download Webcamo",
    "dl.sub": "Open source and private. The desktop app for your computer, and the app for your phone.",
    "dl.yours": "Your computer",
    "dl.yoursPhone": "Your phone",
    "dl.copy": "Copy",
    "dl.copied": "Copied!",
    "dl.win.title": "Windows",
    "dl.win.req": "Windows 10 or 11 (64-bit)",
    "dl.win.setup": "Download installer (.exe)",
    "dl.win.portable": "Portable zip (.zip)",
    "dl.win.note": "Windows SmartScreen may warn on new releases: click More info, then Run anyway.",
    "dl.mac.title": "macOS",
    "dl.mac.req": "macOS 12 Monterey or later",
    "dl.mac.arm": "Apple Silicon (M1–M4)",
    "dl.mac.intel": "Intel Mac",
    "dl.mac.note": "Works with OBS Virtual Camera.",
    "dl.linux.title": "Linux",
    "dl.linux.req": "Ubuntu, Debian, Fedora and Arch (64-bit)",
    "dl.linux.deb": "Download .deb package",
    "dl.linux.tar": "Universal tarball (.tar.gz)",
    "dl.linux.note": "Creates the virtual camera /dev/video9 (v4l2loopback) and a PipeWire microphone.",

    "mobile.android.title": "Android",
    "mobile.android.req": "Android 8.0 or later",
    "mobile.android.feat": "Camera2 with the hardware encoder, over adb (USB debugging).",
    "mobile.android.apk": "Download the Android APK",
    "mobile.android.note": "Turn on USB debugging in Developer options, then plug in the cable.",
    "mobile.ios.title": "iPhone",
    "mobile.ios.req": "iOS 16.4 or later",
    "mobile.ios.feat": "AVFoundation capture, VideoToolbox hardware encoder, over usbmuxd.",
    "mobile.ios.app": "Build it from the source (Xcode)",
    "mobile.ios.note": "Plug the iPhone in with a Lightning or USB-C cable and tap Trust This Computer.",

    "feat.kick": "why it works",
    "feat.title": "Made for long calls",
    "feat.sub": "No flaky Wi-Fi, no account, no cloud in the middle.",
    "feat.1.t": "A cable, not Wi-Fi",
    "feat.1.d": "The desktop pulls the stream from the phone over USB: no dropouts from a busy network, and the phone charges during the call.",
    "feat.2.t": "Private by design",
    "feat.2.d": "Everything stays on 127.0.0.1 between the phone and your computer. No analytics, no account, no internet needed.",
    "feat.3.t": "Hardware encoding",
    "feat.3.d": "The phone encodes H.264 in hardware; the desktop writes it to a normal virtual camera every app can use.",
    "feat.4.t": "Change it while you're live",
    "feat.4.d": "Resolution, frame rate, lens, zoom, exposure and rotation from the desktop; the camera stays in your call.",
    "feat.5.t": "Recovers by itself",
    "feat.5.d": "Cable pulled or app reopened: it reconnects. If the phone gets very hot, it lowers the quality, then restores it once the phone cools.",
    "feat.6.t": "A desktop app for every OS",
    "feat.6.d": "A dashboard with a live preview of what your call sees, on Windows, macOS and Linux.",

    "faq.kick": "questions",
    "faq.title": "Questions people ask",
    "faq.1.q": "Why a USB cable instead of Wi-Fi?",
    "faq.1.a": "Wi-Fi drops packets and adds delay spikes, and it drains the phone. Over the cable the stream is steady, the phone charges, and nothing leaves your desk.",
    "faq.2.q": "Does Webcamo send any video to the internet?",
    "faq.2.a": "No. It runs only between your phone and your computer over 127.0.0.1 and needs no internet connection.",
    "faq.3.q": "How much delay is there?",
    "faq.3.a": "About 0.3 to 0.4 seconds from the camera to your call, measured with a real iPhone. 30 fps is plenty for Meet and Zoom; 60 fps is smoother for recording.",
    "faq.4.q": "Will my phone get hot?",
    "faq.4.a": "The phone uses its hardware encoder, so the load stays low. If it does get very hot, Webcamo lowers the quality and restores it once the phone cools down.",
    "faq.5.q": "Can I use the phone's microphone?",
    "faq.5.a": "On iPhone, yes: allow the microphone for Webcamo and it appears as a virtual microphone on your computer. Android sends video only for now.",
    "faq.6.q": "Which apps does it work with?",
    "faq.6.a": "Anything that uses a camera: Google Meet, Zoom, Microsoft Teams, Discord, OBS Studio and browsers.",

    "final.title": "Plug in the cable. The camera is ready.",
    "final.sub": "Install the desktop app, open Webcamo on your phone, and pick it in your next call.",
    "final.cta": "Download Webcamo",
    "foot.copy": "open source on GitHub.",
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

// Arabic first, English on request.
let currentLang = store.get("webcamo-lang") === "en" ? "en" : "ar";
// "auto" follows the OS; "dark" / "light" force one.
let currentTheme = store.get("webcamo-theme") || "auto";
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

  const vars = { os: OS_NAMES[userOS] || "Desktop", v: releaseData?.tag_name || FALLBACK_VERSION };
  $$("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n"), vars); });
  $$("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.getAttribute("data-i18n-html"), vars); });
  $$("#lang button").forEach((b) => b.classList.toggle("on", b.dataset.value === lang));
  document.title = `Webcamo: ${t("hero.title", vars).replace(/<[^>]+>/g, "")}`;
  // New .hl spans must animate; marker strokes re-fit to the new text.
  window.nbScan?.(); window.nbRefit?.();
}

function applyTheme(theme) {
  currentTheme = theme;
  store.set("webcamo-theme", theme);
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  const btn = $("#theme");
  if (btn) btn.title = theme === "auto" ? "Theme: auto" : `Theme: ${theme}`;
}

// ── Release asset resolution ──
const ASSET_PATTERNS = {
  winSetup: /^webcamo.*setup.*\.exe$/i,
  winZip: /^webcamo.*windows.*\.zip$/i,
  macDmg: /^webcamo.*\.dmg$/i,
  macArmZip: /^webcamo.*macos.*arm64\.zip$/i,
  macIntelZip: /^webcamo.*macos.*(x86_64|x64)\.zip$/i,
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
  applyLanguage(currentLang); // the version line now knows the real tag
  const cleanVer = version.replace(/^v/, "");
  const assets = releaseData?.assets || [];

  function findUrl(pattern, fallback) {
    const found = assets.find((a) => pattern.test(a.name));
    return found ? found.browser_download_url : fallback;
  }

  const baseReleaseUrl = `https://github.com/${REPO}/releases/download/${version}`;

  const winZipUrl = findUrl(
    ASSET_PATTERNS.winZip,
    `${baseReleaseUrl}/webcamo-windows-x64-${cleanVer}.zip`,
  );
  const macArmZipUrl = findUrl(
    ASSET_PATTERNS.macArmZip,
    `${baseReleaseUrl}/Webcamo-${cleanVer}-macos-arm64.zip`,
  );
  const macIntelZipUrl = findUrl(
    ASSET_PATTERNS.macIntelZip,
    `${baseReleaseUrl}/Webcamo-${cleanVer}-macos-x86_64.zip`,
  );

  const urls = {
    winSetup: findUrl(ASSET_PATTERNS.winSetup, winZipUrl),
    winZip: winZipUrl,
    macDmg: findUrl(ASSET_PATTERNS.macDmg, macArmZipUrl),
    macIntel: macIntelZipUrl,
    linuxDeb: findUrl(ASSET_PATTERNS.linuxDeb, `${baseReleaseUrl}/webcamo_${cleanVer}_amd64.deb`),
    linuxTar: findUrl(
      ASSET_PATTERNS.linuxTar,
      `${baseReleaseUrl}/webcamo-linux-x86_64-${cleanVer}.tar.gz`,
    ),
    androidApk: findUrl(
      ASSET_PATTERNS.androidApk,
      `https://github.com/${REPO}/releases/tag/${version}`,
    ),
  };

  // Wire download links
  const setLink = (id, url) => {
    const el = document.getElementById(id);
    if (el) el.href = url;
  };

  setLink("dl-win-setup", urls.winSetup);
  setLink("dl-win-portable", urls.winZip);
  setLink("dl-mac-dmg", urls.macDmg);
  setLink("dl-mac-intel", urls.macIntel);
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
    else heroBtn.href = "#mobile";
    heroBtn.querySelector(".os-icon")?.setAttribute("data-os", userOS);
  }
}

function setupOSHighlight() {
  $(`[data-os-card="${userOS}"]`)?.classList.add("mine");
}

function setupClipboard() {
  $$(".copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.closest(".cmd")?.querySelector("code")?.textContent || "";
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = t("dl.copied");
        setTimeout(() => { btn.textContent = t("dl.copy"); }, 2000);
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

  $$("#lang button").forEach((b) => b.addEventListener("click", () => applyLanguage(b.dataset.value)));
  $("#theme")?.addEventListener("click", () => {
    const order = ["auto", "dark", "light"];
    applyTheme(order[(order.indexOf(currentTheme) + 1) % order.length]);
  });
});

// If the demo video is missing (e.g. not deployed yet), hide its section
// rather than showing a broken player; the hero falls back to its poster.
document.getElementById("intro-src")?.addEventListener("error", () => {
  document.getElementById("demo")?.setAttribute("hidden", "");
});
