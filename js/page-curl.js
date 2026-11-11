/** Canvas page-curl: peels the current page bitmap and reveals the page underneath. */

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

/**
 * progress: 0 = closed, 1 = fully turned
 * fromRight: true = turn forward (grab right edge)
 */
export function drawPageCurl(ctx, image, w, h, progress, fromRight, follow) {
  ctx.clearRect(0, 0, w, h);
  if (!image || progress <= 0.001) {
    if (image) ctx.drawImage(image, 0, 0, w, h);
    return;
  }
  if (progress >= 0.999) return;

  const dir = fromRight ? 1 : -1;
  // Drag point defaults to a slightly lower-right (or left) follow along the edge.
  const t = clamp(progress, 0, 1);
  // Ease the curl so it starts at the edge and travels across.
  const travel = t * t * (3 - 2 * t);
  const startX = fromRight ? w : 0;
  const destX = fromRight ? -0.05 * w : w + 0.05 * w;
  let ax = follow && Number.isFinite(follow.x) ? follow.x : startX + (destX - startX) * travel;
  let ay = follow && Number.isFinite(follow.y) ? follow.y : h * 0.82;
  ax = clamp(ax, fromRight ? -0.35 * w : 0, fromRight ? w : w * 1.35);
  ay = clamp(ay, 8, h - 8);

  const cx = fromRight ? w : 0;
  const cy = h;

  // If the user grabs mid-edge, treat the corner as the nearer vertical extreme
  // so the fold stays on the page.
  const cornerY = ay > h * 0.45 ? h : 0;
  const cyy = follow && Number.isFinite(follow.y) ? cornerY : cy;

  let fx = (ax + cx) / 2;
  let fy = (ay + cyy) / 2;
  let dx = ax - cx;
  let dy = ay - cyy;
  const len = Math.hypot(dx, dy) || 1;
  // Fold line is the perpendicular bisector of corner→grab.
  // Normal pointing toward the grabbed (curled) side:
  let nx = dx / len;
  let ny = dy / len;

  // Intersect fold line with page edges to build the peeled polygon.
  // Line: (p - F) · N = 0  =>  p·N = F·N
  const c = fx * nx + fy * ny;
  const hits = intersectEdges(w, h, nx, ny, c);

  ctx.save();

  // 1. Draw the remaining front page (the part that has not been peeled).
  ctx.save();
  ctx.beginPath();
  if (hits.length >= 2) {
    // Keep the side opposite the grab corner.
    clipOpposite(ctx, w, h, hits, cx, cyy);
  } else {
    ctx.rect(0, 0, w, h);
  }
  ctx.clip();
  ctx.drawImage(image, 0, 0, w, h);
  ctx.restore();

  // 2. Draw the folded flap (reflected around the fold line) if it is on-page.
  if (hits.length >= 2 && t > 0.02) {
    drawFlap(ctx, image, w, h, ax, ay, cx, cyy, nx, ny, fx, fy, hits, fromRight);
  }

  ctx.restore();
}

function intersectEdges(w, h, nx, ny, c) {
  const pts = [];
  const add = (x, y, edge) => {
    if (x >= -0.5 && x <= w + 0.5 && y >= -0.5 && y <= h + 0.5) {
      pts.push({ x: clamp(x, 0, w), y: clamp(y, 0, h), edge });
    }
  };
  // top y=0, bottom y=h, left x=0, right x=w
  if (Math.abs(ny) > 1e-6) {
    add((c - ny * 0) / nx, 0, "t");
    add((c - ny * h) / nx, h, "b");
  }
  if (Math.abs(nx) > 1e-6) {
    add(0, (c - nx * 0) / ny, "l");
    add(w, (c - nx * w) / ny, "r");
  }
  // unique, prefer farthest pair
  const uniq = [];
  for (const p of pts) {
    if (!uniq.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.8)) uniq.push(p);
  }
  if (uniq.length <= 2) return uniq;
  let best = [uniq[0], uniq[1]], bestD = -1;
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const d = Math.hypot(uniq[i].x - uniq[j].x, uniq[i].y - uniq[j].y);
      if (d > bestD) {
        bestD = d;
        best = [uniq[i], uniq[j]];
      }
    }
  }
  return best;
}

