const CJK = /[\u3000-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

export function isCjkChar(ch) {
  return ch && CJK.test(ch);
}

const CJK_RUN = /[　-鿿豈-﫿]/;

export function tidyText(s) {
  if (!s) return s;
  s = s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s.replace(/([　-鿿豈-﫿])[ 	 　]+([　-鿿豈-﫿])/g, "$1$2");
  }
  s = s.replace(/([　-鿿])[ 	 ]+([，。；：、！？）】》])/g, "$1$2");
  s = s.replace(/([（【《])[ 	 ]+([　-鿿])/g, "$1$2");
  s = s.replace(/([　-鿿])[ 	 ]+([0-9A-Za-z])/g, "$1$2");
  s = s.replace(/([0-9A-Za-z])[ 	 ]+([　-鿿])/g, "$1$2");
  s = s.replace(/([第卷期页共条章节篇])/g, "$1");
  s = s.replace(/([第共])\s*(\d(?:[\s,，]\d){0,6})\s*([卷第期页条章节篇])/g, (_, a, nums, b) => a + nums.replace(/[\s,，]/g, "") + b);
  // "F i g . 1" / "V o l . 3 1" style tracking
  s = s.replace(/(?:\b[A-Za-z0-9]\s){3,}[A-Za-z0-9]\b(?:\s*[.,;:])?/g, (m) => m.replace(/\s+/g, ""));
  s = s.replace(/([A-Za-z])\s+([.,;:])/g, "$1$2");
  s = s.replace(/[ 	]{2,}/g, " ").trim();
  return s;
}

function shortCaption(text) {
  const t = tidyText(text);
  const m = t.match(/^(?:图|表|Figure|Fig\.?|Table|Tab\.?)\s*[\d一二三四五六七八九十]+(?:\s*[:：.、．]?\s*[^。；;]{0,40})?/i);
  if (m) return m[0].trim();
  return t.length > 48 ? t.slice(0, 48) : t;
}

function hypot(a, b) {
  return Math.hypot(a, b);
}

