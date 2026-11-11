let katexPromise = null;

const EQ_NUM_RE = /^\s*[(（][0-9A-Za-z.\-–]+[)）]\s*$/;
const MIN_MATH_SCALE = 0.75;

export function isEqNumberText(t) {
  return EQ_NUM_RE.test(t || "");
}

export function loadKatex() {
  if (window.katex) return Promise.resolve(window.katex);
  if (!katexPromise) {
    katexPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("../vendor/katex/katex.min.js", import.meta.url).href;
      s.async = true;
      s.onload = () => (window.katex ? resolve(window.katex) : reject(new Error("katex")));
      s.onerror = () => reject(new Error("katex"));
      document.head.appendChild(s);
    });
  }
  return katexPromise;
}

function paint(el, latex, display) {
  const katex = window.katex;
  if (!katex) {
    el.textContent = latex;
    return;
  }
  try {
    katex.render(latex, el, {
      displayMode: !!display,
      throwOnError: false,
      strict: "ignore",
      output: "html",
      trust: false,
      minRuleThickness: 0.05,
    });
  } catch {
    el.textContent = latex;
  }
}

export function renderMathEl(latex, display) {
  const el = document.createElement(display ? "div" : "span");
  el.className = display ? "math-block" : "math-inline";
  el.setAttribute("data-latex", latex);
  if (window.katex) paint(el, latex, display);
  else {
    el.textContent = latex;
    loadKatex().then(() => paint(el, latex, display)).catch(() => {});
  }
  return el;
}

function wrapScrollSlot(mathEl, inline) {
  const slot = document.createElement(inline ? "span" : "div");
  slot.className = inline ? "math-slot math-slot-inline" : "math-slot";
  const scroller = document.createElement(inline ? "span" : "div");
  scroller.className = "math-hscroll";
  scroller.dataset.mathScroll = "";
  scroller.append(mathEl);
  slot.append(scroller);
  return slot;
}

/** Display formula, with an optional right-aligned equation number. */
export function renderEqBlock(latex, eqnum = "", display = true) {
  const math = renderMathEl(latex, display);
  const slot = wrapScrollSlot(math, false);
  if (!eqnum) {
    slot.classList.add("math-slot-block");
    return slot;
  }
  const wrap = document.createElement("div");
  wrap.className = "eq-block";
  const num = document.createElement("span");
  num.className = "eq-num";
  num.textContent = String(eqnum).trim();
  wrap.append(slot, num);
  return wrap;
}

export function isDisplayEqParts(parts) {
  if (!parts || !parts.length) return false;
  const meaningful = parts.filter((p) => {
    if (p.type === "math") return !!(p.latex || "").trim();
    return !!(p.text || "").trim();
  });
  const math = meaningful.filter((p) => p.type === "math" && p.display);
  if (!math.length) return false;
  const rest = meaningful.filter((p) => !(p.type === "math" && p.display));
  return rest.every((p) => p.type === "eqnum" || (p.type === "text" && isEqNumberText(p.text)));
}

/** Mount a paragraph of parts as a block element (eq-block or <p>). */
export function mountParts(parts) {
  if (isDisplayEqParts(parts)) {
    const math = parts.find((p) => p.type === "math" && p.display);
    const num = parts.find((p) => p.type === "eqnum" || (p.type === "text" && isEqNumberText(p.text)));
    return renderEqBlock(math.latex || "", num ? (num.text || "").trim() : "", true);
  }
  const p = document.createElement("p");
  appendParts(p, parts);
  return p;
}

export function appendParts(host, parts) {
  if (!parts || !parts.length) return;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.type === "math") {
      if (part.display && host && host.tagName === "P") {
        // Avoid putting a <div> in a <p> (the browser would split the paragraph
        // and drop a following equation number onto the next line).
        const next = parts[i + 1];
        const num = next && (next.type === "eqnum" || (next.type === "text" && isEqNumberText(next.text)))
          ? (next.text || "").trim()
          : "";
        if (num) i += 1;
        const block = renderEqBlock(part.latex || "", num, true);
        if (host.parentNode) host.parentNode.insertBefore(block, host.nextSibling);
        else host.append(block);
        continue;
      }
      if (part.display) {
        const next = parts[i + 1];
        const num = next && (next.type === "eqnum" || (next.type === "text" && isEqNumberText(next.text)))
          ? (next.text || "").trim()
          : "";
        if (num) i += 1;
        host.append(renderEqBlock(part.latex || "", num, true));
        continue;
      }
      host.append(wrapScrollSlot(renderMathEl(part.latex || "", false), true));
    } else if (part.type === "eqnum") {
      const s = document.createElement("span");
      s.className = "eq-num";
      s.textContent = part.text || "";
      host.append(s);
    } else if (part.type === "sub" || part.type === "sup") {
      const s = document.createElement(part.type);
      s.textContent = part.text || "";
      host.append(s);
    } else if (part.text) {
      host.append(document.createTextNode(part.text));
    }
  }
}