function clipOpposite(ctx, w, h, hits, cx, cy) {
  // Build a polygon of the page minus the corner triangle/region that's being peeled.
  // The remaining region is the set of page corners whose side is opposite the grab corner
  // relative to the fold, plus the two hit points.
  const [a, b] = hits;
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  // Side of fold for the grab corner:
  const cornerSide = (cx - a.x) * (b.y - a.y) - (cy - a.y) * (b.x - a.x);
  const keep = [];
  const edgeOf = (p) => {
    if (Math.abs(p.y) < 0.6) return 0;
    if (Math.abs(p.x - w) < 0.6) return 1;
    if (Math.abs(p.y - h) < 0.6) return 2;
    return 3;
  };
  // Walk the boundary clockwise and keep points not on the peeled side.
  const ring = [
    corners[0],
    ...hitsNamed(hits, "t"),
    corners[1],
    ...hitsNamed(hits, "r"),
    corners[2],
    ...hitsNamed(hits, "b"),
    corners[3],
    ...hitsNamed(hits, "l"),
  ];
  // Simpler: start from a, walk page edges in order to b on the non-corner side, then close.
  ctx.moveTo(a.x, a.y);
  const ordered = orderAlongBoundary(w, h, hits);
  // Pick the path from a to b that does not include the grab corner.
  const pathA = boundaryPath(w, h, ordered[0], ordered[1], { x: cx, y: cy }, false);
  for (const p of pathA) ctx.lineTo(p.x, p.y);
  ctx.closePath();
}

function hitsNamed(hits, edge) {
  return hits.filter((h) => h.edge === edge);
}

function orderAlongBoundary(w, h, hits) {
  const key = (p) => {
    if (Math.abs(p.y) < 0.6) return p.x;
    if (Math.abs(p.x - w) < 0.6) return w + p.y;
    if (Math.abs(p.y - h) < 0.6) return w + h + (w - p.x);
    return 2 * w + h + (h - p.y);
  };
  return hits.slice().sort((a, b) => key(a) - key(b));
}

function boundaryPath(w, h, a, b, avoid, includeAvoid) {
  // Walk clockwise from a to b. If the path contains `avoid`, take the other way
  // unless includeAvoid is set.
  const corners = [
    { x: 0, y: 0, k: 0 },
    { x: w, y: 0, k: 1 },
    { x: w, y: h, k: 2 },
    { x: 0, y: h, k: 3 },
  ];
  const key = (p) => {
    if (Math.abs(p.y) < 0.6) return p.x / Math.max(1, w);
    if (Math.abs(p.x - w) < 0.6) return 1 + p.y / Math.max(1, h);
    if (Math.abs(p.y - h) < 0.6) return 2 + (w - p.x) / Math.max(1, w);
    return 3 + (h - p.y) / Math.max(1, h);
  };
  const ka = key(a);
  const kb = key(b);
  const walk = (from, to) => {
    const pts = [{ x: from.x, y: from.y }];
    let k = key(from);
    const end = key(to);
    let guard = 0;
    while (guard++ < 8) {
      const nextCornerK = Math.floor(k) + 1;
      if (end > k && end <= nextCornerK + 1e-9 || (end < k && nextCornerK >= 4 && end + 4 <= nextCornerK)) {
        pts.push({ x: to.x, y: to.y });
        break;
      }
      const ci = ((Math.floor(k) + 1) % 4 + 4) % 4;
      pts.push({ x: corners[ci].x, y: corners[ci].y });
      k = ci;
      if (Math.abs(k - end) < 1e-6) {
        pts.push({ x: to.x, y: to.y });
        break;
      }
      if (k <= end && key(from) <= end) {
        // continue
      }
      if (guard > 4 && pts.length > 1) {
        pts.push({ x: to.x, y: to.y });
        break;
      }
    }
    return pts;
  };
  // Clockwise a→b
  const cw = walkClockwise(w, h, a, b, key);
  const contains = cw.some((p) => Math.hypot(p.x - avoid.x, p.y - avoid.y) < 1);
  if (contains && !includeAvoid) return walkClockwise(w, h, a, b, key, true);
  return cw;
}

function walkClockwise(w, h, a, b, key, otherWay = false) {
  if (otherWay) return walkClockwise(w, h, b, a, key, false).reverse();
  const pts = [];
  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  let k = key(a);
  const end = key(b);
  const target = end < k ? end + 4 : end;
  pts.push({ x: a.x, y: a.y });
  for (let i = 0; i < 5; i++) {
    const next = Math.floor(k) + 1;
    if (target <= next + 1e-8) {
      pts.push({ x: b.x, y: b.y });
      return pts;
    }
    const ci = ((next % 4) + 4) % 4;
    pts.push(corners[ci]);
    k = next;
  }
  pts.push({ x: b.x, y: b.y });
  return pts;
}