function transform(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyViewport(pdfjsLib, viewport, itemTransform) {
  if (pdfjsLib.Util && pdfjsLib.Util.transform) {
    return pdfjsLib.Util.transform(viewport.transform, itemTransform);
  }
  return transform(viewport.transform, itemTransform);
}

function median(nums) {
  if (!nums.length) return 0;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function normalizeHeader(s) {
  return tidyText(s)
    .replace(/\s+/g, "")
    .replace(/[0-9０-９]/g, "#")
    .replace(/第#+[卷期页章节]/g, "")
    .slice(0, 80);
}

const CAPTION_RE = /^(?:\s*)(?:图|表|Figure|Fig\.?|Table|Tab\.?)\s*[\d０-９一二三四五六七八九十]+/i;
const PAGE_NUM_RE = /^(?:[-–—]?\s*)(?:第\s*)?\d{1,4}(?:\s*页)?(?:\s*[-–—])?$/;
const HEADING_RE = /^(?:摘要|Abstract|关键词|Keywords?|引言|前言|绪论|结论|讨论|参考文献|致谢|附录|符号说明|试验|实验|分析|第[一二三四五六七八九十百零〇0-9]+[章节篇部分]|[0-9]{1,2}(?:\.[0-9]{1,2}){0,3}\s+[\u4e00-\u9fffA-Z])/i;

export function looksLikeCaption(text) {
  return CAPTION_RE.test(text.trim());
}

function looksLikeJournalMeta(text) {
  const t = tidyText(text);
  return /第\s*\d+\s*[卷期]|文章编号|中图分类号|文献标志码|收稿日期|基金项目|作者简介|^DOI\s*:/i.test(t)
    || /Vol\.?\s*\d+\s*No\.?/i.test(t)
    || /China\s*J\.?\s*Highw/i.test(t)
    || (/(学报|学刊)$/.test(t) && t.length <= 16)
    || /^(Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)\.\s*\d{4}$/i.test(t);
}

export function looksLikeHeading(text, fontSize, bodySize) {
  const t = tidyText(text).trim();
  if (!t || t.length > 80) return false;
  if (looksLikeJournalMeta(t)) return false;
  if (HEADING_RE.test(t)) return true;
  if (bodySize && fontSize >= bodySize * 1.22 && t.length <= 40) return true;
  return false;
}

function splitHeadingPrefix(text) {
  const t = tidyText(text);
  const m = t.match(/^(摘要|Abstract|关键词|Keywords?|引言|前言|结论|参考文献|致谢)[:：]\s*(.{8,})$/i);
  if (m) return { head: m[1], body: m[2].trim() };
  return null;
}

function joinTokens(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (/[A-Za-z\u00ad]-$/.test(a) && /^[a-z]/.test(b)) {
    return a.replace(/[\u00ad]-?$/, "").replace(/-$/, "") + b;
  }
  const left = a.slice(-1);
  const right = b.charAt(0);
  if (isCjkChar(left) || isCjkChar(right) || /[（）()[\]【】《》…—，。；、：]/.test(left) || /[（）()[\]【】《》…—，。；、：]/.test(right)) {
    return a + b;
  }
  if (/\s$/.test(a) || /^\s/.test(b)) return a + b;
  return a + " " + b;
}

function joinLineItems(items) {
  if (!items.length) return "";
  let out = items[0].str;
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const gap = cur.x - (prev.x + prev.width);
    const em = Math.max(prev.fontSize, cur.fontSize, 1);
    if (gap > em * 0.28) {
      const a = out.slice(-1);
      const b = cur.str.charAt(0);
      if (isCjkChar(a) && isCjkChar(b)) {
        // justified Chinese: do not insert a space
      } else if (isCjkChar(a) || isCjkChar(b) || /[，。；：、！？）】》]/.test(a) || /[（【《]/.test(b)) {
        // keep tight around CJK punctuation
      } else {
        out += " ";
      }
    }
    out += cur.str;
  }
  return tidyText(out.replace(/[\u00ad]/g, ""));
}

function itemsFromTextContent(pdfjsLib, page, textContent, viewport) {
  const items = [];
  for (const raw of textContent.items) {
    if (!raw || raw.str == null) continue;
    const str = String(raw.str).replace(/\s+/g, " ");
    if (!str.trim() && !raw.hasEOL) continue;
    const tr = applyViewport(pdfjsLib, viewport, raw.transform);
    const fontSize = hypot(tr[2], tr[3]) || Math.abs(tr[3]) || 10;
    const xScale = hypot(tr[0], tr[1]) || 1;
    const srcScale = hypot(raw.transform[0], raw.transform[1]) || 1;
    const width = (raw.width || 0) * (xScale / srcScale);
    items.push({
      str,
      x: tr[4],
      y: tr[5],
      width: width || str.length * fontSize * 0.5,
      fontSize,
      fontName: raw.fontName || "",
      hasEOL: !!raw.hasEOL,
    });
  }
  return items;
}

function finishLine(items) {
  items.sort((a, b) => a.x - b.x);
  return {
    items,
    x: items[0].x,
    x2: Math.max(...items.map((i) => i.x + i.width)),
    y: items.reduce((s, i) => s + i.y, 0) / items.length,
    fontSize: median(items.map((i) => i.fontSize)) || items[0].fontSize,
    text: joinLineItems(items),
  };
}

function splitByGutter(items, pageWidth) {
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => a.x - b.x);
  const clusters = [];
  let cur = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const it = sorted[i];
    const gap = it.x - (prev.x + prev.width);
    const em = Math.max(prev.fontSize, it.fontSize, 1);
    if (gap > Math.max((pageWidth || 600) * 0.055, em * 2.3)) {
      clusters.push(cur);
      cur = [it];
    } else {
      cur.push(it);
    }
  }
  clusters.push(cur);
  return clusters;
}

