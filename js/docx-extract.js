import { unzip } from "./unzip.js";
import {
  attr, children, firstChild, findDesc, isElem, localName, textContent,
  ommlToLatex, latexToPlain, mapSymbolText, decodeWSym, isSymbolFont,
} from "./omml.js";

function headingLevelFromStyle(id, styleInfo) {
  if (!id) return null;
  const rec = styleInfo[id];
  if (rec) {
    if (rec.outline === 0 || rec.outline === 1) return "h2";
    if (rec.outline === 2 || rec.outline === 3) return "h3";
    const n = rec.name || "";
    if (/^(heading|标题)\s*([1-2])$/i.test(n) || /^(title|标题)$/i.test(n)) return "h2";
    if (/^(heading|标题)\s*([3-4])$/i.test(n)) return "h3";
  }
  if (/^(Heading|标题|标题)\s*([1-2])$/i.test(id) || /^[Tt]itle$/.test(id)) return "h2";
  if (/^(Heading|标题)\s*([3-4])$/i.test(id)) return "h3";
  return null;
}

function parseStyles(xml) {
  const info = Object.create(null);
  if (!xml) return info;
  const doc = parseXml(xml);
  const styles = findDesc(doc, "style");
  for (const st of styles) {
    const id = attr(st, "styleId") || attr(st, "w:styleId");
    if (!id) continue;
    const nameEl = firstChild(st, "name");
    const name = nameEl ? (attr(nameEl, "val") || attr(nameEl, "w:val") || "") : "";
    const pPr = firstChild(st, "pPr");
    const outline = pPr && firstChild(pPr, "outlineLvl");
    const lvl = outline ? Number(attr(outline, "val") || attr(outline, "w:val")) : null;
    const based = firstChild(st, "basedOn");
    const basedOn = based ? (attr(based, "val") || attr(based, "w:val") || "") : "";
    info[id] = { name, outline: Number.isFinite(lvl) ? lvl : null, basedOn };
  }
  // Resolve outline via basedOn once.
  for (const id of Object.keys(info)) {
    let cur = info[id];
    let guard = 0;
    while (cur && cur.outline == null && cur.basedOn && info[cur.basedOn] && guard++ < 8) {
      const parent = info[cur.basedOn];
      if (parent.outline != null) {
        cur.outline = parent.outline;
        if (!cur.name) cur.name = parent.name;
      }
      cur = parent;
    }
  }
  return info;
}

function parseRels(xml) {
  const rels = Object.create(null);
  if (!xml) return rels;
  const doc = parseXml(xml);
  const nodes = findDesc(doc, "Relationship");
  for (const n of nodes) {
    const id = attr(n, "Id") || attr(n, "id");
    const target = attr(n, "Target");
    const type = attr(n, "Type") || "";
    if (id && target) rels[id] = { target, type };
  }
  return rels;
}

export function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const err = doc.querySelector && doc.querySelector("parsererror");
  if (err) throw new Error("Word 文件内容无法解析");
  return doc;
}

function mimeFor(name, bytes) {
  const n = name.toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".bmp")) return "image/bmp";
  if (n.endsWith(".wmf")) return "image/x-wmf";
  if (n.endsWith(".emf")) return "image/x-emf";
  if (n.endsWith(".svg")) return "image/svg+xml";
  if (bytes && bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  }
  return "application/octet-stream";
}

