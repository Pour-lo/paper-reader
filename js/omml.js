/** OMML (Office Math) to LaTeX, plus Symbol-font and w:sym mapping. */

export const NS = {
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  m: "http://schemas.openxmlformats.org/officeDocument/2006/math",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  wp: "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
  v: "urn:schemas-microsoft-com:vml",
  o: "urn:schemas-microsoft-com:office:office",
  r2010: "http://schemas.microsoft.com/office/2010/relationships",
};

export function localName(el) {
  if (!el) return "";
  return el.localName || String(el.nodeName || "").replace(/^.*:/, "");
}

export function isElem(node, name) {
  return node && node.nodeType === 1 && localName(node) === name;
}

export function children(el, name) {
  if (!el) return [];
  const out = [];
  for (const n of el.childNodes) {
    if (n.nodeType === 1 && (!name || localName(n) === name)) out.push(n);
  }
  return out;
}

export function firstChild(el, name) {
  return children(el, name)[0] || null;
}

export function findDesc(el, name, out = []) {
  if (!el) return out;
  for (const n of el.childNodes) {
    if (n.nodeType !== 1) continue;
    if (localName(n) === name) out.push(n);
    findDesc(n, name, out);
  }
  return out;
}

export function attr(el, name) {
  if (!el || !el.attributes) return "";
  const bare = name.includes(":") ? name.split(":")[1] : name;
  const exact = el.getAttribute && el.getAttribute(name);
  if (exact) return exact;
  for (const a of el.attributes) {
    const ln = a.localName || a.name.replace(/^.*:/, "");
    if (a.name === name || ln === bare) return a.value;
  }
  return "";
}

export function textContent(el) {
  if (!el) return "";
  if (el.nodeType === 3) return el.nodeValue || "";
  let s = "";
  for (const n of el.childNodes) s += textContent(n);
  return s;
}