function groupLines(items, pageWidth) {
  if (!items.length) return [];
  const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    const tol = Math.max(it.fontSize, last ? last.fontSize : 10) * 0.45;
    if (last && Math.abs(it.y - last.y) <= tol) {
      last.items.push(it);
      last.y = (last.y * (last.items.length - 1) + it.y) / last.items.length;
      last.fontSize = Math.max(last.fontSize, it.fontSize);
    } else {
      rows.push({ items: [it], y: it.y, fontSize: it.fontSize });
    }
  }
  const lines = [];
  for (const row of rows) {
    for (const cluster of splitByGutter(row.items, pageWidth)) {
      const line = finishLine(cluster);
      if (line.text) lines.push(line);
    }
  }
  return lines;
}

function detectColumns(lines, pageWidth) {
  const body = lines.filter((l) => l.text.length >= 2);
  if (body.length < 8) return { mode: "single", gutter: pageWidth / 2 };

  const mids = body.map((l) => (l.x + l.x2) / 2).sort((a, b) => a - b);
  const minX = Math.min(...body.map((l) => l.x));
  const maxX = Math.max(...body.map((l) => l.x2));
  const span = maxX - minX;
  if (span < pageWidth * 0.45) return { mode: "single", gutter: pageWidth / 2 };

  // Find the largest gap between midpoints in the middle half of the page.
  let bestGap = 0;
  let gutter = pageWidth / 2;
  for (let i = 1; i < mids.length; i++) {
    const gap = mids[i] - mids[i - 1];
    const mid = (mids[i] + mids[i - 1]) / 2;
    if (mid > pageWidth * 0.32 && mid < pageWidth * 0.68 && gap > bestGap) {
      bestGap = gap;
      gutter = mid;
    }
  }

  const left = body.filter((l) => (l.x + l.x2) / 2 < gutter);
  const right = body.filter((l) => (l.x + l.x2) / 2 >= gutter);
  const leftShare = left.length / body.length;
  const rightShare = right.length / body.length;
  const twoCol = bestGap > pageWidth * 0.04 && leftShare > 0.22 && rightShare > 0.22;
  return { mode: twoCol ? "double" : "single", gutter };
}

function lineColumn(line, layout, pageWidth) {
  if (layout.mode !== "double") return "full";
  const mid = (line.x + line.x2) / 2;
  const width = line.x2 - line.x;
  if (width > pageWidth * 0.55 || (line.x < pageWidth * 0.18 && line.x2 > pageWidth * 0.72)) {
    return "full";
  }
  return mid < layout.gutter ? "left" : "right";
}

function bandify(lines, layout, pageWidth) {
  if (layout.mode !== "double") {
    return lines.map((l) => ({ ...l, column: "full" }));
  }
  const tagged = lines.map((l) => ({ ...l, column: lineColumn(l, layout, pageWidth) }));
  const bands = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const hasFull = current.some((l) => l.column === "full");
    const hasCols = current.some((l) => l.column !== "full");
    if (hasFull && hasCols) {
      // split full-width lines into their own bands
      let chunk = [];
      const kind = (l) => (l.column === "full" ? "full" : "cols");
      let k = kind(current[0]);
      for (const l of current) {
        const nk = kind(l);
        if (nk !== k && chunk.length) {
          emit(chunk);
          chunk = [];
          k = nk;
        }
        chunk.push(l);
      }
      emit(chunk);
    } else {
      emit(current);
    }
    current = [];
  };
  const emit = (chunk) => {
    const left = chunk.filter((l) => l.column === "left").sort((a, b) => a.y - b.y);
    const right = chunk.filter((l) => l.column === "right").sort((a, b) => a.y - b.y);
    const full = chunk.filter((l) => l.column === "full").sort((a, b) => a.y - b.y);
    if (full.length && !left.length && !right.length) {
      bands.push(...full);
      return;
    }
    bands.push(...left, ...right, ...full);
  };
  for (const l of tagged) {
    current.push(l);
  }
  flush();
  return bands;
}

