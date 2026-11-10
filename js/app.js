import { extractPdf, renderPdfPage } from "./pdf-extract.js";
import { extractDocx } from "./docx-extract.js";
import {
  hashBuffer, saveFile, getFile, listFiles, deleteFile, touchFile,
  saveProgress, getProgress, loadSettings, saveSettings,
} from "./store.js";
import { createViewer } from "./viewer.js";
import { createPager } from "./pager.js";

const $ = (id) => document.getElementById(id);
const home = $("home");
const reader = $("reader");
const article = $("article");
const fileInput = $("fileInput");
const loading = $("loading");
const loadingText = $("loadingText");
const loadingSub = $("loadingSub");
const toastEl = $("toast");
const readerBar = $("readerBar");
const readerTitle = $("readerTitle");
const endHint = $("endHint");
const themeColor = $("themeColor");
const pageViewport = $("pageViewport");
const pageIndicator = $("pageIndicator");

const THEME_COLORS = { day: "#F6F1E8", sepia: "#E4EDD9", night: "#161513" };
const TIP_KEY = "paper-reader-install-tip";

let settings = loadSettings();
if (settings.pageMode !== "paged") settings.pageMode = "scroll";
let session = null;
let lastScroll = 0;
let progressTimer = 0;
let toastTimer = 0;
let pdfjsLibPromise = null;

const viewer = createViewer({
  root: $("viewer"),
  image: $("viewerImage"),
  caption: $("viewerCaption"),
  stage: $("viewerStage"),
});
$("btnCloseViewer").addEventListener("click", () => {
  if (history.state && history.state.pr === "viewer") history.back();
  else viewer.close();
});

const pager = createPager({
  viewport: pageViewport,
  article,
  indicator: pageIndicator,
  bar: readerBar,
  endHint,
  onProgress() {
    clearTimeout(progressTimer);
    progressTimer = setTimeout(persistProgress, 250);
  },
});

function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("../vendor/pdfjs/pdf.min.mjs").then((mod) => {
      const lib = mod.default || mod;
      lib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).toString();
      return lib;
    });
  }
  return pdfjsLibPromise;
}

function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = new URL("../vendor/mammoth.browser.min.js", import.meta.url).href;
    s.async = true;
    s.onload = () => window.mammoth ? resolve(window.mammoth) : reject(new Error("mammoth"));
    s.onerror = () => reject(new Error("mammoth"));
    document.head.appendChild(s);
  });
}

function toast(msg, opts = {}) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  toastEl.classList.toggle("toast-action", !!opts.onClick);
  toastEl.onclick = opts.onClick || null;
  clearTimeout(toastTimer);
  if (opts.persist) return;
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
    toastEl.onclick = null;
    toastEl.classList.remove("toast-action");
  }, opts.ms || 2800);
}

function showLoading(main, sub) {
  loadingText.textContent = main || "正在整理排版，请稍候…";
  loadingSub.textContent = sub || "";
  loading.hidden = false;
}
function hideLoading() { loading.hidden = true; }

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function showInstallTip() {
  const tip = $("installTip");
  if (!tip) return;
  if (isStandalone() || localStorage.getItem(TIP_KEY) === "1") {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
}

function applySettings() {
  const keep = (!reader.hidden && settings.pageMode === "paged" && pager.isEnabled())
    ? pager.elementOnPage()
    : null;
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.setProperty("--font", settings.fontSize + "px");
  root.style.setProperty("--line", String(settings.lineHeight));
  root.style.setProperty("--side", settings.margin + "px");
  themeColor.setAttribute("content", THEME_COLORS[settings.theme] || THEME_COLORS.day);
  $("fontRange").value = String(settings.fontSize);
  $("fontValue").textContent = settings.fontSize;
  $("lineRange").value = String(Math.round(settings.lineHeight * 100));
  $("lineValue").textContent = settings.lineHeight <= 1.55 ? "较紧" : settings.lineHeight >= 2.1 ? "较松" : "适中";
  $("marginRange").value = String(settings.margin);
  $("marginValue").textContent = settings.margin <= 16 ? "较窄" : settings.margin >= 30 ? "较宽" : "适中";
  document.querySelectorAll(".theme-pick[data-theme]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.theme === settings.theme ? "true" : "false");
  });
  document.querySelectorAll(".mode-pick[data-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.mode === settings.pageMode ? "true" : "false");
  });
  const wantPaged = settings.pageMode === "paged" && !reader.hidden;
  if (wantPaged && !pager.isEnabled()) {
    pager.enable();
    requestAnimationFrame(() => pager.layout({ keepElement: keep }));
  } else if (!wantPaged && pager.isEnabled()) {
    pager.disable();
  } else if (wantPaged) {
    requestAnimationFrame(() => pager.layout({ keepElement: keep }));
  }
  saveSettings(settings);
}

