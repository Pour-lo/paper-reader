/** Book-like left/right pagination for the reflowed article. */

export function createPager({ viewport, article, indicator, bar, endHint, onProgress }) {
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
  };

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
    article.style.transition = animate
      ? "transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1)"
      : "none";
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
    // Force layout, then count columns from scrollWidth.
    void article.offsetHeight;
    const step = pageStep();
    const sw = article.scrollWidth;
    state.total = Math.max(1, Math.round(sw / step));
    if (keep) state.index = pageOfElement(keep);
    state.index = clamp(state.index);
    setTransform(pageOffset(), false);
    updateIndicator();
  }

  function goTo(i, animate = true) {
    const next = clamp(i);
    state.index = next;
    setTransform(pageOffset(), animate);
    updateIndicator();
    if (typeof onProgress === "function") onProgress();
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
    document.documentElement.classList.add("mode-paged");
    document.body.classList.add("mode-paged");
    if (endHint) endHint.hidden = true;
    updateIndicator();
  }

  function disable() {
    if (!state.enabled) return;
    state.enabled = false;
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

  function onPointerDown(e) {
    if (!state.enabled || e.button) return;
    if (isChrome(e.target)) return;
    state.pointerId = e.pointerId;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.startT = performance.now();
    state.dx = 0;
    state.dy = 0;
    state.locked = null;
    state.dragging = false;
    state.interactive = isInteractive(e.target);
  }

  function onPointerMove(e) {
    if (!state.enabled || e.pointerId !== state.pointerId) return;
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
    if (state.interactive && Math.abs(state.dx) < 24) return;
    if (e.cancelable) e.preventDefault();
    if (!state.dragging) {
      state.dragging = true;
      try { viewport.setPointerCapture(e.pointerId); } catch {}
    }
    let dx = state.dx;
    if ((state.index === 0 && dx > 0) || (state.index === state.total - 1 && dx < 0)) {
      dx = dx / 3;
    }
    setTransform(pageOffset() + dx, false);
  }

  function suppressClick() {
    const stop = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    viewport.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => viewport.removeEventListener("click", stop, { capture: true }), 400);
  }

  function onPointerEnd(e) {
    if (!state.enabled || e.pointerId !== state.pointerId) return;
    state.pointerId = null;
    const dt = Math.max(1, performance.now() - state.startT);
    const vx = state.dx / dt;
    if (state.dragging) {
      const threshold = Math.max(40, state.pageW * 0.18);
      if (state.dx <= -threshold || vx < -0.45) goTo(state.index + 1, true);
      else if (state.dx >= threshold || vx > 0.45) goTo(state.index - 1, true);
      else goTo(state.index, true);
      suppressClick();
    } else if (!state.interactive && Math.abs(state.dx) < 8 && Math.abs(state.dy) < 8) {
      const rect = viewport.getBoundingClientRect();
      const x = state.startX - rect.left;
      const third = rect.width / 3;
      if (x < third) goTo(state.index - 1, true);
      else if (x > third * 2) goTo(state.index + 1, true);
      else if (bar) bar.classList.toggle("away");
    }
    state.dragging = false;
    state.locked = null;
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
  };
}