function linesToParagraphs(lines, pageWidth, bodySize) {
  const blocks = [];
  let buf = "";
  let bufFont = bodySize;
  let bufY = 0;
  let bufCol = "full";

  const pushBuf = () => {
    const text = tidyText(buf);
    buf = "";
    if (!text) return;
    if (looksLikeJournalMeta(text) && text.length < 80) {
      blocks.push({ type: "meta", text, fontSize: bufFont, y: bufY, column: bufCol });
      return;
    }
    const kind = looksLikeCaption(text)
      ? "caption"
      : looksLikeHeading(text, bufFont, bodySize)
        ? (bufFont >= bodySize * 1.35 || text.length < 20 ? "h2" : "h3")
        : "p";
    blocks.push({ type: kind, text, fontSize: bufFont, y: bufY, column: bufCol });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const text = tidyText(line.text);
    const prefix = splitHeadingPrefix(text);
    if (prefix) {
      pushBuf();
      blocks.push({ type: "h2", text: prefix.head, fontSize: line.fontSize, y: line.y, column: line.column });
      buf = prefix.body;
      bufFont = line.fontSize;
      bufY = line.y;
      bufCol = line.column;
      const reachesEdgeP = line.x2 >= (line.column === "left" ? pageWidth * 0.48 : pageWidth * 0.92) - line.fontSize * 1.2;
      if (!reachesEdgeP) pushBuf();
      continue;
    }
    const isHead = looksLikeHeading(text, line.fontSize, bodySize) && text.length <= 80;
    const isCap = looksLikeCaption(text);
    const shortLine = (line.x2 - line.x) < pageWidth * (line.column === "full" ? 0.72 : 0.38)
      && text.length < 90;
    // A line is "short" if it doesn't reach near the right edge of its column.
    let colRight = pageWidth * 0.92;
    if (line.column === "left") colRight = pageWidth * 0.48;
    if (line.column === "right") colRight = pageWidth * 0.96;
    const reachesEdge = line.x2 >= colRight - line.fontSize * 1.2;
    const gap = next ? next.y - line.y : 999;
    const paraGap = line.fontSize * 1.55;
    const colChange = next && line.column !== "full" && next.column !== line.column && next.column !== "full";

    if (isHead || isCap) {
      pushBuf();
      blocks.push({
        type: isCap ? "caption" : (line.fontSize >= bodySize * 1.35 ? "h2" : "h3"),
        text,
        fontSize: line.fontSize,
        y: line.y,
        column: line.column,
      });
      continue;
    }

    if (!buf) {
      buf = text;
      bufFont = line.fontSize;
      bufY = line.y;
      bufCol = line.column;
    } else {
      buf = joinTokens(buf, text);
    }

    const endPara = !next
      || isHead
      || colChange
      || gap > paraGap
      || (!reachesEdge && (shortLine || /[。．.！？!?]$/.test(text)));
    if (endPara) pushBuf();
  }
  pushBuf();
  return blocks;
}