function toDataUrl(name, bytes) {
  const mime = mimeFor(name, bytes);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

function resolveTarget(target) {
  let t = String(target || "").replace(/\\/g, "/");
  if (t.startsWith("/")) t = t.slice(1);
  if (t.startsWith("word/")) return t;
  return "word/" + t.replace(/^\.\//, "");
}

function looksCaption(t) {
  return /^(?:图|表|Figure|Fig\.?|Table)\s*[\d一二三四五六七八九十]+/i.test(t);
}

function looksHeadingText(t) {
  return /^(?:摘要|Abstract|关键词|Keywords?|引言|绪论|结论|参考文献|第[一二三四五六七八九十0-9]+[章节篇])/i.test(t) && t.length <= 40;
}

function fontOfRun(rPr) {
  if (!rPr) return "";
  const fonts = firstChild(rPr, "rFonts");
  if (!fonts) return "";
  return attr(fonts, "ascii") || attr(fonts, "hAnsi") || attr(fonts, "cs") || attr(fonts, "eastAsia") || "";
}

function vertAlignOf(rPr) {
  if (!rPr) return "";
  const v = firstChild(rPr, "vertAlign");
  if (!v) return "";
  return (attr(v, "val") || attr(v, "w:val") || "").toLowerCase();
}

function pushTextPart(parts, text, valign) {
  if (!text) return;
  const last = parts[parts.length - 1];
  const typ = valign === "subscript" ? "sub" : valign === "superscript" ? "sup" : "text";
  if (last && last.type === typ) last.text += text;
  else parts.push({ type: typ, text });
}

function runToParts(r, parts) {
  const rPr = firstChild(r, "rPr");
  const font = fontOfRun(rPr);
  const valign = vertAlignOf(rPr);
  for (const n of r.childNodes) {
    if (n.nodeType !== 1) continue;
    const name = localName(n);
    if (name === "t") {
      pushTextPart(parts, mapSymbolText(font, textContent(n)), valign);
    } else if (name === "tab" || name === "cr") {
      pushTextPart(parts, " ", valign);
    } else if (name === "br") {
      pushTextPart(parts, "\n", valign);
    } else if (name === "sym") {
      const ch = decodeWSym(attr(n, "font") || attr(n, "w:font") || font, attr(n, "char") || attr(n, "w:char"));
      pushTextPart(parts, ch, valign);
    } else if (name === "drawing" || name === "pict" || name === "object" || name === "oleObject") {
      parts.push({ type: "drawing", node: n });
    }
  }
}

function walkInline(el, parts) {
  if (!el) return;
  for (const n of el.childNodes) {
    if (n.nodeType !== 1) continue;
    const name = localName(n);
    if (name === "r") runToParts(n, parts);
    else if (name === "hyperlink" || name === "smartTag" || name === "sdt" || name === "sdtContent" || name === "ins" || name === "customXml") {
      walkInline(n, parts);
    } else if (name === "del") {
      continue;
    } else if (name === "oMath" || name === "oMathPara") {
      const latex = ommlToLatex(n).replace(/\s+/g, " ").trim();
      const display = name === "oMathPara" || (name === "oMath" && localName(el) === "p" && isMostlyMathParagraph(el));
      parts.push({ type: "math", latex, display, text: latexToPlain(latex) });
    } else if (name === "drawing" || name === "pict" || name === "object") {
      parts.push({ type: "drawing", node: n });
    } else if (name === "fldSimple") {
      walkInline(n, parts);
    } else if (name === "footnoteReference" || name === "endnoteReference" || name === "commentReference") {
      continue;
    } else if (name === "bookmarkStart" || name === "bookmarkEnd" || name === "proofErr") {
      continue;
    } else {
      walkInline(n, parts);
    }
  }
}

export function isEqNumberText(t) {
  return /^\s*[(（][0-9A-Za-z.\-–]+[)）]\s*$/.test(t || "");
}

function isMostlyMathParagraph(p) {
  let math = 0, text = 0;
  for (const n of p.childNodes) {
    if (n.nodeType !== 1) continue;
    const name = localName(n);
    if (name === "pPr") continue;
    if (name === "oMath" || name === "oMathPara") math++;
    else if (name === "r") {
      const t = textContent(n).replace(/\s+/g, "");
      if (t && !isEqNumberText(t)) text += t.length;
    }
  }
  return math > 0 && text <= 2;
}

function partsText(parts) {
  return parts.map((p) => {
    if (p.type === "math") return p.text || "";
    if (p.type === "drawing") return "";
    return p.text || "";
  }).join("").replace(/[ \t]+\n/g, "\n").replace(/\s+/g, " ").trim();
}

function hasRich(parts) {
  return parts.some((p) => p.type === "math" || p.type === "sub" || p.type === "sup" || p.type === "drawing");
}

function findBlipEmbed(node) {
  const ids = [];
  const walk = (el) => {
    if (!el || el.nodeType !== 1) return;
    const name = localName(el);
    if (name === "blip" || name === "imagedata" || name === "fill") {
      const id = attr(el, "embed") || attr(el, "id") || attr(el, "r:embed") || attr(el, "r:id") || attr(el, "o:relid");
      if (id) ids.push(id);
    }
    for (const c of el.childNodes) walk(c);
  };
  walk(node);
  return ids;
}

function isEquationOle(node) {
  const objs = findDesc(node, "OLEObject").concat(findDesc(node, "oleObject"));
  for (const o of objs) {
    const prog = attr(o, "ProgID") || attr(o, "progId") || attr(o, "progid") || "";
    if (/equation|eqndsp|mathtype|omml/i.test(prog)) return true;
  }
  return /Equation\.|MathType|Editor/i.test(node.innerHTML || "");
}

function mediaUrl(id, rels, files, cache) {
  if (!id || !rels[id]) return "";
  const target = resolveTarget(rels[id].target);
  if (cache[target]) return cache[target];
  const bytes = files[target];
  if (!bytes) return "";
  const url = toDataUrl(target, bytes);
  cache[target] = url;
  return url;
}

function extractDrawings(parts, rels, files, cache) {
  const images = [];
  const rest = [];
  for (const p of parts) {
    if (p.type !== "drawing") {
      rest.push(p);
      continue;
    }
    const ids = findBlipEmbed(p.node);
    let url = "";
    for (const id of ids) {
      url = mediaUrl(id, rels, files, cache);
      if (url) break;
    }
    if (url) images.push({ url, equation: isEquationOle(p.node) });
  }
  return { images, parts: rest };
}

function styleIdOfP(p) {
  const pPr = firstChild(p, "pPr");
  if (!pPr) return "";
  const st = firstChild(pPr, "pStyle");
  return st ? (attr(st, "val") || attr(st, "w:val") || "") : "";
}

function isListP(p) {
  const pPr = firstChild(p, "pPr");
  if (!pPr) return false;
  return !!firstChild(pPr, "numPr");
}

function cellParts(tc) {
  const parts = [];
  for (const p of findDesc(tc, "p")) walkInline(p, parts);
  return parts;
}

export async function extractDocx(buffer) {
  const files = await unzip(buffer);
  const docXml = files["word/document.xml"];
  if (!docXml) throw new Error("这份 Word 文件里没有正文。");
  const rels = parseRels(new TextDecoder().decode(files["word/_rels/document.xml.rels"] || new Uint8Array()));
  const styles = parseStyles(new TextDecoder().decode(files["word/styles.xml"] || new Uint8Array()));
  const xml = new TextDecoder().decode(docXml);
  const doc = parseXml(xml);
  const body = firstChild(doc.documentElement, "body") || findDesc(doc, "body")[0];
  if (!body) throw new Error("这份 Word 文件没有正文内容。");

  const blocks = [];
  const headings = [];
  const mediaCache = Object.create(null);
  let pendingCaption = "";
  let hasMath = false;

  const pushHeading = (text, type) => {
    const id = `h-${headings.length}`;
    headings.push({ id, text, level: type === "h2" ? 2 : 3 });
    blocks.push({ type, text, id });
  };

  const pushParagraph = (p) => {
    const partsIn = [];
    walkInline(p, partsIn);
    for (const part of partsIn) {
      if (part.type === "text" && isEqNumberText((part.text || "").trim())) {
        part.type = "eqnum";
        part.text = (part.text || "").trim();
      }
    }
    const drawn = extractDrawings(partsIn, rels, files, mediaCache);
    if (drawn.parts.some((x) => x.type === "math" || x.type === "sub" || x.type === "sup")) hasMath = true;
    if (drawn.parts.some((x) => x.type === "math")) hasMath = true;

    const text = partsText(drawn.parts);
    const sid = styleIdOfP(p);
    const heading = headingLevelFromStyle(sid, styles);

    for (const img of drawn.images) {
      if (img.equation) {
        blocks.push({ type: "figure", source: "docx-eq", url: img.url, caption: text || pendingCaption || "公式" });
      } else {
        blocks.push({ type: "figure", source: "docx", url: img.url, caption: pendingCaption });
        pendingCaption = "";
      }
    }

    if (!text && !drawn.parts.some((x) => x.type === "math")) return;

    if (heading && text) {
      pushHeading(text, heading);
      return;
    }
    if (looksCaption(text)) {
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === "figure" && !prev.caption) prev.caption = text;
      else if (drawn.images.length) {
        // caption already applied if images came after text? handled above before images if text first
        const lastFig = [...blocks].reverse().find((b) => b.type === "figure");
        if (lastFig && !lastFig.caption) lastFig.caption = text;
        else blocks.push({ type: "caption", text });
      } else blocks.push({ type: "caption", text });
      return;
    }
    if (looksHeadingText(text)) {
      pushHeading(text, "h2");
      return;
    }

    const rich = hasRich(drawn.parts);
    const onlyDisplayMath = drawn.parts.length && drawn.parts.every((x) => x.type === "math" && x.display);
    if (onlyDisplayMath && drawn.parts.length === 1) {
      blocks.push({ type: "math", latex: drawn.parts[0].latex, display: true, text: drawn.parts[0].text });
      return;
    }
    if (isMostlyMathParagraph(p) && drawn.parts.filter((x) => x.type === "math").length) {
      const math = drawn.parts.filter((x) => x.type === "math");
      const eqnums = drawn.parts.filter((x) => x.type === "eqnum" && (x.text || "").trim());
      const other = drawn.parts.some((x) => (x.type === "text" || x.type === "sub" || x.type === "sup") && (x.text || "").trim());
      if (math.length === 1 && !other) {
        if (eqnums.length) {
          blocks.push({
            type: "eq",
            latex: math[0].latex,
            display: true,
            eqnum: eqnums[0].text,
            text: `${math[0].text || ""} ${eqnums.map((n) => n.text).join(" ")}`.trim(),
            parts: drawn.parts.filter((x) => x.type !== "drawing"),
          });
        } else {
          blocks.push({ type: "math", latex: math[0].latex, display: true, text: math[0].text });
        }
        return;
      }
    }
    const block = { type: "p", text };
    if (isListP(p)) block.list = true;
    if (rich) block.parts = drawn.parts.filter((x) => x.type !== "drawing");
    blocks.push(block);
  };

  const pushTable = (tbl) => {
    const rows = [];
    let tableHasMath = false;
    for (const tr of children(tbl, "tr")) {
      const row = [];
      for (const tc of children(tr, "tc")) {
        const parts = cellParts(tc);
        const drawn = extractDrawings(parts, rels, files, mediaCache);
        if (drawn.parts.some((x) => x.type === "math" || x.type === "sub" || x.type === "sup")) tableHasMath = true;
        for (const img of drawn.images) {
          blocks.push({ type: "figure", source: "docx", url: img.url, caption: "" });
        }
        const cell = { text: partsText(drawn.parts) };
        if (hasRich(drawn.parts)) cell.parts = drawn.parts.filter((x) => x.type !== "drawing");
        row.push(cell);
      }
      if (row.some((c) => c.text || (c.parts && c.parts.length))) rows.push(row);
    }
    if (tableHasMath) hasMath = true;
    const hint = rows.map((r) => r.map((c) => c.text).join(" ")).join(" ").replace(/\s+/g, " ").trim();
    blocks.push({
      type: "table",
      rows,
      text: hint ? `【表格】${hint.slice(0, 200)}` : "【这里有一个表格。如需看原貌，请用 Word 打开原稿。】",
    });
  };

  const visit = (el) => {
    if (!el || el.nodeType !== 1) return;
    const name = localName(el);
    if (name === "p") pushParagraph(el);
    else if (name === "tbl") pushTable(el);
    else if (name === "sdt") {
      const content = firstChild(el, "sdtContent") || el;
      children(content).forEach(visit);
    } else if (name === "ins" || name === "customXml" || name === "body" || name === "hdr" || name === "txbxContent") {
      children(el).forEach(visit);
    } else if (name === "del" || name === "sectPr" || name === "bookmarkStart" || name === "bookmarkEnd") {
      return;
    } else if (name === "oMathPara" || name === "oMath") {
      const latex = ommlToLatex(el).replace(/\s+/g, " ").trim();
      if (latex) {
        hasMath = true;
        blocks.push({ type: "math", latex, display: true, text: latexToPlain(latex) });
      }
    }
  };

  children(body).forEach(visit);

  const first = blocks.find((b) => b.type === "h2" || b.type === "p" || b.type === "math");
  const title = (first && first.text ? first.text.slice(0, 60) : "") || "";
  return { kind: "docx", title, blocks, headings, numPages: 0, pdf: null, hasMath };
}

/** Legacy flattening, kept only so tests can show a before/after of the v6 bug. */
export function flattenLegacy(blocks) {
  return blocks.map((b) => {
    if (b.type === "math") return { type: "p", text: (b.text || b.latex || "").replace(/[{}\\]/g, "") };
    if (b.parts) {
      const t = b.parts.map((p) => p.text || p.latex || "").join("");
      return { type: "p", text: t.replace(/\s+/g, " ").trim() };
    }
    return b;
  });
}
