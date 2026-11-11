/** Book-like pagination: smooth slide, page-curl, or no animation. */

import { createCurlOverlay, captureElement, prefetchCaptureCss } from "./page-curl.js";
import { fitAllMath } from "./math-render.js";

export function createPager({ viewport, article, indicator, bar, endHint, onProgress, getEffect }) {
  const state = {
    enabled: false,
    index: 0,
    total: 1,
    pageW: 0,
    pageH: 0,
    gap: 32,
    pointerId: null,
    startX: 0,
    startY: 0,
    startT: 0,
    dx: 0,
    dy: 0,
    locked: null,
    dragging: false,
    interactive: false,
    raf: 0,
    pendingX: null,
    turning: false,
    captureToken: 0,
    currentBmp: null,
    curlFromRight: true,
    curlFollow: null,
    curlProgress: 0,
    curlDest: 0,
  };

  const curl = createCurlOverlay(viewport);

  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  function effect() {
    if (reducedMotion()) return "none";
    const e = typeof getEffect === "function" ? getEffect() : "slide";
    if (e === "curl" || e === "none") return e;
    return "slide";
  }

  function clamp(i) {
    return Math.max(0, Math.min(state.total - 1, i | 0));
  }

  function pageStep() {
    return state.pageW + state.gap;
  }

  function pageOffset(i = state.index) {
    return -i * pageStep();
  }

  function setTransform(x, animate) {
    const ms = animate && effect() !== "none" ? 380 : 0;
    if (ms) {
      article.style.transition = "transform 0.38s cubic-bezier(0.22, 0.75, 0.2, 1)";
    } else {
      article.style.transition = "none";
    }
    article.style.transform = `translate3d(${x}px, 0, 0)`;
  }

  function updateIndicator() {
    if (!indicator) return;
    if (!state.enabled) {
      indicator.hidden = true;
      return;
    }
    indicator.hidden = false;
    indicator.textContent = `${state.index + 1}/${state.total}`;
  }

  function pageOfElement(el) {
    if (!el || !state.pageW) return state.index;
    const vRect = viewport.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const untransformed = eRect.left - vRect.left + state.index * pageStep();
    return clamp(Math.round(untransformed / pageStep()));
  }

  function layout({ keepElement = null } = {}) {
    if (!state.enabled) return;
    const w = Math.max(1, Math.round(viewport.clientWidth));
    const h = Math.max(1, Math.round(viewport.clientHeight));
    if (w < 2 || h < 2) return;
    const keep = keepElement || elementOnPage();
    state.pageW = w;
    state.pageH = h;
    document.documentElement.style.setProperty("--page-h", h + "px");
    article.style.boxSizing = "border-box";
    article.style.width = w + "px";
    article.style.height = h + "px";
    article.style.columnWidth = w + "px";
    article.style.columnGap = state.gap + "px";
    void article.offsetHeight;
    // Fit formulas to the column width before counting pages; scale/wrap can change height.
    fitAllMath(article);
    void article.offsetHeight;
    const step = pageStep();
    const sw = article.scrollWidth;
    state.total = Math.max(1, Math.round(sw / step));
    if (keep) state.index = pageOfElement(keep);
    state.index = clamp(state.index);
    setTransform(pageOffset(), false);
    updateIndicator();
    curl.resize(w, h);
    state.currentBmp = null;
    scheduleCapture();
  }

  function scheduleCapture() {
    prefetchCaptureCss();
    if (!state.enabled || effect() !== "curl") return;
    const token = ++state.captureToken;
    const start = () => {
      if (token !== state.captureToken || !state.enabled) return;
      captureCurrent(token);
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(start, { timeout: 700 });
    } else {
      setTimeout(start, 180);
    }
  }

  async function captureCurrent(token = state.captureToken) {
    if (!state.enabled) return null;
    const fill = getComputedStyle(document.documentElement).getPropertyValue("--bg")?.trim() || "#F6F1E8";
    curl.hide();
    const bmp = await captureElement(viewport, {
      width: state.pageW,
      height: state.pageH,
      fill,
    });
    if (token !== state.captureToken) return null;
    state.currentBmp = bmp;
    return bmp;
  }

  function finishGo(next, animateMode) {
    const prev = state.index;
    state.index = clamp(next);
    if (animateMode === "none" || prev === state.index) {
      setTransform(pageOffset(), false);
    } else if (animateMode === "curl") {
      // settle: article already at dest or will be set
      setTransform(pageOffset(), false);
    } else {
      setTransform(pageOffset(), true);
    }
    updateIndicator();
    if (typeof onProgress === "function") onProgress();
    state.currentBmp = null;
    scheduleCapture();
  }

  function goTo(i, animate = true) {
    const next = clamp(i);
    if (!animate || effect() === "none" || next === state.index || !state.enabled) {
      state.index = next;
      setTransform(pageOffset(), false);
      updateIndicator();
      if (typeof onProgress === "function") onProgress();
      return;
    }
    if (effect() === "curl") {
      startCurlTurn(next, null);
      return;
    }
    state.index = next;
    setTransform(pageOffset(), true);
    updateIndicator();
    if (typeof onProgress === "function") onProgress();
    article.addEventListener("transitionend", () => scheduleCapture(), { once: true });
  }

  function goToElement(el, animate = false) {
    if (!el) return;
    goTo(pageOfElement(el), animate);
  }

  function elementOnPage() {
    const blocks = article.querySelectorAll("[data-block]");
    for (const el of blocks) {
      if (pageOfElement(el) === state.index) return el;
    }
    return article.querySelector("[data-block]") || article.firstElementChild;
  }

  function enable() {
    if (state.enabled) return;
    state.enabled = true;
    prefetchCaptureCss();
    document.documentElement.classList.add("mode-paged");
    document.body.classList.add("mode-paged");
    if (endHint) endHint.hidden = true;
    updateIndicator();
  }

  function disable() {
    if (!state.enabled) return;
    state.enabled = false;
    state.turning = false;
    state.currentBmp = null;
    state.captureToken++;
    curl.hide();
    document.documentElement.classList.remove("mode-paged");
    document.body.classList.remove("mode-paged");
    article.style.width = "";
    article.style.height = "";
    article.style.columnWidth = "";
    article.style.columnGap = "";
    article.style.padding = "";
    article.style.boxSizing = "";
    article.style.transition = "";
    article.style.transform = "";
    document.documentElement.style.removeProperty("--page-h");
    if (indicator) indicator.hidden = true;
    updateIndicator();
  }

  function isChrome(t) {
    return !!(t && t.closest && t.closest(".reader-bar, .sheet, .overlay, #viewer, .page-indicator, #toast"));
  }

  function isInteractive(t) {
    return !!(t && t.closest && t.closest("button, a, input, textarea, select"));
  }

  function mathScrollerOf(t) {
    const el = t && t.closest && t.closest("[data-math-scroll]");
    if (!el) return null;
    if (el.scrollWidth > el.clientWidth + 2) return el;
    return null;
  }

  function isMathTarget(t) {
    return !!(t && t.closest && t.closest(".math-slot, .eq-block, .math-inline, .math-block"));
  }

  function onPointerDown(e) {
    if (!state.enabled || e.button || state.turning) return;
    if (isChrome(e.target)) return;
    state.pointerId = e.pointerId;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.lastX = e.clientX;
    state.startT = performance.now();
    state.dx = 0;
    state.dy = 0;
    state.locked = null;
    state.dragging = false;
    state.interactive = isInteractive(e.target);
    state.mathScroll = mathScrollerOf(e.target);
    state.onMath = isMathTarget(e.target);
    state.curlFollow = null;
  }

  function flushDrag() {
    state.raf = 0;
    if (state.pendingX == null) return;
    if (effect() === "curl" && state.dragging) {
      // curl drawn in onPointerMove path
    } else {
      article.style.transition = "none";
      article.style.transform = `translate3d(${state.pendingX}px, 0, 0)`;
    }
    state.pendingX = null;
  }

  function curlProgressFromDx(dx) {
    const w = Math.max(1, state.pageW);
    const raw = Math.abs(dx) / w;
    return Math.max(0, Math.min(0.92, raw * 1.05));
  }

  async function beginCurlDrag(fromRight) {
    if (state.turning) return false;
    let bmp = state.currentBmp;
    if (!bmp) bmp = await captureCurrent();
    if (!bmp) return false;
    state.currentBmp = bmp;
    state.curlFromRight = fromRight;
    curl.resize(state.pageW, state.pageH);
    // Put the destination page underneath the canvas.
    const dest = clamp(state.index + (fromRight ? 1 : -1));
    state.curlDest = dest;
    setTransform(pageOffset(dest), false);
    curl.show(bmp, 0.001, fromRight, null);
    return true;
  }

  function paintCurlDrag() {
    const fromRight = state.dx < 0;
    const progress = curlProgressFromDx(state.dx);
    const rect = viewport.getBoundingClientRect();
    const follow = {
      x: clampFollowX(state.startX + state.dx - rect.left, fromRight),
      y: clampFollowY(state.startY + state.dy - rect.top),
    };
    state.curlFollow = follow;
    state.curlProgress = progress;
    curl.show(state.currentBmp, progress, fromRight, follow);
  }

  function clampFollowX(x, fromRight) {
    if (fromRight) return Math.min(state.pageW, Math.max(-0.2 * state.pageW, x));
    return Math.max(0, Math.min(state.pageW * 1.2, x));
  }

  function clampFollowY(y) {
    return Math.max(10, Math.min(state.pageH - 10, y));
  }

  function onPointerMove(e) {
    if (!state.enabled || e.pointerId !== state.pointerId || state.turning) return;
    state.dx = e.clientX - state.startX;
    state.dy = e.clientY - state.startY;
    if (!state.locked) {
      if (Math.abs(state.dx) > 8 || Math.abs(state.dy) > 8) {
        state.locked = Math.abs(state.dx) > Math.abs(state.dy) * 1.1 ? "x" : "y";
      } else {
        return;
      }
    }
    if (state.locked !== "x") return;
    if (state.mathScroll) {
      if (e.cancelable) e.preventDefault();
      state.mathScroll.scrollLeft -= (e.clientX - state.lastX);
      state.lastX = e.clientX;
      return;
    }
    if (state.interactive && Math.abs(state.dx) < 24) return;
    if (e.cancelable) e.preventDefault();
    if (!state.dragging) {
      state.dragging = true;
      try { viewport.setPointerCapture(e.pointerId); } catch {}
      article.style.willChange = "transform";
      if (effect() === "curl") {
        const fromRight = state.dx < 0;
        const atEdge = (fromRight && state.index >= state.total - 1) || (!fromRight && state.index <= 0);
        if (!atEdge) {
          beginCurlDrag(fromRight).then((ok) => {
            if (!ok) {
              // fall back to slide mid-gesture
            } else if (state.dragging) paintCurlDrag();
          });
        }
      }
    }
    if (effect() === "curl" && state.currentBmp && !edgeRubber(state.dx)) {
      if (!state.raf) state.raf = requestAnimationFrame(() => {
        state.raf = 0;
        if (state.dragging) paintCurlDrag();
      });
      return;
    }
    let dx = state.dx;
    if (edgeRubber(dx)) dx = dx / 3;
    state.pendingX = pageOffset() + dx;
    // If we already jumped the article to dest for curl then cancelled to slide,
    // pageOffset() uses state.index which is still the original until settle.
    if (effect() === "curl" && state.currentBmp && edgeRubber(state.dx)) {
      state.pendingX = pageOffset() + dx / 3;
    }
    if (!state.raf) state.raf = requestAnimationFrame(flushDrag);
  }

  function edgeRubber(dx) {
    return (state.index === 0 && dx > 0) || (state.index === state.total - 1 && dx < 0);
  }

  function suppressClick() {
    const stop = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    viewport.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => viewport.removeEventListener("click", stop, { capture: true }), 400);
  }

  function animateCurlTo(target, fromRight, follow, then) {
    state.turning = true;
    const start = state.curlProgress || 0;
    const t0 = performance.now();
    const dur = Math.max(180, 420 * Math.abs(target - start));
    const tick = (now) => {
      const u = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - u, 3);
      const p = start + (target - start) * ease;
      state.curlProgress = p;
      const f = follow && u < 0.92 ? follow : null;
      curl.show(state.currentBmp, p, fromRight, f);
      if (u < 1) {
        state.raf = requestAnimationFrame(tick);
      } else {
        state.raf = 0;
        state.turning = false;
        curl.hide();
        then();
        article.style.willChange = "";
      }
    };
    state.raf = requestAnimationFrame(tick);
  }

  function startCurlTurn(next, follow) {
    const dest = clamp(next);
    if (dest === state.index) {
      setTransform(pageOffset(), false);
      return;
    }
    const fromRight = dest > state.index;
    const run = async () => {
      let bmp = state.currentBmp;
      if (!bmp) bmp = await captureCurrent();
      state.currentBmp = bmp;
      if (!bmp || effect() !== "curl") {
        state.index = dest;
        setTransform(pageOffset(), effect() !== "none");
        updateIndicator();
        if (typeof onProgress === "function") onProgress();
        return;
      }
      curl.resize(state.pageW, state.pageH);
      setTransform(pageOffset(dest), false);
      state.curlDest = dest;
      state.curlFromRight = fromRight;
      state.curlProgress = follow ? curlProgressFromDx(state.dx) : 0.02;
      curl.show(bmp, state.curlProgress, fromRight, follow);
      animateCurlTo(1, fromRight, follow, () => finishGo(dest, "curl"));
    };
    run();
  }

  function onPointerEnd(e) {
    if (!state.enabled || e.pointerId !== state.pointerId) return;
    if (state.mathScroll && state.locked === "x") {
      state.pointerId = null;
      state.mathScroll = null;
      state.dragging = false;
      state.locked = null;
      state.onMath = false;
      return;
    }
    state.pointerId = null;
    const dt = Math.max(1, performance.now() - state.startT);
    const vx = state.dx / dt;
    const eff = effect();
    if (state.dragging) {
      const threshold = Math.max(40, state.pageW * 0.18);
      const goNext = state.dx <= -threshold || vx < -0.45;
      const goPrev = state.dx >= threshold || vx > 0.45;
      const dest = goNext ? state.index + 1 : goPrev ? state.index - 1 : state.index;
      const fromRight = state.dx < 0;
      if (eff === "curl" && state.currentBmp && !edgeRubber(state.dx) && (goNext || goPrev || state.curlProgress > 0)) {
        if (dest !== state.index) {
          animateCurlTo(1, fromRight, state.curlFollow, () => finishGo(dest, "curl"));
        } else {
          // Peek cancelled: curl back, then restore current page under the canvas.
          const idx = state.index;
          animateCurlTo(0, fromRight, state.curlFollow, () => {
            setTransform(pageOffset(idx), false);
            finishGo(idx, "curl");
          });
        }
      } else {
        // If a curl had already jumped the article, put it back first.
        if (eff === "curl") curl.hide();
        if (goNext) goTo(state.index + 1, true);
        else if (goPrev) goTo(state.index - 1, true);
        else goTo(state.index, true);
      }
      suppressClick();
    } else if (!state.interactive && !state.onMath && Math.abs(state.dx) < 8 && Math.abs(state.dy) < 8) {
      const rect = viewport.getBoundingClientRect();
      const x = state.startX - rect.left;
      const third = rect.width / 3;
      if (x < third) goTo(state.index - 1, true);
      else if (x > third * 2) goTo(state.index + 1, true);
      else if (bar) bar.classList.toggle("away");
    }
    state.dragging = false;
    state.locked = null;
    article.style.willChange = "";
  }

  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove, { passive: false });
  viewport.addEventListener("pointerup", onPointerEnd);
  viewport.addEventListener("pointercancel", onPointerEnd);

  return {
    enable,
    disable,
    layout,
    goTo,
    goToElement,
    pageOfElement,
    elementOnPage,
    isEnabled: () => state.enabled,
    index: () => state.index,
    total: () => state.total,
    effect,
  };
}