/** Adobe / Windows Symbol font (ASCII slot → Unicode). */
const SYMBOL_MAP = {
  0x21: "!", 0x22: "∀", 0x23: "#", 0x24: "∃", 0x25: "%", 0x26: "&", 0x27: "∋",
  0x28: "(", 0x29: ")", 0x2a: "∗", 0x2b: "+", 0x2c: ",", 0x2d: "−", 0x2e: ".", 0x2f: "/",
  0x30: "0", 0x31: "1", 0x32: "2", 0x33: "3", 0x34: "4", 0x35: "5", 0x36: "6", 0x37: "7",
  0x38: "8", 0x39: "9", 0x3a: ":", 0x3b: ";", 0x3c: "<", 0x3d: "=", 0x3e: ">", 0x3f: "?",
  0x40: "≅",
  0x41: "Α", 0x42: "Β", 0x43: "Χ", 0x44: "Δ", 0x45: "Ε", 0x46: "Φ", 0x47: "Γ", 0x48: "Η",
  0x49: "Ι", 0x4a: "ϑ", 0x4b: "Κ", 0x4c: "Λ", 0x4d: "Μ", 0x4e: "Ν", 0x4f: "Ο", 0x50: "Π",
  0x51: "Θ", 0x52: "Ρ", 0x53: "Σ", 0x54: "Τ", 0x55: "Υ", 0x56: "ς", 0x57: "Ω", 0x58: "Ξ",
  0x59: "Ψ", 0x5a: "Ζ",
  0x5b: "[", 0x5c: "∴", 0x5d: "]", 0x5e: "⊥", 0x5f: "_",
  0x60: "‾",
  0x61: "α", 0x62: "β", 0x63: "χ", 0x64: "δ", 0x65: "ε", 0x66: "φ", 0x67: "γ", 0x68: "η",
  0x69: "ι", 0x6a: "ϕ", 0x6b: "κ", 0x6c: "λ", 0x6d: "μ", 0x6e: "ν", 0x6f: "ο", 0x70: "π",
  0x71: "θ", 0x72: "ρ", 0x73: "σ", 0x74: "τ", 0x75: "υ", 0x76: "ϖ", 0x77: "ω", 0x78: "ξ",
  0x79: "ψ", 0x7a: "ζ",
  0x7b: "{", 0x7c: "|", 0x7d: "}", 0x7e: "∼",
  0xa0: "€", 0xa1: "ϒ", 0xa2: "′", 0xa3: "≤", 0xa4: "⁄", 0xa5: "∞", 0xa6: "ƒ", 0xa7: "♣",
  0xa8: "♦", 0xa9: "♥", 0xaa: "♠", 0xab: "↔", 0xac: "←", 0xad: "↑", 0xae: "→", 0xaf: "↓",
  0xb0: "°", 0xb1: "±", 0xb2: "″", 0xb3: "≥", 0xb4: "×", 0xb5: "∝", 0xb6: "∂", 0xb7: "•",
  0xb8: "÷", 0xb9: "≠", 0xba: "≡", 0xbb: "≈", 0xbc: "…", 0xbd: "⏐", 0xbe: "⎯", 0xbf: "↵",
  0xc0: "ℵ", 0xc1: "ℑ", 0xc2: "ℜ", 0xc3: "℘", 0xc4: "⊗", 0xc5: "⊕", 0xc6: "∅", 0xc7: "∩",
  0xc8: "∪", 0xc9: "⊃", 0xca: "⊇", 0xcb: "⊄", 0xcc: "⊂", 0xcd: "⊆", 0xce: "∈", 0xcf: "∉",
  0xd0: "∠", 0xd1: "∇", 0xd2: "®", 0xd3: "©", 0xd4: "™", 0xd5: "∏", 0xd6: "√", 0xd7: "⋅",
  0xd8: "¬", 0xd9: "∧", 0xda: "∨", 0xdb: "⇔", 0xdc: "⇐", 0xdd: "⇑", 0xde: "⇒", 0xdf: "⇓",
  0xe0: "◊", 0xe1: "⟨", 0xe2: "®", 0xe3: "©", 0xe4: "™", 0xe5: "∑", 0xe6: "⎛", 0xe7: "⎜",
  0xe8: "⎝", 0xe9: "⎡", 0xea: "⎢", 0xeb: "⎣", 0xec: "⎧", 0xed: "⎨", 0xee: "⎩", 0xef: "⎪",
  0xf1: "⟩", 0xf2: "∫", 0xf3: "⌠", 0xf4: "⎮", 0xf5: "⌡", 0xf6: "⎞", 0xf7: "⎟",
  0xf8: "⎠", 0xf9: "⎤", 0xfa: "⎥", 0xfb: "⎦", 0xfc: "⎫", 0xfd: "⎬", 0xfe: "⎭",
};

const SYMBOL_FONTS = /^(symbol|mt extra|euclid symbol)$/i;

export function isSymbolFont(name) {
  return !!(name && SYMBOL_FONTS.test(String(name).trim()));
}

export function mapSymbolCode(code) {
  let cp = code | 0;
  if (cp >= 0xf000 && cp <= 0xf0ff) cp -= 0xf000;
  if (cp >= 0xf100 && cp <= 0xf1ff) cp -= 0xf000; // some docs use F1xx
  if (Object.prototype.hasOwnProperty.call(SYMBOL_MAP, cp)) return SYMBOL_MAP[cp];
  if (cp >= 0x20 && cp <= 0x7e) return String.fromCharCode(cp);
  try { return String.fromCodePoint(cp); } catch { return ""; }
}

export function mapSymbolText(font, text) {
  if (!text) return "";
  if (!isSymbolFont(font)) return text;
  let out = "";
  for (const ch of text) out += mapSymbolCode(ch.codePointAt(0));
  return out;
}

export function decodeWSym(font, charHex) {
  if (!charHex) return "";
  const cp = parseInt(String(charHex).replace(/^0x/i, ""), 16);
  if (!Number.isFinite(cp)) return "";
  if (isSymbolFont(font) || /symbol/i.test(font || "") || !font) return mapSymbolCode(cp);
  try { return String.fromCodePoint(cp >= 0xf000 && cp <= 0xf0ff ? cp - 0xf000 : cp); } catch { return ""; }
}

