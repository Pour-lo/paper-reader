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

function isRunningJournalLine(text) {
  const s = tidyText(text).replace(/\s+/g, "");
  if (!s) return false;
  // Alternating left/right running heads, optionally with a page number glued on.
  return /^(?:\d{4}年\d{1,2}月[–\-—]\d{1,2}月[|｜]\s*《?PCI(?:期刊|杂志)?》?|《?PCI(?:期刊|杂志)?》?\s*[|｜]\d{4}年\d{1,2}月[–\-—]\d{1,2}月)\d{0,4}$/.test(s);
}

function stripRunningJournal(text) {
  let s = tidyText(text);
  s = s.replace(/\s*(?:\d{4}年\d{1,2}月[–\-—]\s*\d{1,2}月\s*[|｜]\s*《?PCI(?:期刊|杂志)?》?|《?PCI(?:期刊|杂志)?》?\s*[|｜]\s*\d{4}年\d{1,2}月[–\-—]\s*\d{1,2}月)\s*\d{0,4}\s*$/g, "");
  s = s.replace(/^\s*(?:\d{4}年\d{1,2}月[–\-—]\s*\d{1,2}月\s*[|｜]\s*《?PCI(?:期刊|杂志)?》?|《?PCI(?:期刊|杂志)?》?\s*[|｜]\s*\d{4}年\d{1,2}月[–\-—]\s*\d{1,2}月)\s*\d{0,4}\s*/g, "");
  return tidyText(s);
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
    || (/Vol[.．]?\d/i.test(t) && /\d{4}\s*年/.test(t) && t.length < 48)
    || /China\s*J\.?\s*Highw/i.test(t)
    || (/(学报|学刊)$/.test(t) && t.length <= 16)
    || /^(Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)[.．]\s*\d{4}$/i.test(t);
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

function rectUnion(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: x2 - x, h: y2 - y };
}

function rectGap(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const gapX = ix > 0 ? 0 : Math.min(Math.abs(a.x + a.w - b.x), Math.abs(b.x + b.w - a.x));
  const gapY = iy > 0 ? 0 : Math.min(Math.abs(a.y + a.h - b.y), Math.abs(b.y + b.h - a.y));
  return { ix, iy, gapX, gapY, overlap: ix > 0 && iy > 0 };
}

function rectsNear(a, b, gap = 22) {
  const g = rectGap(a, b);
  if (g.overlap) return true;
  if (g.ix > 0 && g.gapY <= gap) return true;
  if (g.iy > 0 && g.gapX <= gap) return true;
  return g.gapX <= gap && g.gapY <= gap;
}

function lineRect(l) {
  const h = (l.fontSize || 10) * 1.35;
  return { x: l.x, y: l.y - 2, w: Math.max(8, (l.x2 || l.x + 12) - l.x), h };
}