function katexRoot(math) {
  return math.querySelector(".katex-html") || math.querySelector(".katex-display > .katex, .katex") || math;
}

function contentWidth(math) {
  const k = katexRoot(math);
  const rootR = k.getBoundingClientRect();
  let right = rootR.right;
  const nodes = k.querySelectorAll(".base, .mord, .mop, .mrel, .mbin, .msupsub, .vlist, .vlist-t, span");
  for (const n of nodes) {
    const r = n.getBoundingClientRect();
    if (r.width && r.right > right) right = r.right;
  }
  const ink = right - rootR.left;
  return Math.ceil(Math.max(k.scrollWidth, k.offsetWidth, rootR.width, ink) + 1);
}

function resetScale(math) {
  math.style.fontSize = "";
  math.style.removeProperty("--math-scale");
  math.dataset.mathScale = "1";
}

function applyScale(math, scale) {
  const s = Math.max(MIN_MATH_SCALE, Math.min(1, scale));
  math.style.setProperty("--math-scale", String(s));
  math.dataset.mathScale = String(s);
  math.style.fontSize = s === 1 ? "" : `calc(1em * ${s})`;
  return s;
}

function syncOverflowHint(slot, scroller) {
  if (!slot || !scroller) return;
  const overflow = scroller.scrollWidth > scroller.clientWidth + 2;
  slot.classList.toggle("is-overflow", overflow);
  slot.classList.toggle("is-scrolled", overflow && scroller.scrollLeft > 2);
  slot.classList.toggle(
    "is-scroll-end",
    overflow && scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2
  );
}

function fitOne(math, avail) {
  resetScale(math);
  if (avail <= 0) return 1;
  const need = contentWidth(math);
  if (need <= avail + 1) return 1;
  return applyScale(math, avail / need);
}

/**
 * Shrink display/inline formulas to fit (min ~0.75). If still too wide,
 * leave them in a horizontally scrollable slot. For numbered equations,
 * keep the number on the same line when possible; otherwise place it
 * below, right-aligned.
 */
export function fitAllMath(root = document) {
  if (!root || !root.querySelectorAll) return;
  const boxes = root.querySelectorAll(".eq-block");
  for (const box of boxes) {
    box.classList.remove("eq-wrap");
    const slot = box.querySelector(".math-slot");
    const math = box.querySelector(".math-block, .math-inline");
    const scroller = box.querySelector(".math-hscroll");
    const num = box.querySelector(".eq-num");
    if (!slot || !math || !scroller) continue;
    resetScale(math);
    const boxW = box.clientWidth;
    const numW = num ? Math.ceil(num.getBoundingClientRect().width) + 8 : 0;
    const sameLineAvail = Math.max(0, boxW - numW);
    fitOne(math, sameLineAvail);
    const stillWide = contentWidth(math) > sameLineAvail + 1 || scroller.scrollWidth > scroller.clientWidth + 1;
    if (stillWide) {
      box.classList.add("eq-wrap");
      resetScale(math);
      fitOne(math, boxW);
    }
    syncOverflowHint(slot, scroller);
  }

  const loose = root.querySelectorAll(".math-slot");
  for (const slot of loose) {
    if (slot.closest(".eq-block")) continue;
    const math = slot.querySelector(".math-block, .math-inline");
    const scroller = slot.querySelector(".math-hscroll");
    if (!math || !scroller) continue;
    resetScale(math);
    const host = slot.closest("p, li, td, .article") || slot.parentElement;
    const avail = Math.max(0, (host && host.clientWidth) || scroller.clientWidth || 0);
    fitOne(math, avail);
    syncOverflowHint(slot, scroller);
  }
}

export function bindMathScrollHints(root) {
  if (!root || root.__mathScrollBound) return;
  root.__mathScrollBound = true;
  root.addEventListener("scroll", (e) => {
    const sc = e.target;
    if (!sc || !sc.dataset || sc.dataset.mathScroll === undefined) return;
    const slot = sc.closest(".math-slot");
    if (slot) syncOverflowHint(slot, sc);
  }, { capture: true, passive: true });
}

export { MIN_MATH_SCALE };