const GREEK_TO_TEX = {
  "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta", "ε": "\\varepsilon", "ϵ": "\\epsilon",
  "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta", "ϑ": "\\vartheta", "ι": "\\iota", "κ": "\\kappa",
  "λ": "\\lambda", "μ": "\\mu", "ν": "\\nu", "ξ": "\\xi", "ο": "o", "π": "\\pi", "ϖ": "\\varpi",
  "ρ": "\\rho", "ϱ": "\\varrho", "σ": "\\sigma", "ς": "\\varsigma", "τ": "\\tau", "υ": "\\upsilon",
  "φ": "\\varphi", "ϕ": "\\phi", "χ": "\\chi", "ψ": "\\psi", "ω": "\\omega",
  "Α": "\\mathrm{A}", "Β": "\\mathrm{B}", "Γ": "\\Gamma", "Δ": "\\Delta", "Ε": "\\mathrm{E}",
  "Ζ": "\\mathrm{Z}", "Η": "\\mathrm{H}", "Θ": "\\Theta", "Ι": "\\mathrm{I}", "Κ": "\\mathrm{K}",
  "Λ": "\\Lambda", "Μ": "\\mathrm{M}", "Ν": "\\mathrm{N}", "Ξ": "\\Xi", "Ο": "\\mathrm{O}",
  "Π": "\\Pi", "Ρ": "\\mathrm{P}", "Σ": "\\Sigma", "Τ": "\\mathrm{T}", "Υ": "\\Upsilon",
  "Φ": "\\Phi", "Χ": "\\mathrm{X}", "Ψ": "\\Psi", "Ω": "\\Omega",
  "ℵ": "\\aleph", "∂": "\\partial", "∇": "\\nabla", "∞": "\\infty", "∅": "\\emptyset",
  "±": "\\pm", "∓": "\\mp", "×": "\\times", "÷": "\\div", "·": "\\cdot", "⋅": "\\cdot", "∗": "*",
  "≤": "\\le", "≥": "\\ge", "≠": "\\ne", "≡": "\\equiv", "≈": "\\approx", "≅": "\\cong",
  "∈": "\\in", "∉": "\\notin", "⊂": "\\subset", "⊃": "\\supset", "⊆": "\\subseteq", "⊇": "\\supseteq",
  "∩": "\\cap", "∪": "\\cup", "∧": "\\wedge", "∨": "\\vee", "¬": "\\neg",
  "←": "\\leftarrow", "→": "\\rightarrow", "↔": "\\leftrightarrow",
  "⇐": "\\Leftarrow", "⇒": "\\Rightarrow", "⇔": "\\Leftrightarrow",
  "↑": "\\uparrow", "↓": "\\downarrow",
  "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "∮": "\\oint", "√": "\\sqrt{}",
  "∠": "\\angle", "∝": "\\propto", "∴": "\\therefore", "∀": "\\forall", "∃": "\\exists",
  "⊕": "\\oplus", "⊗": "\\otimes", "⊥": "\\perp", "∘": "\\circ", "°": "{}^{\\circ}",
  "′": "'", "″": "''", "…": "\\ldots", "⋯": "\\cdots", "−": "-", "–": "-", "—": "-",
  "≤": "\\le", "≥": "\\ge", "⋅": "\\cdot", "·": "\\cdot",
  "ℓ": "\\ell", "ℏ": "\\hbar", "℧": "\\mho",
};

const ACCENT_TEX = {
  "\u0302": "\\hat",
  "^": "\\hat",
  "\u0304": "\\bar",
  "\u00AF": "\\bar",
  "¯": "\\bar",
  "\u0305": "\\overline",
  "\u0303": "\\tilde",
  "~": "\\tilde",
  "\u0301": "\\acute",
  "\u0300": "\\grave",
  "\u0307": "\\dot",
  "\u0308": "\\ddot",
  "\u20D7": "\\vec",
  "\u2192": "\\vec",
  "\u02C7": "\\check",
  "\u02D8": "\\breve",
};

const NARY_TEX = {
  "∑": "\\sum", "Σ": "\\sum", "∏": "\\prod", "Π": "\\prod",
  "∫": "\\int", "∮": "\\oint", "∬": "\\iint", "∭": "\\iiint",
  "⋃": "\\bigcup", "⋂": "\\bigcap", "⋁": "\\bigvee", "⋀": "\\bigwedge",
  "⊕": "\\bigoplus", "⊗": "\\bigotimes", "∐": "\\coprod",
};