function reflectPoint(px, py, fx, fy, nx, ny) {
  const d = (px - fx) * nx + (py - fy) * ny;
  return { x: px - 2 * d * nx, y: py - 2 * d * ny };
}

function drawFlap(ctx, image, w, h, ax, ay, cx, cy, nx, ny, fx, fy, hits, fromRight) {
  const [a, b] = hits;
  const tip = reflectPoint(cx, cy, fx, fy, nx, ny);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.clip();

  // Reflect the page across the fold and draw it in the flap.
  // Use transform() (not setTransform) so the overlay's device-pixel scale is kept.
  ctx.save();
  const a11 = 1 - 2 * nx * nx;
  const a12 = -2 * nx * ny;
  const a21 = -2 * ny * nx;
  const a22 = 1 - 2 * ny * ny;
  const tx = 2 * (fx * nx * nx + fy * nx * ny);
  const ty = 2 * (fx * ny * nx + fy * ny * ny);
  ctx.transform(a11, a21, a12, a22, tx, ty);
  ctx.drawImage(image, 0, 0, w, h);
  ctx.restore();

  // Soft backside tint so the flap reads as paper, not a perfect mirror.
  const grad = ctx.createLinearGradient(a.x, a.y, tip.x, tip.y);
  grad.addColorStop(0, "rgba(255,255,255,0.04)");
  grad.addColorStop(0.55, "rgba(246,241,232,0.18)");
  grad.addColorStop(1, "rgba(210,200,184,0.28)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Shadow along the fold, on both the flap and a little onto the revealed page.
  ctx.restore();

  ctx.save();
  const foldLen = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const fxn = (b.x - a.x) / foldLen;
  const fyn = (b.y - a.y) / foldLen;
  // Perp pointing toward the tip (curled side)
  let px = -fyn, py = fxn;
  if ((tip.x - a.x) * px + (tip.y - a.y) * py < 0) {
    px = -px;
    py = -py;
  }
  const width = Math.max(8, Math.min(22, Math.hypot(tip.x - fx, tip.y - fy) * 0.10));
  const sg = ctx.createLinearGradient(
    (a.x + b.x) / 2 - px * width,
    (a.y + b.y) / 2 - py * width,
    (a.x + b.x) / 2 + px * width * 0.35,
    (a.y + b.y) / 2 + py * width * 0.35
  );
  sg.addColorStop(0, "rgba(40,28,18,0.00)");
  sg.addColorStop(0.6, "rgba(40,28,18,0.08)");
  sg.addColorStop(1, "rgba(40,28,18,0.20)");
  ctx.strokeStyle = sg;
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  // Spine highlight on the flap edge
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

export function createCurlOverlay(viewport) {
  const canvas = document.createElement("canvas");
  canvas.className = "curl-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.hidden = true;
  viewport.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  let cssW = 0;
  let cssH = 0;

  function resize(w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = Math.max(1, Math.round(w));
    cssH = Math.max(1, Math.round(h));
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function show(image, progress, fromRight, follow) {
    canvas.hidden = false;
    drawPageCurl(ctx, image, cssW, cssH, progress, fromRight, follow);
  }

  function hide() {
    canvas.hidden = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return { canvas, resize, show, hide, get width() { return cssW; }, get height() { return cssH; } };
}

/** Prefetch styles and fonts used by the snapshot renderer. */
export function prefetchCaptureCss() {
  loadCaptureCss().catch(() => {});
}

let cssPromise = null;

function u8ToB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function mimeForUrl(url) {
  const n = String(url).split("?")[0].toLowerCase();
  if (n.endsWith(".woff2")) return "font/woff2";
  if (n.endsWith(".woff")) return "font/woff";
  if (n.endsWith(".ttf")) return "font/ttf";
  if (n.endsWith(".otf")) return "font/otf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

async function embedCssUrls(cssText, baseUrl) {
  const matches = [...cssText.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
  const unique = [];
  const seen = new Set();
  for (const m of matches) {
    const raw = m[2].trim();
    if (!raw || raw.startsWith("data:") || seen.has(raw)) continue;
    seen.add(raw);
    unique.push(raw);
  }
  const map = new Map();
  await Promise.all(unique.map(async (rel) => {
    try {
      const abs = new URL(rel, baseUrl);
      const res = await fetch(abs, { cache: "force-cache" });
      if (!res.ok) return;
      const data = `data:${mimeForUrl(abs.pathname)};base64,${u8ToB64(await res.arrayBuffer())}`;
      map.set(rel, data);
    } catch (err) {
      console.warn("capture font skip", rel, err);
    }
  }));
  return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, q, raw) => {
    const data = map.get(raw.trim());
    return data ? `url("${data}")` : whole;
  });
}

async function loadCaptureCss() {
  if (cssPromise) return cssPromise;
  cssPromise = (async () => {
    const appUrl = new URL("../css/app.css", import.meta.url);
    const katexUrl = new URL("../vendor/katex/katex.min.css", import.meta.url);
    const [appRaw, katexRaw] = await Promise.all([
      fetchText(appUrl).catch(() => ""),
      fetchText(katexUrl).catch(() => ""),
    ]);
    const [app, katex] = await Promise.all([
      embedCssUrls(appRaw, appUrl),
      embedCssUrls(katexRaw, katexUrl),
    ]);
    // Match index.html load order (KaTeX, then app.css) so cascade matches the live page.
    // The snapshot lives under .capture-root, not html.mode-paged.
    let css = `${katex}\n${app.replace(/html\.mode-paged/g, ".capture-root")}`;
    css += `
      .capture-root { margin:0; padding:0; background:var(--bg,#F6F1E8); color:var(--ink,#2A221C); }
      .capture-root .page-viewport { position:absolute !important; left:0 !important; top:0 !important; right:auto !important; bottom:auto !important; width:100% !important; height:100% !important; overflow:hidden !important; contain:none; }
      .capture-root .curl-canvas, .capture-root .page-indicator { display:none !important; }
      .katex, .katex * { font-display: block; }
    `;
    return css;
  })();
  return cssPromise;
}

function copyCssVars(fromEl) {
  const cs = getComputedStyle(fromEl);
  const names = [
    "--bg","--bg-soft","--ink","--ink-dim","--rule","--accent","--accent-ink",
    "--card","--shadow","--bar","--figure-bg","--ok","--font","--line","--side",
    "--bar-h","--page-h","--serif","--sans","--safe-t","--safe-b",
  ];
  let out = "";
  for (const n of names) {
    const v = cs.getPropertyValue(n);
    if (v) out += `${n}:${v};`;
  }
  return out;
}

function stripHidden(root) {
  root.querySelectorAll(".curl-canvas, .page-indicator").forEach((n) => n.remove());
}

/** Rasterize a visible element with KaTeX CSS and fonts embedded, so formulas match the live page. */
export async function captureElement(el, opts = {}) {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const w = Math.max(1, Math.round(opts.width || rect.width));
  const h = Math.max(1, Math.round(opts.height || rect.height));
  const scale = Math.min(2, opts.scale || window.devicePixelRatio || 1);
  try {
    const bmp = await captureBySvg(el, w, h, scale, opts.fill);
    if (bmp) return bmp;
  } catch (err) {
    console.warn("capture svg failed", err);
  }
  return solidPaper(w, h, scale, opts.fill || "#F6F1E8");
}

async function captureBySvg(el, w, h, scale, fill) {
  const css = await loadCaptureCss();
  const bg = fill || getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || getComputedStyle(el).backgroundColor || "#F6F1E8";
  const clone = el.cloneNode(true);
  stripHidden(clone);
  clone.style.position = "absolute";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.right = "auto";
  clone.style.bottom = "auto";
  clone.style.width = w + "px";
  clone.style.height = h + "px";
  clone.style.overflow = "hidden";
  clone.style.margin = "0";
  clone.style.inset = "auto";
  clone.style.contain = "none";

  const wrap = document.createElement("div");
  wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrap.className = "capture-root mode-paged";
  if (document.documentElement.dataset.theme) {
    wrap.dataset.theme = document.documentElement.dataset.theme;
  }
  wrap.setAttribute(
    "style",
    `${copyCssVars(document.documentElement)}width:${w}px;height:${h}px;overflow:hidden;background:${bg};position:relative;`
  );
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  wrap.append(styleEl, clone);

  const xhtml = new XMLSerializer().serializeToString(wrap);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const img = new Image();
  img.crossOrigin = "anonymous";
  const ok = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  if (!ok) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    const sample = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
    const corner = ctx.getImageData(8, 8, 1, 1).data;
    if (sample[3] === 0 && corner[3] === 0) return null;
  } catch {
    // local data URLs should not taint; if they do, still return the canvas
  }
  return canvas;
}

function solidPaper(w, h, scale, fill) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}