function detectRunningHeaders(pages) {
  const counts = new Map();
  for (const p of pages) {
    const h = p.height || 800;
    const band = p.lines.filter((l) => l.y < h * 0.08 || l.y > h * 0.92);
    const seen = new Set();
    for (const l of band) {
      const key = normalizeHeader(l.text);
      if (key.length < 2 || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const n = pages.length;
  const drop = new Set();
  for (const [k, c] of counts) {
    if (c >= Math.max(3, Math.ceil(n * 0.35))) drop.add(k);
  }
  return drop;
}

function filterRunning(lines, pageHeight, dropSet) {
  return lines.filter((l) => {
    const inBand = l.y < pageHeight * 0.07 || l.y > pageHeight * 0.925;
    if (!inBand) return true;
    if (PAGE_NUM_RE.test(l.text.trim())) return false;
    if (dropSet.has(normalizeHeader(l.text))) return false;
    if (l.text.trim().length <= 4 && inBand && PAGE_NUM_RE.test(l.text.replace(/\s/g, ""))) return false;
    return true;
  });
}

async function imageFromObj(obj) {
  if (!obj) return null;
  if (obj.bitmap) {
    const bmp = obj.bitmap;
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    return { url: canvas.toDataURL("image/jpeg", 0.88), w: bmp.width, h: bmp.height };
  }
  const w = obj.width;
  const h = obj.height;
  if (!w || !h || !obj.data) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const src = obj.data;
  const kind = obj.kind; // 1 GRAY_1, 2 RGB_24, 3 RGBA_32
  if (kind === 1) {
    // 1 bpp packed
    let i = 0;
    const bit = src;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const byte = bit[(y * Math.ceil(w / 8)) + (x >> 3)] || 0;
        const on = (byte << (x & 7)) & 0x80 ? 0 : 255;
        img.data[i++] = on; img.data[i++] = on; img.data[i++] = on; img.data[i++] = 255;
      }
    }
  } else if (kind === 2 || src.length === w * h * 3) {
    let i = 0, j = 0;
    const n = w * h;
    for (let k = 0; k < n; k++) {
      img.data[i++] = src[j++];
      img.data[i++] = src[j++];
      img.data[i++] = src[j++];
      img.data[i++] = 255;
    }
  } else if (kind === 3 || src.length === w * h * 4) {
    img.data.set(src.length === img.data.length ? src : src.subarray(0, img.data.length));
  } else if (src.length === w * h) {
    let i = 0;
    for (let k = 0; k < src.length; k++) {
      const v = src[k];
      img.data[i++] = v; img.data[i++] = v; img.data[i++] = v; img.data[i++] = 255;
    }
  } else {
    return null;
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL("image/jpeg", 0.88), w, h };
}

function waitObj(objs, name) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v || null);
    };
    try {
      const existing = objs.get(name, done);
      if (existing) done(existing);
      setTimeout(() => done(null), 800);
    } catch {
      done(null);
    }
  });
}

async function extractRasterImages(pdfjsLib, page, viewport) {
  const ops = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  const figures = [];
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const paintFns = new Set([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintJpegXObject,
    OPS.paintImageMaskXObject,
  ].filter(Boolean));

  const paints = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) {
      stack.push(ctm.slice());
    } else if (fn === OPS.restore) {
      ctm = stack.pop() || ctm;
    } else if (fn === OPS.transform) {
      ctm = transform(ctm, args);
    } else if (paintFns.has(fn) && fn !== OPS.paintImageMaskXObject) {
      const name = args && args[0];
      const wPage = hypot(ctm[0], ctm[1]);
      const hPage = hypot(ctm[2], ctm[3]);
      if (!name || wPage < 36 || hPage < 36 || wPage * hPage < 80 * 80) continue;
      // Image is 1x1 in user space, mapped by CTM. Convert to viewport.
      const corners = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ].map(([x, y]) => {
        const ux = ctm[0] * x + ctm[2] * y + ctm[4];
        const uy = ctm[1] * x + ctm[3] * y + ctm[5];
        const v = viewport.convertToViewportPoint(ux, uy);
        return { x: v[0], y: v[1] };
      });
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const rect = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
        name,
        fn,
      };
      paints.push(rect);
    }
  }

  // Dedup nearly identical rects
  const uniq = [];
  for (const r of paints) {
    const hit = uniq.find((u) => Math.abs(u.x - r.x) < 4 && Math.abs(u.y - r.y) < 4 && Math.abs(u.w - r.w) < 4);
    if (!hit) uniq.push(r);
  }

  for (const r of uniq) {
    let obj = await waitObj(page.objs, r.name);
    if (!obj) obj = await waitObj(page.commonObjs, r.name);
    const img = await imageFromObj(obj);
    if (!img) continue;
    // Skip very thin lines or logo-like tiny bitmaps that survived
    if (img.w < 40 || img.h < 40) continue;
    figures.push({
      type: "figure",
      source: "raster",
      url: img.url,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      pageWidth: viewport.width,
      pageHeight: viewport.height,
    });
  }
  return figures;
}