function setScreen(name) {
  home.hidden = name !== "home";
  reader.hidden = name !== "reader";
  if (name === "home") {
    if (pager.isEnabled()) pager.disable();
    document.title = "论文助手";
    window.scrollTo(0, 0);
  }
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function renderRecent() {
  const list = $("recentList");
  const section = $("recentSection");
  const files = await listFiles();
  list.innerHTML = "";
  if (!files.length) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  for (const f of files) {
    const li = document.createElement("li");
    li.className = "recent-item";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "open-recent";
    open.innerHTML = `<span class="name"></span><span class="meta"></span>`;
    open.querySelector(".name").textContent = f.title || f.name;
    const kind = f.kind === "docx" ? "Word" : "PDF";
    open.querySelector(".meta").textContent = `${kind} · ${formatTime(f.lastReadAt || f.addedAt)}`;
    open.addEventListener("click", () => openStored(f.id));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "删除";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteFile(f.id);
      toast("已从这台手机里移除这篇论文和阅读位置。原文件还在你原来的地方。");
      renderRecent();
    });
    li.append(open, del);
    list.append(li);
  }
}

function renderArticle(extracted, displayTitle) {
  article.innerHTML = "";
  let bi = 0;
  const tag = (el) => { el.dataset.block = String(bi++); return el; };

  const title = document.createElement("h1");
  title.className = "paper-title";
  title.textContent = displayTitle || extracted.title || "论文";
  article.append(tag(title));

  const titleNorm = (displayTitle || "").replace(/\s+/g, "");
  let skippedTitle = !titleNorm;
  for (const b of extracted.blocks) {
    if (!skippedTitle && b.text && (b.type === "h2" || b.type === "h3" || b.type === "p") && b.text.replace(/\s+/g, "") === titleNorm) {
      skippedTitle = true;
      continue;
    }
    if (b.type === "page-break") {
      const mark = document.createElement("div");
      mark.className = "page-mark";
      mark.dataset.page = String(b.pageNum);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `第 ${b.pageNum} 页 · 看原页`;
      btn.addEventListener("click", () => showOriginalPage(b.pageNum));
      mark.append(btn);
      article.append(tag(mark));
      continue;
    }
    if (b.type === "figure") {
      const wrap = document.createElement("figure");
      wrap.className = "figure-block";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fig-btn";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.src = b.url;
      img.alt = b.caption || "论文插图，点一下可放大";
      btn.append(img);
      btn.addEventListener("click", () => {
        viewer.open(b.url, b.caption || "论文插图");
        if (!(history.state && history.state.pr === "viewer")) history.pushState({ pr: "viewer" }, "", location.href);
      });
      wrap.append(btn);
      const cap = document.createElement("figcaption");
      cap.className = "fig-cap";
      cap.textContent = b.caption ? `${b.caption}（点图可放大）` : "点图可放大到全屏";
      wrap.append(cap);
      article.append(tag(wrap));
      continue;
    }
    if (b.type === "caption") {
      const p = document.createElement("p");
      p.className = "fig-cap";
      p.textContent = b.text;
      article.append(tag(p));
      continue;
    }
    if (b.type === "meta") {
      const p = document.createElement("p");
      p.className = "meta-line";
      p.textContent = b.text;
      article.append(tag(p));
      continue;
    }
    if (b.type === "h2" || b.type === "h3") {
      const el = document.createElement(b.type === "h2" ? "h2" : "h3");
      if (b.id) el.id = b.id;
      el.textContent = b.text;
      article.append(tag(el));
      continue;
    }
    if (b.type === "p" && b.text) {
      const p = document.createElement("p");
      p.textContent = b.text;
      article.append(tag(p));
    }
  }
  endHint.hidden = settings.pageMode === "paged";
}

function fillToc(headings) {
  const nav = $("tocList");
  nav.innerHTML = "";
  const has = headings && headings.length;
  $("btnToc").hidden = !has;
  if (!has) return;
  for (const h of headings) {
    const a = document.createElement("a");
    a.href = `#${h.id}`;
    a.className = h.level >= 3 ? "l2" : "";
    a.textContent = h.text;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      closeSheet("toc");
      const target = document.getElementById(h.id);
      if (!target) return;
      if (settings.pageMode === "paged" && pager.isEnabled()) pager.goToElement(target, true);
      else target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.append(a);
  }
}