function inflate(r, pad) {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

function clusterRects(rects, gap = 18) {
  const items = rects.map((r) => ({ ...r }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (rectsNear(items[i], items[j], gap)) {
          const u = rectUnion(items[i], items[j]);
          u.kind = items[i].kind || items[j].kind;
          items[i] = u;
          items.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return items;
}

function num4(v) {
  if (!v) return null;
  const a = [v[0], v[1], v[2], v[3]];
  if (a.every((n) => typeof n === "number" && isFinite(n))) return a;
  return null;
}

function extractVectorRects(pdfjsLib, ops, viewport, pageWidth, pageHeight, textItems) {
  const OPS = pdfjsLib.OPS;
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const raw = [];

  const toViewBox = (x0, y0, x1, y1) => {
    const corners = [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ].map(([x, y]) => {
      const ux = ctm[0] * x + ctm[2] * y + ctm[4];
      const uy = ctm[1] * x + ctm[3] * y + ctm[5];
      const v = viewport.convertToViewportPoint(ux, uy);
      return { x: v[0], y: v[1] };
    });
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform && args) ctm = transform(ctm, args);
    else if (fn === OPS.constructPath && args) {
      const mm = num4(args[2]) || num4(args[args.length - 1]);
      if (!mm) continue;
      raw.push(toViewBox(mm[0], mm[1], mm[2], mm[3]));
    } else if (fn === OPS.rectangle && args && args.length >= 4) {
      raw.push(toViewBox(args[0], args[1], args[0] + args[2], args[1] + args[3]));
    }
  }

  const inflateHairline = (r, m = 2.2) => {
    const out = { x: r.x, y: r.y, w: r.w, h: r.h };
    if (out.w < m) { out.x -= (m - out.w) / 2; out.w = m; }
    if (out.h < m) { out.y -= (m - out.h) / 2; out.h = m; }
    return out;
  };
  const pathOnText = (r) => {
    if (!textItems || !textItems.length) return false;
    const ra = Math.max(0.01, r.w * r.h);
    for (const t of textItems) {
      const tb = { x: t.x - 1, y: t.y - 1, w: (t.width || 8) + 2, h: (t.fontSize || 10) * 1.35 + 2 };
      const g = rectGap(r, tb);
      if (!g.overlap) continue;
      const oa = g.ix * g.iy;
      // Outlined glyphs and short rules sitting on a character.
      if (oa / ra > 0.45 && ra < 80 * 80) return true;
      if (r.x >= tb.x - 2 && r.y >= tb.y - 2 && r.x + r.w <= tb.x + tb.w + 2 && r.y + r.h <= tb.y + tb.h + 2) return true;
    }
    return false;
  };

  const kept = [];
  for (const box of raw) {
    const r = inflateHairline(box);
    if (r.w > pageWidth * 0.95 && r.h > pageHeight * 0.9) continue;
    const long = Math.max(r.w, r.h);
    const short = Math.min(r.w, r.h);
    if (long < 8) continue;
    if (r.w * r.h < 8 && long < 16) continue;
    if (pathOnText(r)) continue;
    // Top running-header rules only. Bottom drawing strokes often sit in the footer band.
    if (r.y < pageHeight * 0.06 && r.h < 4 && r.w > pageWidth * 0.4) continue;
    kept.push(r);
  }
  const clustered = clusterRects(kept, 10).filter((r) => r.w >= 8 && r.h >= 6);
  return clustered.filter((r) => !(r.w > pageWidth * 0.95 && r.h > pageHeight * 0.85));
}

const DIM_RE = /(?:英\s*尺|英\s*寸|毫\s*米|厘\s*米|跨度|槽钢|槽形|平板|肋条|肋梁|间距|深度|宽度|厚度|构件)|(?:\d[\d./¼½¾⅓⅔⅛⅜⅝⅞]*\s*(?:英|尺|寸|英尺|英寸|毫米|cm|mm|ft|in))/i;

function isDimVocab(t) {
  const s = String(t || "").replace(/\s+/g, "");
  if (!s) return false;
  if (/^[dD]$/.test(s)) return true;
  if (/^[0-9０-９]+$/.test(s) && s.length <= 6) return true;
  if (/^[0-9０-９]*[¼½¾⅓⅔⅛⅜⅝⅞][0-9０-９]*$/.test(s)) return true;
  if (/^\d+\/\d+$/.test(s)) return true;
  if (DIM_RE.test(t) || DIM_RE.test(s)) return true;
  if (/[¼½¾⅓⅔⅛⅜⅝⅞]/.test(s) && s.length <= 14) return true;
  if (/^(寸|英|尺|英寸|英尺|毫米)$/.test(s)) return true;
  return false;
}

function isWatermarkText(s) {
  return /deepl|translated\s+by\s+deepl|subscribe to deepl|www\.deepl\.com/i.test(String(s || ""));
}

function annotationClusters(lines, bodySize, pageWidth) {
  const cands = [];
  for (const l of lines) {
    const t = tidyText(l.text);
    if (!t || looksLikeCaption(t) || looksLikeHeading(t, l.fontSize, bodySize)) continue;
    const dim = isDimVocab(t) && t.length <= 40;
    const short = t.length <= 12;
    if (dim || short) cands.push({ line: l, dim, short, t });
  }
  cands.sort((a, b) => a.line.y - b.line.y);
  const groups = [];
  let g = [];
  for (const c of cands) {
    if (!g.length || c.line.y - g[g.length - 1].line.y < 40) g.push(c);
    else { groups.push(g); g = [c]; }
  }
  if (g.length) groups.push(g);

  const regions = [];
  const marked = new Set();
  for (const grp of groups) {
    const dimN = grp.filter((c) => c.dim).length;
    const xs = grp.map((c) => c.line.x);
    const xSpread = Math.max(...xs) - Math.min(...xs);
    const irregular = xSpread > pageWidth * 0.2;
    const enough = dimN >= 2
      || (dimN >= 1 && grp.length >= 3 && irregular)
      || (grp.length >= 5 && irregular);
    if (!enough) continue;
    const boxes = grp.map((c) => lineRect(c.line));
    let rect = boxes[0];
    for (let i = 1; i < boxes.length; i++) rect = rectUnion(rect, boxes[i]);
    regions.push(inflate(rect, 8));
    grp.forEach((c) => marked.add(c.line));
  }
  return { regions, lines: marked };
}

function lineInsideRegion(line, region, pad = 2) {
  const r = lineRect(line);
  const g = rectGap(r, inflate(region, pad));
  const area = r.w * r.h;
  return area > 0 && g.overlap && (g.ix * g.iy) / area > 0.45;
}

function isTextFrame(rect, lines) {
  const inside = (lines || []).filter((l) => lineInsideRegion(l, rect, 0));
  if (inside.length < 3) return false;
  const long = inside.filter((l) => {
    const t = tidyText(l.text);
    return t.length >= 10 && !isDimVocab(t) && !looksLikeCaption(t);
  });
  if (long.length < 3) return false;
  const ys = inside.map((l) => l.y);
  const span = Math.max(...ys) - Math.min(...ys) + 12;
  return span > rect.h * 0.4 && long.length >= 4;
}

function regionBodyStats(lines, rect) {
  const inside = (lines || []).filter((l) => lineInsideRegion(l, rect, 2));
  const texts = inside.map((l) => tidyText(l.text)).filter(Boolean);
  const longBody = texts.filter((t) => t.length >= 16 && !isDimVocab(t) && !looksLikeCaption(t));
  return { n: texts.length, longBody: longBody.length, chars: texts.join("").length };
}

function clusterRectsLimited(rects, gap, pageHeight, lines) {
  const items = rects.map((r) => ({ ...r }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (!rectsNear(items[i], items[j], gap)) continue;
        const u = rectUnion(items[i], items[j]);
        u.kind = items[i].kind || items[j].kind;
        if (items[i].src && !u.src) u.src = items[i].src;
        if (items[j].src && !u.src) u.src = items[j].src;
        // Refuse merges that swallow a whole page or a text column.
        if (u.h > pageHeight * 0.72 && u.h > Math.max(items[i].h, items[j].h) * 1.35) continue;
        if (lines && isTextFrame(u, lines) && !isTextFrame(items[i], lines) && !isTextFrame(items[j], lines)) continue;
        items[i] = u;
        items.splice(j, 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return items;
}

function mergeFigureMaterials(rasters, drawings, annRegions, pageWidth, pageHeight, lines) {
  const raw = [];
  for (const f of rasters || []) {
    if (f.y + (f.h || 0) < pageHeight * 0.1 && (f.h || 0) < pageHeight * 0.12) continue;
    if ((f.w || 0) > pageWidth * 1.2) continue;
    raw.push({ x: f.x, y: f.y, w: f.w, h: f.h, kind: "raster", src: f });
  }
  for (const d of drawings || []) {
    if (d.h > pageHeight * 0.72 && isTextFrame(d, lines)) continue;
    if (d.w > pageWidth * 0.95 && d.h > pageHeight * 0.85) continue;
    // Running-header / watermark bands at the very top are not figures.
    if (d.y < pageHeight * 0.08 && d.h < 48 && d.w > pageWidth * 0.4) continue;
    // Keep substantial drawing clusters or wide panels (grey figure bands).
    const panel = d.w > pageWidth * 0.45 && d.h > 24;
    const drawing = d.w > 28 && d.h > 16 && d.w * d.h > 900;
    if (panel || drawing) raw.push({ ...d, kind: panel && d.h < pageHeight * 0.45 ? "panel" : "draw" });
  }
  for (const a of annRegions || []) raw.push({ ...a, kind: "ann" });
  return clusterRectsLimited(raw, 22, pageHeight, lines)
    .filter((r) => r.w >= 24 && r.h >= 16 && r.h < pageHeight * 0.85)
    .filter((r) => r.kind === "raster" || r.kind === "ann" || !isTextFrame(r, lines));
}

function tightenRegion(rect, bodyLines, captionY) {
  let r = { ...rect };
  if (typeof captionY === "number") {
    if (r.y + r.h > captionY - 2) r.h = Math.max(12, captionY - 2 - r.y);
  }
  // Shrink from the top/bottom if body (non-annotation, non-caption) lines sit inside.
  const offenders = (bodyLines || []).filter((l) => {
    const t = tidyText(l.text);
    if (!t || looksLikeCaption(t) || isDimVocab(t) && t.length <= 40) return false;
    if (t.length <= 4) return false;
    return lineInsideRegion(l, r, 0);
  });
  if (offenders.length) {
    const tops = offenders.filter((l) => l.y < r.y + r.h * 0.4);
    const bottoms = offenders.filter((l) => l.y > r.y + r.h * 0.6);
    if (tops.length) {
      const bottomOfTops = Math.max(...tops.map((l) => l.y + (l.fontSize || 10) * 1.4));
      if (bottomOfTops < r.y + r.h - 30) {
        const cut = bottomOfTops + 4;
        r.h = r.y + r.h - cut;
        r.y = cut;
      }
    }
    if (bottoms.length) {
      const topOfBottoms = Math.min(...bottoms.map((l) => l.y - 2));
      if (topOfBottoms > r.y + 30) r.h = Math.min(r.h, topOfBottoms - r.y);
    }
  }
  return r;
}

function collectMaskBoxes(lines, pageHeight, dropSet) {
  const boxes = [];
  for (const l of lines) {
    const t = tidyText(l.text);
    if (!t) continue;
    const footerish = dropSet.has(normalizeHeader(l.text))
      || PAGE_NUM_RE.test(t)
      || isRunningJournalLine(t)
      || (/PCI\s*期刊|《\s*PCI(?:期刊|杂志)/.test(t) && t.length <= 40);
    if (!footerish) continue;
    boxes.push({
      x: l.x - 3,
      y: l.y - 3,
      w: Math.max(10, (l.x2 || l.x) - l.x) + 6,
      h: (l.fontSize || 10) * 1.6 + 4,
    });
  }
  return boxes;
}

function joinOrphanFragments(blocks) {
  const out = [];
  for (const b of blocks) {
    const joinable = (ty) => ty === "p" || ty === "h2" || ty === "h3";
    if (joinable(b.type) && out.length && joinable(out[out.length - 1].type)) {
      const prev = out[out.length - 1];
      const t = String(b.text || "").trim();
      const ptxt = String(prev.text || "").trim();
      const orphan = t.length <= 2 || /^(d|寸|英|尺)$/i.test(t);
      const prevBroken = /[A-Za-z\u4e00-\u9fff]$/.test(ptxt) && !/[。．！？!?]$/.test(ptxt);
      if (orphan && prevBroken) {
        prev.text = joinTokens(prev.text, t);
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

function captionBandRects(vectorRects, cap) {
  // Wide short bars sitting on the caption line (black caption strips) should stay out of the crop.
  return (vectorRects || []).filter((r) => {
    if (r.h > 36 || r.w < 80) return false;
    const capY = cap.y;
    return r.y <= capY && r.y + r.h >= capY - 2;
  });
}


function itemsFromTextContent(pdfjsLib, page, textContent, viewport) {
  const items = [];
  for (const raw of textContent.items) {
    if (!raw || raw.str == null) continue;
    const str = String(raw.str).replace(/\s+/g, " ");
    if (!str.trim() && !raw.hasEOL) continue;
    const tr = applyViewport(pdfjsLib, viewport, raw.transform);
    const fontSize = hypot(tr[2], tr[3]) || Math.abs(tr[3]) || 10;
    const rot = Math.atan2(tr[1], tr[0]) * 180 / Math.PI;
    if (Math.abs(rot) > 15) continue;
    if (isWatermarkText(str)) continue;
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
      rot,
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
    const t = tidyText(l.text);
    const inBand = l.y < pageHeight * 0.12 || l.y > pageHeight * 0.88;
    if (isRunningJournalLine(t)) return false;
    if (!inBand) return true;
    if (PAGE_NUM_RE.test(t)) return false;
    if (dropSet.has(normalizeHeader(l.text))) return false;
    if (t.length <= 4 && PAGE_NUM_RE.test(t.replace(/\s/g, ""))) return false;
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

async function renderPageRegion(page, viewport, rect, scale, maskBoxes) {
  const s = scale || 2.6;
  const vp = page.getViewport({ scale: s });
  const full = document.createElement("canvas");
  full.width = Math.ceil(vp.width);
  full.height = Math.ceil(vp.height);
  const ctx = full.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, full.width, full.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (maskBoxes && maskBoxes.length) {
    ctx.fillStyle = "#fff";
    for (const b of maskBoxes) {
      ctx.fillRect(b.x * s, b.y * s, b.w * s, b.h * s);
    }
  }
  const x = Math.max(0, Math.floor(rect.x * s) - 4);
  const y = Math.max(0, Math.floor(rect.y * s) - 4);
  const w = Math.min(full.width - x, Math.ceil(rect.w * s) + 8);
  const h = Math.min(full.height - y, Math.ceil(rect.h * s) + 8);
  if (w < 8 || h < 8) return null;
  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  const cctx = crop.getContext("2d");
  cctx.fillStyle = "#fff";
  cctx.fillRect(0, 0, w, h);
  cctx.drawImage(full, x, y, w, h, 0, 0, w, h);
  return crop.toDataURL("image/jpeg", 0.92);
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

export async function extractPdf(buffer, { onProgress, pdfjsLib, skipRender, onDebug } = {}) {
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
    let vectorRects = [];
    try {
      figures = await extractRasterImages(pdfjsLib, page, viewport);
    } catch (err) {
      console.warn("figure extract failed", n, err);
    }
    try {
      const ops = await page.getOperatorList();
      vectorRects = extractVectorRects(pdfjsLib, ops, viewport, viewport.width, viewport.height, items);
    } catch (err) {
      console.warn("vector extract failed", n, err);
    }
    pages.push({
      pageNum: n,
      width: viewport.width,
      height: viewport.height,
      items,
      lines,
      figures,
      vectorRects,
      page,
      viewport,
    });
  }

  const dropSet = detectRunningHeaders(pages);
  const allBlocks = [];
  const headings = [];
  const bodySizes = pages.flatMap((p) => p.lines.map((l) => l.fontSize));
  const bodySize = median(bodySizes) || 10;

  const analyzed = pages.map((p) => {
    const cleaned = filterRunning(p.lines, p.height, dropSet);
    const anns = annotationClusters(cleaned, bodySize, p.width);
    const materials = mergeFigureMaterials(p.figures, p.vectorRects, anns.regions, p.width, p.height, cleaned);
    const bodyForCols = cleaned.filter((l) => !anns.lines.has(l) && !materials.some((r) => lineInsideRegion(l, r)));
    const layout = detectColumns(bodyForCols.length >= 8 ? bodyForCols : cleaned, p.width);
    const masks = collectMaskBoxes(p.lines, p.height, dropSet);
    return { p, cleaned, anns, materials, layout, masks };
  });

  // Build render jobs, including cross-page caption stitches.
  const consumed = new Set();
  const jobs = [];

  const aboveCaption = (info, cap) => {
    const bounds = columnBounds(cap, info.layout, info.p.width);
    const bits = [];
    for (const r of info.materials) {
      const mid = r.x + r.w / 2;
      const sameCol = mid >= bounds.x - 12 && mid <= bounds.x2 + 12 || r.w > info.p.width * 0.55;
      if (!sameCol) continue;
      if (r.y < cap.y - 4 && r.y + r.h > cap.y - info.p.height * 0.7) bits.push(r);
    }
    // Also grab nearby rasters explicitly
    for (const f of info.p.figures) {
      if (f.y + f.h <= cap.y + 8 && f.y + f.h > cap.y - info.p.height * 0.6) {
        if (!bits.some((b) => overlaps(b, f, 0.4))) bits.push({ x: f.x, y: f.y, w: f.w, h: f.h, kind: "raster", src: f });
      }
    }
    if (!bits.length) return null;
    let u = { ...bits[0] };
    for (let i = 1; i < bits.length; i++) u = rectUnion(u, bits[i]);
    // Stop above the caption and any caption bar.
    const bars = captionBandRects(info.p.vectorRects, cap);
    let bottom = cap.y - 3;
    for (const b of bars) bottom = Math.min(bottom, b.y - 1);
    u = tightenRegion(u, info.cleaned, bottom);
    if (u.y + u.h > bottom) u.h = Math.max(8, bottom - u.y);
    return u.h >= 20 && u.w >= 20 ? u : null;
  };

  for (let i = 0; i < analyzed.length; i++) {
    const info = analyzed[i];
    const caps = info.cleaned.filter((l) => looksLikeCaption(l.text));
    for (const cap of caps) {
      let here = aboveCaption(info, cap);
      const prev = i > 0 ? analyzed[i - 1] : null;
      const capHigh = cap.y < info.p.height * 0.34;
      const hereIsTopPanel = here && here.y < info.p.height * 0.12 && here.h < info.p.height * 0.32;
      let prevRegion = null;
      if (prev && (capHigh || hereIsTopPanel || !here)) {
        const bottoms = prev.materials.filter((r) => r.y + r.h > prev.p.height * 0.68 && r.y > prev.p.height * 0.45);
        if (bottoms.length) {
          prevRegion = bottoms.reduce((a, b) => rectUnion(a, b));
          prevRegion = tightenRegion(prevRegion, prev.cleaned, prev.p.height);
        }
      }
      if (prevRegion && (capHigh || hereIsTopPanel || !here)) {
        const hereRect = here || {
          x: Math.max(0, cap.x - 8),
          y: 0,
          w: Math.min(info.p.width, Math.max(cap.x2 - cap.x + 24, info.p.width * 0.8)),
          h: Math.max(12, cap.y - 3),
        };
        // If "here" doesn't start near the top, still include from 0 when stitching a continued figure.
        if (hereRect.y > 24 && capHigh) {
          hereRect.h = hereRect.y + hereRect.h;
          hereRect.y = 0;
        }
        jobs.push({
          type: "stitch",
          cap,
          caption: shortCaption(cap.text),
          yInsert: cap.y,
          pageNum: info.p.pageNum,
          a: { page: prev.p.page, viewport: prev.p.viewport, rect: prevRegion, masks: prev.masks },
          b: { page: info.p.page, viewport: info.p.viewport, rect: hereRect, masks: info.masks },
          consume: [prevRegion, hereRect],
          consumePages: [prev, info],
        });
        consumed.add(prevRegion);
        if (here) consumed.add(here);
        continue;
      }
      if (here) {
        jobs.push({
          type: "single",
          cap,
          caption: shortCaption(cap.text),
          yInsert: cap.y,
          pageNum: info.p.pageNum,
          page: info.p.page,
          viewport: info.p.viewport,
          rect: here,
          masks: info.masks,
        });
        consumed.add(here);
      }
    }
  }

  // Uncaptioned leftover regions (e.g. a drawing whose caption was already stitched).
  for (const info of analyzed) {
    for (const r of info.materials) {
      if ([...consumed].some((c) => c && overlaps(c, r, 0.4))) continue;
      // Skip very thin leftover rules and frames that are mostly body text.
      if (r.h < 28) continue;
      if (r.y + r.h < info.p.height * 0.12 && r.h < 80) continue;
      if (r.y > info.p.height * 0.9 && r.h < 50) continue;
      const stats = regionBodyStats(info.cleaned, r);
      if (stats.longBody >= 2 && r.kind !== "raster") continue;
      const drawn = r.kind === "raster" || r.kind === "draw" || r.kind === "panel"
        || (r.kind === "ann" && stats.n >= 3 && stats.longBody === 0);
      if (!drawn) continue;
      jobs.push({
        type: "single",
        cap: null,
        caption: "",
        yInsert: r.y + r.h,
        pageNum: info.p.pageNum,
        page: info.p.page,
        viewport: info.p.viewport,
        rect: r,
        masks: info.masks,
      });
      consumed.add(r);
    }
  }

  if (typeof onDebug === "function") {
    onDebug({
      jobs: jobs.map((j) => ({
        type: j.type,
        pageNum: j.pageNum,
        caption: j.caption,
        rect: j.rect || null,
        a: j.a && j.a.rect,
        b: j.b && j.b.rect,
      })),
      pages: analyzed.map((info) => ({
        pageNum: info.p.pageNum,
        width: info.p.width,
        height: info.p.height,
        nVec: (info.p.vectorRects || []).length,
        vectors: (info.p.vectorRects || []).map((r) => ({ x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.w.toFixed(1), h:+r.h.toFixed(1) })),
        nMat: info.materials.length,
        materials: info.materials.map((r) => ({ kind: r.kind, x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.w.toFixed(1), h:+r.h.toFixed(1) })),
        nAnn: info.anns.regions.length,
        anns: info.anns.regions.map((r) => ({ x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.w.toFixed(1), h:+r.h.toFixed(1) })),
        nRasters: (info.p.figures || []).length,
        rasters: (info.p.figures || []).map((r) => ({ x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.w.toFixed(1), h:+r.h.toFixed(1) })),
      })),
    });
  }

  const figByPage = new Map();
  const SCALE = 2.6;
  const urlFromCanvas = (canvas) => canvas.toDataURL("image/jpeg", 0.92);

  async function stitchCanvases(urlA, urlB) {
    const load = (url) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const ia = await load(urlA);
    const ib = await load(urlB);
    const w = Math.max(ia.width, ib.width);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = ia.height + ib.height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(ia, 0, 0);
    ctx.drawImage(ib, 0, ia.height);
    return urlFromCanvas(canvas);
  }

  for (const job of jobs) {
    try {
      let url = null;
      let rect = job.rect;
      if (skipRender) {
        url = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
        if (job.type === "stitch") rect = job.b.rect || job.a.rect;
      } else if (job.type === "stitch") {
        const ua = await renderPageRegion(job.a.page, job.a.viewport, job.a.rect, SCALE, job.a.masks);
        const ub = await renderPageRegion(job.b.page, job.b.viewport, job.b.rect, SCALE, job.b.masks);
        if (ua && ub) url = await stitchCanvases(ua, ub);
        else url = ua || ub;
        rect = job.b.rect || job.a.rect;
      } else {
        url = await renderPageRegion(job.page, job.viewport, job.rect, SCALE, job.masks);
      }
      if (!url) continue;
      const f = {
        type: "figure",
        source: job.type === "stitch" ? "stitch" : "region",
        url,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        caption: job.caption || "",
        yInsert: job.yInsert,
        pageNum: job.pageNum,
        capLine: job.cap || null,
      };
      const list = figByPage.get(job.pageNum) || [];
      list.push(f);
      figByPage.set(job.pageNum, list);
    } catch (err) {
      console.warn("region render failed", job.pageNum, err);
    }
  }

  for (const info of analyzed) {
    const p = info.p;
    const figBlocks = (figByPage.get(p.pageNum) || []).map((f) => {
      const col = (() => {
        if (info.layout.mode !== "double") return "full";
        if ((f.w || 0) > p.width * 0.55) return "full";
        const mid = (f.x || 0) + (f.w || 0) / 2;
        return mid < info.layout.gutter ? "left" : "right";
      })();
      return { ...f, column: col };
    });

    const figRects = [
      ...figBlocks,
      ...info.materials,
    ];
    const keepLines = info.cleaned.filter((l) => {
      if (looksLikeCaption(l.text) && figBlocks.some((f) => f.capLine === l || (f.caption && shortCaption(l.text) === f.caption))) {
        return false; // caption goes on the figure, not as a body paragraph
      }
      if (info.anns.lines.has(l)) return false;
      if (figRects.some((r) => lineInsideRegion(l, r, 4))) return false;
      return true;
    });
    const ordered = bandify(keepLines, info.layout, p.width);
    const textBlocks = joinOrphanFragments(linesToParagraphs(ordered, p.width, bodySize));

    const usedCaps = new Set();
    const out = [];
    const capKey = (s) => String(s || "").replace(/\s+/g, "");
    for (const b of textBlocks) {
      const pending = figBlocks
        .filter((f) => {
          if (f._placed) return false;
          if ((f.yInsert || f.y) > (b.y || 0) + 2) return false;
          const fCol = f.column || "full";
          const bCol = b.column || "full";
          return fCol === "full" || bCol === "full" || fCol === bCol;
        })
        .sort((a, c) => (a.yInsert || a.y) - (c.yInsert || c.y));
      for (const f of pending) {
        f._placed = true;
        if (f.caption) usedCaps.add(capKey(f.caption));
        out.push(f);
      }
      if (b.type === "caption") {
        const key = capKey(shortCaption(b.text));
        const raw = capKey(b.text);
        if ([...usedCaps].some((k) => k && (k === key || k === raw || raw.startsWith(k) || key.startsWith(k)))
          || figBlocks.some((f) => capKey(f.caption) && (capKey(f.caption) === key || raw.startsWith(capKey(f.caption))))) {
          continue;
        }
      }
      out.push(b);
    }
    for (const f of figBlocks.filter((f) => !f._placed)) out.push(f);

    for (const b of out) {
      const block = { ...b, pageNum: p.pageNum };
      delete block._placed;
      delete block.capLine;
      delete block.src;
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
  }

  for (const p of pages) {
    try { p.page.cleanup(); } catch {}
  }

  for (const b of allBlocks) {
    if (b.type === "p" || b.type === "h2" || b.type === "h3" || b.type === "meta") {
      const next = stripRunningJournal(b.text || "");
      if (next !== b.text) b.text = next;
    }
  }
  for (let i = allBlocks.length - 1; i >= 0; i--) {
    const b = allBlocks[i];
    if ((b.type === "p" || b.type === "meta") && (!b.text || isRunningJournalLine(b.text) || PAGE_NUM_RE.test(String(b.text).trim()))) {
      allBlocks.splice(i, 1);
    }
  }

  const isBoilerplateTitle = (s) => {
    if (!s) return true;
    const t = String(s).trim();
    if (t.length < 4) return true;
    return /untitled|unknown|microsoft word|provided proper attribution|hereby grants permission|all rights reserved|copyright\s*©|creativecommons|arxiv:\s*\d|subscribe to deepl/i.test(t);
  };

  const isAbstractLead = (s) => /^[■●•▪]/.test(String(s || "").trim()) || /^(本文|摘要|Abstract)\s/.test(String(s || "").trim());

  const stackedTitle = (() => {
    const page1 = allBlocks.filter((b) => b.pageNum === 1 && b.text && (b.type === "h2" || b.type === "h3" || b.type === "p") && !isAbstractLead(b.text));
    page1.sort((a, b) => (a.y || 0) - (b.y || 0));
    if (!page1.length) return { text: "", parts: [] };
    const first = page1[0];
    const firstText = String(first.text || "").trim();
    // Only stack short display-title lines. Legal headers, journal meta, or body
    // paragraphs at the top of page 1 must not become the document title.
    if (!firstText
      || firstText.length > 40
      || isBoilerplateTitle(firstText)
      || looksLikeJournalMeta(firstText)
      || isRunningJournalLine(firstText)
      || /[。．]$/.test(firstText)
      || /Vol\.?\s*\d|第\s*\d+\s*[卷期]/i.test(firstText)) {
      return { text: "", parts: [] };
    }
    const used = [first];
    for (let i = 1; i < page1.length && used.length < 4; i++) {
      const b = page1[i];
      const t = String(b.text || "").trim();
      if (t.length > 40) break;
      if ((b.y || 0) - (used[used.length - 1].y || 0) > Math.max(120, (first.fontSize || 18) * 4)) break;
      if ((b.fontSize || 0) && (first.fontSize || 0) && (b.fontSize || 0) < (first.fontSize || 0) * 0.78) break;
      if (/[。．]$/.test(t) || isAbstractLead(t)) break;
      used.push(b);
    }
    const text = used.map((b) => String(b.text || "").trim()).join("");
    return { text, parts: used };
  })();

  const applyStackedTitle = () => {
    if (!stackedTitle.text || stackedTitle.text.length < 6 || stackedTitle.text.length > 90) return;
    if (stackedTitle.parts.length > 1) {
      const keep = stackedTitle.parts[0];
      keep.text = stackedTitle.text;
      keep.type = "h2";
      const drop = new Set(stackedTitle.parts.slice(1));
      for (let i = allBlocks.length - 1; i >= 0; i--) {
        if (drop.has(allBlocks[i])) allBlocks.splice(i, 1);
      }
      const dropText = new Set(stackedTitle.parts.slice(1).map((p) => p.text));
      for (let i = headings.length - 1; i >= 0; i--) {
        if (dropText.has(headings[i].text) || (keep.id && headings[i].id === keep.id && headings[i].text !== keep.text)) {
          if (keep.id && headings[i].id === keep.id) headings[i].text = keep.text;
          else headings.splice(i, 1);
        }
      }
      if (keep.id) {
        const h = headings.find((x) => x.id === keep.id);
        if (h) h.text = keep.text;
      }
    }
  };

  let title = "";
  if (stackedTitle.text && stackedTitle.text.length >= 6 && stackedTitle.text.length <= 90 && !isAbstractLead(stackedTitle.text)) {
    title = stackedTitle.text;
    applyStackedTitle();
  }
  if (!title) {
    title = (meta && meta.info && (meta.info.Title || meta.info.title)) || "";
    if (isBoilerplateTitle(title) || isAbstractLead(title) || looksLikeJournalMeta(title)) title = "";
  }
  if (!title) {
    const page1Heads = allBlocks.filter((b) => (b.type === "h2" || b.type === "h3") && (b.pageNum === 1 || !b.pageNum) && b.text && !isBoilerplateTitle(b.text) && !isAbstractLead(b.text) && !looksLikeJournalMeta(b.text) && !/^(abstract|摘要|关键词|keywords?)$/i.test(b.text.trim()));
    page1Heads.sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
    if (page1Heads[0]) title = page1Heads[0].text;
  }
  if (!title) {
    const cands = allBlocks.filter((b) => b.text && b.pageNum === 1 && b.text.length >= 6 && b.text.length <= 90 && !isBoilerplateTitle(b.text) && !isAbstractLead(b.text) && !looksLikeJournalMeta(b.text) && b.type !== "caption" && b.type !== "figure" && b.type !== "page-break");
    cands.sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
    if (cands[0]) title = cands[0].text;
  }

  // Outline headings as a fallback / supplement
  if (outline && outline.length && headings.length < 3) {
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
      for (const h of headings) {
        const needle = h.text.replace(/\s/g, "").slice(0, 12);
        if (!needle) continue;
        const hit = allBlocks.find((b) => (b.type === "h2" || b.type === "h3" || b.type === "p") && b.text && b.text.replace(/\s/g, "").includes(needle));
        if (hit) {
          if (hit.id) h.id = hit.id;
          else hit.id = h.id;
          h.pageNum = hit.pageNum;
        }
      }
    }
  }

  if (skipRender) {
    try {
      const metaTitle = (meta && meta.info && (meta.info.Title || meta.info.title)) || "";
      console.log("title-debug", { title, metaTitle, stacked: stackedTitle && stackedTitle.text, nParts: stackedTitle && stackedTitle.parts && stackedTitle.parts.length, parts: stackedTitle && stackedTitle.parts && stackedTitle.parts.map((p) => ({ t: p.text, y: p.y, fs: p.fontSize })) });
    } catch {}
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