async function renderPageRegion(page, viewport, rect, scale) {
  const s = scale || 2;
  const vp = page.getViewport({ scale: s });
  const full = document.createElement("canvas");
  full.width = Math.ceil(vp.width);
  full.height = Math.ceil(vp.height);
  const ctx = full.getContext("2d");
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const x = Math.max(0, Math.floor(rect.x * s) - 4);
  const y = Math.max(0, Math.floor(rect.y * s) - 4);
  const w = Math.min(full.width - x, Math.ceil(rect.w * s) + 8);
  const h = Math.min(full.height - y, Math.ceil(rect.h * s) + 8);
  if (w < 8 || h < 8) return null;
  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  crop.getContext("2d").drawImage(full, x, y, w, h, 0, 0, w, h);
  return crop.toDataURL("image/jpeg", 0.9);
}

function columnBounds(line, layout, pageWidth) {
  if (!layout || layout.mode !== "double") return { x: 0, x2: pageWidth };
  const col = lineColumn(line, layout, pageWidth);
  if (col === "left") return { x: 0, x2: layout.gutter };
  if (col === "right") return { x: layout.gutter, x2: pageWidth };
  return { x: 0, x2: pageWidth };
}

function captionRects(lines, figures, pageWidth, pageHeight, layout) {
  const caps = lines.filter((l) => looksLikeCaption(l.text));
  const rects = [];
  for (const cap of caps) {
    const bounds = columnBounds(cap, layout, pageWidth);
    const capMid = (cap.x + cap.x2) / 2;
    // Prefer the closest figure above the caption in the same column.
    const above = figures
      .filter((f) => {
        const fMid = f.x + f.w / 2;
        const sameCol = fMid >= bounds.x - 8 && fMid <= bounds.x2 + 8;
        return sameCol && f.y + f.h <= cap.y + 8 && f.y + f.h > cap.y - pageHeight * 0.55;
      })
      .sort((a, b) => (cap.y - (a.y + a.h)) - (cap.y - (b.y + b.h)));
    let rect;
    if (above[0]) {
      const f = above[0];
      const full = f.w > pageWidth * 0.58;
      const left = full ? Math.max(0, Math.min(f.x, cap.x) - 6) : Math.max(bounds.x, Math.min(f.x, cap.x) - 6);
      const right = full ? Math.min(pageWidth, Math.max(f.x + f.w, cap.x2) + 6) : Math.min(bounds.x2, Math.max(f.x + f.w, cap.x2) + 6);
      rect = {
        x: left,
        y: Math.max(0, f.y - 6),
        w: Math.max(24, right - left),
        h: cap.y - Math.max(0, f.y - 6) + cap.fontSize * 1.6,
        caption: shortCaption(cap.text),
        yInsert: cap.y,
      };
    } else {
      const sameCol = lines.filter((l) => l !== cap && Math.abs(((l.x + l.x2) / 2) - capMid) < (bounds.x2 - bounds.x) * 0.45);
      const prev = sameCol.filter((l) => l.y < cap.y - cap.fontSize * 2).sort((a, b) => b.y - a.y)[0];
      const top = prev ? Math.min(prev.y + prev.fontSize * 1.6, cap.y - 40) : Math.max(0, cap.y - pageHeight * 0.32);
      const height = cap.y - top;
      if (height < 48) continue;
      const left = Math.max(bounds.x, Math.min(cap.x, bounds.x + 8) - 4);
      const right = Math.min(bounds.x2, Math.max(cap.x2, cap.x + (bounds.x2 - bounds.x) * 0.7) + 6);
      rect = {
        x: left,
        y: top,
        w: Math.max(cap.x2 - cap.x + 16, right - left),
        h: height + cap.fontSize * 1.6,
        caption: shortCaption(cap.text),
        yInsert: cap.y,
        guessed: true,
      };
    }
    // Never let a single-column caption crop spill into the other column.
    if (layout && layout.mode === "double" && rect.w > pageWidth * 0.62 && (bounds.x2 - bounds.x) < pageWidth * 0.62) {
      rect.x = bounds.x;
      rect.w = bounds.x2 - bounds.x;
    }
    rects.push(rect);
  }
  return rects;
}