async function showOriginalPage(pageNum) {
  if (!session || !session.pdf) {
    toast("这份是 Word 文件，没有「原页」可对照。");
    return;
  }
  showLoading("正在打开原页…", `第 ${pageNum} 页`);
  try {
    const rendered = await renderPdfPage(session.pdf, pageNum);
    hideLoading();
    viewer.open(rendered.url, `第 ${pageNum} 页原貌（可放大查看）`);
    if (!(history.state && history.state.pr === "viewer")) history.pushState({ pr: "viewer" }, "", location.href);
  } catch (err) {
    hideLoading();
    console.error(err);
    toast("这一页没能打开，请再试一次。");
  }
}

function guessKind(name, type) {
  const n = (name || "").toLowerCase();
  const t = (type || "").toLowerCase();
  if (n.endsWith(".docx") || t.includes("wordprocessingml") || t.includes("officedocument")) return "docx";
  if (n.endsWith(".doc") && !n.endsWith(".docx")) return "doc-old";
  return "pdf";
}

async function ingestFile(file, existingId) {
  const name = file.name || "未命名文件";
  const kind = guessKind(name, file.type);
  if (kind === "doc-old") {
    toast("目前只支持 .docx 格式的 Word 文件。请先用 Word 另存为 .docx。");
    return;
  }
  showLoading("正在整理排版，请稍候…", name);
  if (session && session.pdf && session.pdf.destroy) {
    try { await session.pdf.destroy(); } catch {}
    session.pdf = null;
  }
  try {
    const buffer = await file.arrayBuffer();
    const stored = buffer.slice(0);
    const work = buffer.slice(0);
    const id = existingId || await hashBuffer(stored);
    let extracted;
    if (kind === "docx") {
      await loadMammoth();
      extracted = await extractDocx(work);
    } else {
      const pdfjsLib = await loadPdfjs();
      extracted = await extractPdf(work, {
        pdfjsLib,
        onProgress: (n, total) => {
          loadingSub.textContent = `正在整理第 ${n} / ${total} 页`;
        },
      });
    }
    const title = (extracted.title || name.replace(/\.(pdf|docx)$/i, "")).trim();
    const rec = {
      id,
      name,
      kind: extracted.kind || kind,
      type: file.type || "",
      size: file.size || stored.byteLength,
      title,
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      buffer: stored,
    };
    try {
      await saveFile(rec);
    } catch (err) {
      console.warn("save failed", err);
      toast("这篇比较大，没能存进「最近阅读」。这次仍可阅读，下次需要重新打开文件。");
    }
    await present(extracted, rec);
  } catch (err) {
    console.error(err);
    hideLoading();
    const msg = String(err && err.message || err);
    if (/password/i.test(msg)) toast("这份文件需要密码，暂时打不开。");
    else toast("这篇论文打不开。可以换一个 PDF 或 Word 文件试试。");
  }
}

function elementNearScrollTop() {
  const y = (readerBar.getBoundingClientRect().bottom || 80) + 8;
  const blocks = [...article.querySelectorAll("[data-block]")];
  let best = blocks[0] || article.firstElementChild;
  for (const el of blocks) {
    const top = el.getBoundingClientRect().top;
    if (top <= y + 4) best = el;
    else break;
  }
  return best;
}

function restorePaged(prog) {
  if (prog && prog.anchorIdx != null) {
    const el = article.querySelector(`[data-block="${CSS.escape(String(prog.anchorIdx))}"]`);
    if (el) { pager.goToElement(el, false); return; }
  }
  if (prog && typeof prog.pageIndex === "number" && prog.pageCount) {
    const ratio = prog.pageCount > 1 ? prog.pageIndex / (prog.pageCount - 1) : 0;
    pager.goTo(Math.round(ratio * Math.max(0, pager.total() - 1)), false);
    return;
  }
  if (prog && typeof prog.ratio === "number") {
    pager.goTo(Math.round(prog.ratio * Math.max(0, pager.total() - 1)), false);
    return;
  }
  pager.goTo(0, false);
}

function restoreScroll(prog) {
  if (prog && prog.anchorIdx != null) {
    const el = article.querySelector(`[data-block="${CSS.escape(String(prog.anchorIdx))}"]`);
    if (el) { el.scrollIntoView({ block: "start" }); return; }
  }
  if (prog && typeof prog.ratio === "number" && prog.ratio > 0.01) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, max * prog.ratio);
  } else {
    window.scrollTo(0, 0);
  }
}