function escapeTexText(s) {
  return String(s).replace(/[\\{}$&#^_%~]/g, (ch) => ({
    "\\": "\\backslash{}",
    "{": "\\{",
    "}": "\\}",
    $: "\\$",
    "&": "\\&",
    "#": "\\#",
    "^": "\\hat{\\ }",
    _: "\\_",
    "%": "\\%",
    "~": "\\tilde{\\ }",
  }[ch] || ch));
}

function mapCharsToTex(text, { literal = false } = {}) {
  if (!text) return "";
  // OMML preserves xml:space; keep the characters, collapse only \r
  text = text.replace(/\r/g, "");
  if (literal) {
    let out = "";
    for (const ch of text) {
      if (GREEK_TO_TEX[ch]) out += GREEK_TO_TEX[ch] + " ";
      else out += escapeTexText(ch);
    }
    return out;
  }
  let out = "";
  for (const ch of text) {
    if (GREEK_TO_TEX[ch]) out += GREEK_TO_TEX[ch] + " ";
    else if (ch === " ") out += "\\,";
    else if ("_{}^$%&#".includes(ch)) out += escapeTexText(ch);
    else out += ch;
  }
  return out;
}

function arg(el, names) {
  if (!el) return null;
  for (const n of names) {
    const hit = firstChild(el, n);
    if (hit) return hit;
  }
  return null;
}

function latexOfChildren(el) {
  if (!el) return "";
  let out = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) {
      const t = n.nodeValue;
      if (t) out += mapCharsToTex(t);
    } else if (n.nodeType === 1) {
      out += ommlToLatex(n);
    }
  }
  return out;
}

function eOf(el) {
  const e = firstChild(el, "e");
  return e ? latexOfChildren(e) : latexOfChildren(el);
}

function wrap(tex) {
  tex = String(tex || "").trim();
  if (!tex) return "{}";
  if (/^\\[a-zA-Z]+$/.test(tex) || /^\\[a-zA-Z]+\{.*\}$/.test(tex) && balanced(tex)) return tex;
  if (tex.length === 1) return tex;
  return `{${tex}}`;
}

function balanced(s) {
  let n = 0;
  for (const ch of s) {
    if (ch === "{") n++;
    else if (ch === "}") n--;
    if (n < 0) return false;
  }
  return n === 0;
}

function chrOf(pr, fallback = "", tag = "chr") {
  if (!pr) return fallback;
  const chr = firstChild(pr, tag);
  if (!chr) return fallback;
  const v = attr(chr, "val") || attr(chr, "m:val");
  return v != null && v !== "" ? v : fallback;
}

function styPlain(rPr) {
  if (!rPr) return false;
  const sty = firstChild(rPr, "sty");
  const val = sty ? (attr(sty, "val") || attr(sty, "m:val") || "") : "";
  const nor = firstChild(rPr, "nor");
  return val === "p" || !!nor;
}

function scrOf(rPr) {
  if (!rPr) return "";
  const scr = firstChild(rPr, "scr");
  return scr ? (attr(scr, "val") || attr(scr, "m:val") || "") : "";
}

/** OMML on/off flags: present or val=1 is on; val=0/off/false is off. */
function ommlOn(pr, tag) {
  const el = pr && firstChild(pr, tag);
  if (!el) return false;
  const v = String(attr(el, "val") || attr(el, "m:val") || "1").toLowerCase();
  return v !== "0" && v !== "off" && v !== "false";
}