function overlaps(a, b, ratio = 0.55) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = x * y;
  const area = Math.min(a.w * a.h, b.w * b.h);
  return area > 0 && inter / area > ratio;
}

export async function extractPdf(buffer, { onProgress, pdfjsLib } = {}) {
  if (!pdfjsLib) throw new Error("missing pdfjs");
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  const base = new URL("../vendor/pdfjs/", import.meta.url);
  const loading = pdfjsLib.getDocument({
    data,
    cMapUrl: new URL("cmaps/", base).toString(),
    cMapPacked: true,
    standardFontDataUrl: new URL("standard_fonts/", base).toString(),
    wasmUrl: new URL("wasm/", base).toString(),
    iccUrl: new URL("iccs/", base).toString(),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  const meta = await pdf.getMetadata().catch(() => null);
  const outline = await pdf.getOutline().catch(() => null);
  const pages = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    if (onProgress) onProgress(n, pdf.numPages);
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent({ includeMarkedContent: false, disableNormalization: false });
    const items = itemsFromTextContent(pdfjsLib, page, textContent, viewport);
    const lines = groupLines(items, viewport.width);
    let figures = [];
    try {
      figures = await extractRasterImages(pdfjsLib, page, viewport);
    } catch (err) {
      console.warn("figure extract failed", n, err);
    }
    pages.push({
      pageNum: n,
      width: viewport.width,
      height: viewport.height,
      lines,
      figures,
      page,
      viewport,
    });
  }

  const dropSet = detectRunningHeaders(pages);
  const allBlocks = [];
  const headings = [];
  const bodySizes = pages.flatMap((p) => p.lines.map((l) => l.fontSize));
  const bodySize = median(bodySizes) || 10;

  for (const p of pages) {
    const cleaned = filterRunning(p.lines, p.height, dropSet);
    const layout = detectColumns(cleaned, p.width);
    const ordered = bandify(cleaned, layout, p.width);
    const textBlocks = linesToParagraphs(ordered, p.width, bodySize);

    // Caption-based region renders (catches vector drawings).
    const capRects = captionRects(cleaned, p.figures, p.width, p.height, layout);
    const regionFigs = [];
    for (const rect of capRects) {
      if (rect.h < 40 || rect.w < 40) continue;
      try {
        const url = await renderPageRegion(p.page, p.viewport, rect, 2);
        if (url) {
          regionFigs.push({
            type: "figure",
            source: "region",
            url,
            x: rect.x,
            y: rect.y,
            w: rect.w,
            h: rect.h,
            caption: rect.caption,
            yInsert: rect.yInsert,
          });
        }
      } catch (err) {
        console.warn("region render failed", p.pageNum, err);
      }
    }

    const standalone = p.figures.filter((f) => !regionFigs.some((r) => overlaps(f, r, 0.45)));
    const figBlocks = [
      ...regionFigs,
      ...standalone.map((f) => ({ ...f, yInsert: f.y + f.h })),
    ];

    const merged = [
      ...textBlocks.map((b) => ({ ...b, _y: b.y, _kind: "t" })),
      ...figBlocks.map((b) => ({ ...b, _y: b.yInsert || b.y, _kind: "f" })),
    ];

    // Keep XY-cut text order, but splice figures at their y position within that stream.
    // textBlocks are already in reading order; insert figures after the last text block with y <= figure.y
    const usedCaps = new Set();
    const out = [];
    for (const b of textBlocks) {
      const pending = figBlocks
        .filter((f) => !f._placed && (f.yInsert || f.y) <= (b.y || 0) + 2)
        .sort((a, c) => (a.yInsert || a.y) - (c.yInsert || c.y));
      for (const f of pending) {
        f._placed = true;
        if (f.caption) {
        f.caption = shortCaption(f.caption);
        usedCaps.add(f.caption);
        usedCaps.add(f.caption.replace(/\s+/g, ""));
      }
        out.push(f);
      }
      // drop standalone caption paragraph if we already attached it to a figure
      if (b.type === "caption" && figBlocks.some((f) => f.caption === b.text)) {
        continue;
      }
      out.push(b);
    }
    for (const f of figBlocks.filter((f) => !f._placed)) {
      out.push(f);
    }

    for (const b of out) {
      const block = { ...b, pageNum: p.pageNum };
      delete block._placed;
      delete block._y;
      delete block._kind;
      allBlocks.push(block);
      if (block.type === "h2" || block.type === "h3") {
        headings.push({
          id: `h-${headings.length}`,
          text: block.text,
          level: block.type === "h2" ? 2 : 3,
          pageNum: p.pageNum,
        });
        block.id = headings[headings.length - 1].id;
      }
    }

    allBlocks.push({ type: "page-break", pageNum: p.pageNum, pageCount: pdf.numPages });
    // Release page canvas resources; keep pdf for 看原页
    p.page.cleanup();
  }

  const isBoilerplateTitle = (s) => {
    if (!s) return true;
    const t = String(s).trim();
    if (t.length < 4) return true;
    return /untitled|unknown|microsoft word|provided proper attribution|hereby grants permission|all rights reserved|copyright\s*©|creativecommons|arxiv:\s*\d/i.test(t);
  };

  let title = (meta && meta.info && (meta.info.Title || meta.info.title)) || "";
  if (isBoilerplateTitle(title)) title = "";
  if (!title) {
    const page1Heads = allBlocks.filter((b) => (b.type === "h2" || b.type === "h3") && (b.pageNum === 1 || !b.pageNum) && b.text && !isBoilerplateTitle(b.text) && !/^(abstract|摘要|关键词|keywords?)$/i.test(b.text.trim()));
    page1Heads.sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
    if (page1Heads[0]) title = page1Heads[0].text;
  }
  if (!title) {
    const cands = allBlocks.filter((b) => b.text && b.pageNum === 1 && b.text.length >= 6 && b.text.length <= 90 && !isBoilerplateTitle(b.text) && b.type !== "caption" && b.type !== "figure" && b.type !== "page-break");
    cands.sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
    if (cands[0]) title = cands[0].text;
  }

  // Outline headings as a fallback / supplement
  if (outline && outline.length && headings.length < 3) {
    const walk = (items, level) => {
      for (const it of items || []) {
        if (it.title && it.title.trim()) {
          headings.push({ id: `o-${headings.length}`, text: it.title.trim(), level: Math.min(level, 3) });
        }
        if (it.items && it.items.length) walk(it.items, level + 1);
      }
    };
    // Don't duplicate if we already have plenty; only use when detection was weak
    const extra = [];
    const collect = (items, level) => {
      for (const it of items || []) {
        if (it.title && it.title.trim()) extra.push({ text: it.title.trim(), level: Math.min(level, 3) });
        if (it.items) collect(it.items, level + 1);
      }
    };
    collect(outline, 2);
    if (extra.length > headings.length) {
      headings.length = 0;
      extra.forEach((h, i) => headings.push({ id: `o-${i}`, text: h.text, level: h.level }));
      // Try to match heading text in blocks for jump targets
      for (const h of headings) {
        const hit = allBlocks.find((b) => (b.type === "h2" || b.type === "h3" || b.type === "p") && b.text && b.text.replace(/\s/g, "").includes(h.text.replace(/\s/g, "").slice(0, 12)));
        if (hit) {
          hit.id = hit.id || h.id;
          h.pageNum = hit.pageNum;
        }
      }
    }
  }

  return {
    kind: "pdf",
    title: (title || "").trim(),
    numPages: pdf.numPages,
    blocks: allBlocks,
    headings,
    pdf,
    meta,
  };
}

export async function renderPdfPage(pdf, pageNum, scale) {
  const page = await pdf.getPage(pageNum);
  const s = scale || Math.min(2.4, (window.devicePixelRatio || 1) * 1.6);
  const viewport = page.getViewport({ scale: s });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const url = canvas.toDataURL("image/jpeg", 0.92);
  page.cleanup();
  return { url, width: viewport.width, height: viewport.height };
}