async function present(extracted, rec) {
  if (session && session.pdf && session.pdf.destroy) {
    try { await session.pdf.destroy(); } catch {}
  }
  session = {
    id: rec.id,
    name: rec.name,
    kind: extracted.kind,
    pdf: extracted.pdf || null,
    blocks: extracted.blocks,
    headings: extracted.headings || [],
    numPages: extracted.numPages || 0,
    title: rec.title || extracted.title || rec.name,
  };
  readerTitle.textContent = session.title;
  document.title = session.title + " · 论文助手";
  renderArticle(extracted, session.title);
  fillToc(session.headings);
  setScreen("reader");
  if (settings.pageMode === "paged") pager.enable();
  hideLoading();
  if (!(history.state && history.state.pr === "reader")) {
    history.pushState({ pr: "reader" }, "", location.href);
  }
  const textLen = (extracted.blocks || []).reduce((n, b) => n + (b.text ? b.text.length : 0), 0);
  if (extracted.kind === "pdf" && extracted.numPages && textLen < extracted.numPages * 40) {
    const note = document.createElement("p");
    note.className = "notice";
    note.dataset.block = "notice";
    note.textContent = "这份论文主要是扫描图片，暂时不能调整文字大小。可以逐页查看并放大。";
    const titleEl = article.querySelector(".paper-title");
    article.insertBefore(note, titleEl ? titleEl.nextSibling : article.firstChild);
  }
  const prog = await getProgress(rec.id).catch(() => null);
  const go = () => {
    if (settings.pageMode === "paged") {
      pager.layout();
      restorePaged(prog);
    } else {
      restoreScroll(prog);
    }
  };
  const afterFonts = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(() => {}) : Promise.resolve();
  afterFonts.then(() => requestAnimationFrame(() => requestAnimationFrame(go)));
}

async function openStored(id) {
  showLoading("正在打开上次的论文…", "");
  try {
    const rec = await getFile(id);
    if (!rec || !rec.buffer) {
      hideLoading();
      toast("这篇已经找不到了，请重新打开文件。");
      await renderRecent();
      return;
    }
    await touchFile(id).catch(() => {});
    const file = new File([rec.buffer], rec.name, { type: rec.type || (rec.kind === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf") });
    await ingestFile(file, rec.id);
  } catch (err) {
    console.error(err);
    hideLoading();
    toast("打开失败，请重新选一次文件。");
  }
}

function openSheet(which) {
  $(which === "toc" ? "tocSheet" : "settingsSheet").hidden = false;
}
function closeSheet(which) {
  if (which === "toc" || !which) $("tocSheet").hidden = true;
  if (which === "settings" || !which) $("settingsSheet").hidden = true;
}

$("btnOpen").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (file) await ingestFile(file);
});

async function goHome() {
  persistProgress();
  const old = session;
  session = null;
  setScreen("home");
  await renderRecent();
  if (old && old.pdf && old.pdf.destroy) {
    try { await old.pdf.destroy(); } catch {}
  }
}

function closeTopOverlay() {
  if (!$("viewer").hidden) {
    viewer.close();
    return true;
  }
  if (!$("tocSheet").hidden) {
    closeSheet("toc");
    return true;
  }
  if (!$("settingsSheet").hidden) {
    closeSheet("settings");
    return true;
  }
  return false;
}

$("btnBack").addEventListener("click", () => {
  if (history.state && history.state.pr === "reader") history.back();
  else goHome();
});
$("btnSettings").addEventListener("click", () => {
  openSheet("settings");
  if (!(history.state && history.state.pr === "sheet")) history.pushState({ pr: "sheet" }, "", location.href);
});
$("btnToc").addEventListener("click", () => {
  openSheet("toc");
  if (!(history.state && history.state.pr === "sheet")) history.pushState({ pr: "sheet" }, "", location.href);
});
document.querySelectorAll("[data-close]").forEach((el) => {
  el.addEventListener("click", () => {
    if (history.state && history.state.pr === "sheet") history.back();
    else closeSheet(el.getAttribute("data-close"));
  });
});

$("fontRange").addEventListener("input", () => {
  settings.fontSize = Number($("fontRange").value);
  applySettings();
});
$("fontMinus").addEventListener("click", () => {
  settings.fontSize = Math.max(14, settings.fontSize - 1);
  applySettings();
});
$("fontPlus").addEventListener("click", () => {
  settings.fontSize = Math.min(40, settings.fontSize + 1);
  applySettings();
});
$("lineRange").addEventListener("input", () => {
  settings.lineHeight = Number($("lineRange").value) / 100;
  applySettings();
});
$("marginRange").addEventListener("input", () => {
  settings.margin = Number($("marginRange").value);
  applySettings();
});
document.querySelectorAll(".theme-pick[data-theme]").forEach((btn) => {
  btn.addEventListener("click", () => {
    settings.theme = btn.dataset.theme;
    applySettings();
  });
});
document.querySelectorAll(".mode-pick[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => setPageMode(btn.dataset.mode));
});