export function ommlToLatex(el) {
  if (!el) return "";
  if (el.nodeType === 3) return mapCharsToTex(el.nodeValue || "");
  const name = localName(el);

  if (name === "oMath" || name === "oMathPara" || name === "e" || name === "box" || name === "borderBox" || name === "phant" || name === "eqArr") {
    return latexOfChildren(el);
  }
  if (name === "oMathParaPr" || name === "ctrlPr" || name === "argPr" || name.endsWith("Pr") && name !== "deg") {
    return "";
  }

  if (name === "r") {
    const rPr = firstChild(el, "rPr");
    let text = "";
    for (const n of el.childNodes) {
      if (isElem(n, "t")) text += textContent(n);
    }
    const font = rPr ? fontOfMathRPr(rPr) : "";
    if (isSymbolFont(font)) text = mapSymbolText(font, text);
    const scr = scrOf(rPr).toLowerCase();
    if (scr === "script") {
      const raw = text.trim();
      if (raw === "l" || raw === "ℓ") return "\\ell";
      return `\\mathscr{${escapeTexText(raw)}}`;
    }
    if (scr === "fraktur") return `\\mathfrak{${escapeTexText(text.trim())}}`;
    if (scr === "double-struck") return `\\mathbb{${escapeTexText(text.trim())}}`;
    const tex = mapCharsToTex(text, { literal: styPlain(rPr) });
    if (styPlain(rPr) && /[A-Za-z]/.test(text)) return `\\mathrm{${escapeTexText(text)}}`;
    return tex;
  }

  if (name === "t") return mapCharsToTex(textContent(el));

  if (name === "f") {
    const num = latexOfChildren(firstChild(el, "num"));
    const den = latexOfChildren(firstChild(el, "den"));
    const pr = firstChild(el, "fPr");
    const typeEl = pr && firstChild(pr, "type");
    const typ = typeEl ? (attr(typeEl, "val") || "") : "";
    if (typ === "skw" || typ === "lin") return `{${num}}/{${den}}`;
    if (typ === "noBar") return `{}^{${num}}_{${den}}`;
    return `\\frac{${num}}{${den}}`;
  }

  if (name === "rad") {
    const deg = firstChild(el, "deg");
    const hide = firstChild(firstChild(el, "radPr"), "degHide");
    const body = eOf(el);
    const degTex = deg && !hide ? latexOfChildren(deg).trim() : "";
    if (degTex && degTex !== "2") return `\\sqrt[${degTex}]{${body}}`;
    return `\\sqrt{${body}}`;
  }

  if (name === "sSub") {
    return `${wrap(eOf(el))}_{${latexOfChildren(firstChild(el, "sub"))}}`;
  }
  if (name === "sSup") {
    return `${wrap(eOf(el))}^{${latexOfChildren(firstChild(el, "sup"))}}`;
  }
  if (name === "sSubSup") {
    return `${wrap(eOf(el))}_{${latexOfChildren(firstChild(el, "sub"))}}^{${latexOfChildren(firstChild(el, "sup"))}}`;
  }
  if (name === "sPre") {
    return `{}_{${latexOfChildren(firstChild(el, "sub"))}}^{${latexOfChildren(firstChild(el, "sup"))}}${wrap(eOf(el))}`;
  }

  if (name === "nary") {
    const pr = firstChild(el, "naryPr");
    const ch = chrOf(pr, "∫");
    const op = NARY_TEX[ch] || (GREEK_TO_TEX[ch] ? GREEK_TO_TEX[ch] : (ch ? `\\operatorname{${ch}}` : "\\int"));
    const sub = ommlOn(pr, "subHide") ? "" : latexOfChildren(firstChild(el, "sub"));
    const sup = ommlOn(pr, "supHide") ? "" : latexOfChildren(firstChild(el, "sup"));
    let out = op;
    if (sub) out += `_{${sub}}`;
    if (sup) out += `^{${sup}}`;
    const body = eOf(el);
    return body ? `${out} ${body}` : out;
  }

  if (name === "d") {
    const pr = firstChild(el, "dPr");
    const beg = chrOf(pr, "(", "begChr");
    const endChr = chrOf(pr, ")", "endChr");
    const sep = chrOf(pr, ",", "sepChr");
    const parts = children(el, "e").map((e) => latexOfChildren(e));
    const inner = parts.join(sep === "," ? ", " : sep);
    const left = delimTex(beg || "(", "l");
    const right = delimTex(endChr || ")", "r");
    return `${left}${inner}${right}`;
  }

  if (name === "m") {
    const rows = children(el, "mr").map((row) => children(row, "e").map((e) => latexOfChildren(e)).join(" & "));
    return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
  }

  if (name === "acc") {
    const ch = chrOf(firstChild(el, "accPr"), "\u0302");
    const cmd = ACCENT_TEX[ch] || (ch === "˙" ? "\\dot" : "\\hat");
    return `${cmd}{${eOf(el)}}`;
  }

  if (name === "bar") {
    const pr = firstChild(el, "barPr");
    const pos = pr && firstChild(pr, "pos");
    const val = pos ? (attr(pos, "val") || "") : "top";
    const cmd = val === "bot" ? "\\underline" : "\\overline";
    return `${cmd}{${eOf(el)}}`;
  }

  if (name === "groupChr") {
    const pr = firstChild(el, "groupChrPr");
    const ch = chrOf(pr, "\u23DF");
    const pos = pr && firstChild(pr, "pos");
    const val = pos ? (attr(pos, "val") || "") : "bot";
    const body = eOf(el);
    if (val === "top") {
      if (ch === "\u23DE" || ch === "\u0305" || ch === "¯") return `\\overbrace{${body}}`;
      return `\\overset{${escapeTexText(ch)}}{${body}}`;
    }
    if (ch === "\u23DF") return `\\underbrace{${body}}`;
    return `\\underset{${escapeTexText(ch)}}{${body}}`;
  }

  if (name === "limLow") {
    return `\\underset{${latexOfChildren(firstChild(el, "lim"))}}{${eOf(el)}}`;
  }
  if (name === "limUpp") {
    return `\\overset{${latexOfChildren(firstChild(el, "lim"))}}{${eOf(el)}}`;
  }

  if (name === "func") {
    const fname = latexOfChildren(firstChild(el, "fName")).trim();
    const body = eOf(el);
    const clean = fname.replace(/^\\mathrm\{(.*)\}$/, "$1").replace(/\\,/g, " ").trim();
    if (/^[a-zA-Z]+$/.test(clean)) return `\\operatorname{${clean}}${body ? `\\left(${body}\\right)` : ""}`.replace(`\\left(${body}\\right)`, ` ${body}`);
    return `${fname} ${body}`;
  }

  if (name === "eqArr") {
    const rows = children(el, "e").map((e) => latexOfChildren(e));
    return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
  }

  // Skip properties and unknown wrappers by walking children.
  return latexOfChildren(el);
}

function fontOfMathRPr(rPr) {
  const rFonts = firstChild(rPr, "rFonts");
  if (!rFonts) return "";
  return attr(rFonts, "ascii") || attr(rFonts, "hAnsi") || attr(rFonts, "w:ascii") || "";
}

function delimTex(ch, side) {
  const map = {
    "(": "(", ")": ")", "[": "[", "]": "]", "{": "\\{", "}": "\\}",
    "|": "|", "‖": "\\|", "||": "\\|",
    "⟨": "\\langle", "⟩": "\\rangle", "〈": "\\langle", "〉": "\\rangle",
    "⌊": "\\lfloor", "⌋": "\\rfloor", "⌈": "\\lceil", "⌉": "\\rceil",
    "⟦": "\\llbracket", "⟧": "\\rrbracket",
  };
  const inner = map[ch] != null ? map[ch] : (ch || ".");
  return side === "l" ? `\\left${inner === "." ? "." : inner}` : `\\right${inner === "." ? "." : inner}`;
}

export function latexToPlain(tex) {
  return String(tex || "")
    .replace(/\\(left|right|mathrm|operatorname|text|mathbf|mathit)\s*/g, "")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\[([^\]]*)\]\{([^{}]+)\}/g, "($2)^{1/$1}")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\sum/g, "∑")
    .replace(/\\int/g, "∫")
    .replace(/\\prod/g, "∏")
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\pm/g, "±")
    .replace(/\\infty/g, "∞")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ")
    .replace(/\\varepsilon|\\epsilon/g, "ε")
    .replace(/\\sigma/g, "σ")
    .replace(/\\lambda/g, "λ")
    .replace(/\\theta/g, "θ")
    .replace(/\\pi/g, "π")
    .replace(/\\mu/g, "μ")
    .replace(/\\phi|\\varphi/g, "φ")
    .replace(/\\omega/g, "ω")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\Sigma/g, "Σ")
    .replace(/\\Lambda/g, "Λ")
    .replace(/\\Omega/g, "Ω")
    .replace(/\\Gamma/g, "Γ")
    .replace(/\\eta/g, "η")
    .replace(/\\in\b/g, "∈")
    .replace(/\\ell/g, "ℓ")
    .replace(/\\le\b/g, "≤")
    .replace(/\\ge\b/g, "≥")
    .replace(/\\approx/g, "≈")
    .replace(/\\begin\{[^}]+\}|\\end\{[^}]+\}/g, "")
    .replace(/\\\\/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