function setPageMode(mode) {
  if (mode !== "scroll" && mode !== "paged") return;
  let anchor = null;
  if (!reader.hidden) {
    if (pager.isEnabled()) anchor = pager.elementOnPage();
    else anchor = elementNearScrollTop();
  }
  settings.pageMode = mode;
  applySettings();
  if (reader.hidden) return;
  if (mode === "paged") {
    pager.enable();
    pager.layout({ keepElement: anchor });
    window.scrollTo(0, 0);
  } else {
    pager.disable();
    if (anchor) anchor.scrollIntoView({ block: "start" });
  }
  persistProgress();
}

function persistProgress() {
  if (!session || reader.hidden) return;
  if (settings.pageMode === "paged" && pager.isEnabled()) {
    const total = Math.max(1, pager.total());
    const index = pager.index();
    const ratio = total > 1 ? index / (total - 1) : 0;
    const el = pager.elementOnPage();
    saveProgress(session.id, {
      ratio,
      mode: "paged",
      pageIndex: index,
      pageCount: total,
      anchorIdx: el ? el.dataset.block : undefined,
    }).catch(() => {});
  } else {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    const el = elementNearScrollTop();
    saveProgress(session.id, {
      ratio,
      mode: "scroll",
      anchorIdx: el && el.dataset.block,
    }).catch(() => {});
  }
}

window.addEventListener("popstate", () => {
  if (closeTopOverlay()) return;
  if (!reader.hidden) goHome();
});

window.addEventListener("scroll", () => {
  if (reader.hidden) return;
  if (settings.pageMode === "paged") return;
  const y = window.scrollY;
  if (y > lastScroll + 8 && y > 60) readerBar.classList.add("away");
  else if (y < lastScroll - 6) readerBar.classList.remove("away");
  lastScroll = y;
  clearTimeout(progressTimer);
  progressTimer = setTimeout(persistProgress, 400);
}, { passive: true });

window.addEventListener("resize", () => {
  if (pager.isEnabled() && !reader.hidden) {
    const keep = pager.elementOnPage();
    pager.layout({ keepElement: keep });
  }
});
if (window.visualViewport) {
  visualViewport.addEventListener("resize", () => {
    if (pager.isEnabled() && !reader.hidden) {
      const keep = pager.elementOnPage();
      pager.layout({ keepElement: keep });
    }
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistProgress();
});
window.addEventListener("pagehide", persistProgress);

document.body.addEventListener("dragover", (e) => {
  e.preventDefault();
});
document.body.addEventListener("drop", async (e) => {
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) await ingestFile(file);
});

if ("launchQueue" in window && "LaunchParams" in window) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files || !params.files.length) return;
    const h = params.files[0];
    const file = await h.getFile();
    await ingestFile(file);
  });
}

async function consumeShare() {
  const params = new URLSearchParams(location.search);
  if (params.get("shared") !== "1") return;
  try {
    const rec = await getFile("shared-incoming");
    if (!rec || !rec.buffer) return;
    const file = new File([rec.buffer], rec.name || "shared.pdf", { type: rec.type || "application/pdf" });
    history.replaceState({}, "", "./");
    await ingestFile(file);
    deleteFile("shared-incoming").catch(() => {});
  } catch {}
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const swUrl = new URL("../sw.js", import.meta.url);
  const scope = new URL("../", import.meta.url).href;
  navigator.serviceWorker.register(swUrl, { scope }).then((reg) => {
    let prompted = false;
    const promptUpdate = (worker) => {
      if (!worker || prompted) return;
      prompted = true;
      toast("有新版本，点此更新", {
        persist: true,
        onClick() {
          worker.postMessage({ type: "SKIP_WAITING" });
          let reloaded = false;
          const reload = () => {
            if (reloaded) return;
            reloaded = true;
            location.reload();
          };
          navigator.serviceWorker.addEventListener("controllerchange", reload);
          setTimeout(reload, 1200);
        },
      });
    };
    if (reg.waiting) promptUpdate(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) promptUpdate(w);
      });
    });
    // Check for a waiting update quietly; never auto-reload.
    reg.update().catch(() => {});
  }).catch((err) => console.warn("sw", err));
}

const tipBtn = $("btnDismissTip");
if (tipBtn) {
  tipBtn.addEventListener("click", () => {
    localStorage.setItem(TIP_KEY, "1");
    $("installTip").hidden = true;
  });
}

applySettings();
showInstallTip();
registerServiceWorker();
renderRecent();
consumeShare();
