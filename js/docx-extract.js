function headingLevel(tag) {
  if (tag === "H1" || tag === "H2") return "h2";
  if (tag === "H3" || tag === "H4") return "h3";
  return null;
}

function textOf(el) {
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

export async function extractDocx(buffer) {
  if (!window.mammoth) throw new Error("缺少 Word 解析组件");
  const arrayBuffer = buffer instanceof ArrayBuffer ? buffer : buffer.buffer;
  const result = await window.mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: window.mammoth.images.inline(async (element) => {
        const b64 = await element.read("base64");
        return { src: `data:${element.contentType};base64,${b64}` };
      }),
    }
  );

  const doc = new DOMParser().parseFromString(`<div id="root">${result.value}</div>`, "text/html");
  const root = doc.getElementById("root") || doc.body;
  const blocks = [];
  const headings = [];
  let pendingCaption = "";

  const pushHeading = (text, type) => {
    const id = `h-${headings.length}`;
    headings.push({ id, text, level: type === "h2" ? 2 : 3 });
    blocks.push({ type, text, id });
  };

  const visit = (node) => {
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    const h = headingLevel(tag);
    if (h) {
      const t = textOf(node);
      if (t) pushHeading(t, h);
      return;
    }
    if (tag === "IMG") {
      const url = node.getAttribute("src");
      if (url) {
        blocks.push({ type: "figure", source: "docx", url, caption: pendingCaption });
        pendingCaption = "";
      }
      return;
    }
    if (tag === "P" || tag === "LI" || tag === "FIGCAPTION") {
      const imgs = [...node.querySelectorAll("img")];
      const t = textOf(node);
      if (imgs.length) {
        if (t) pendingCaption = t;
        imgs.forEach((img) => visit(img));
        pendingCaption = "";
        return;
      }
      if (!t) return;
      if (/^(?:图|表|Figure|Fig\.?|Table)\s*[\d一二三四五六七八九十]+/i.test(t)) {
        const prev = blocks[blocks.length - 1];
        if (prev && prev.type === "figure" && !prev.caption) prev.caption = t;
        else blocks.push({ type: "caption", text: t });
        return;
      }
      if (/^(?:摘要|Abstract|关键词|Keywords?|引言|结论|参考文献|第[一二三四五六七八九十0-9]+[章节篇])/i.test(t) && t.length <= 40) {
        pushHeading(t, "h2");
        return;
      }
      blocks.push({ type: tag === "LI" ? "p" : "p", text: t });
      return;
    }
    if (tag === "TABLE") {
      const canvasHint = node.innerText ? textOf(node).slice(0, 200) : "";
      blocks.push({
        type: "p",
        text: canvasHint ? `【表格】${canvasHint}` : "【这里有一个表格。如需看原貌，请用 Word 打开原稿。】",
      });
      return;
    }
    if (tag === "UL" || tag === "OL" || tag === "DIV" || tag === "FIGURE" || tag === "SECTION" || tag === "ARTICLE") {
      [...node.children].forEach(visit);
      return;
    }
    const t = textOf(node);
    if (t) blocks.push({ type: "p", text: t });
  };

  [...root.childNodes].forEach((n) => {
    if (n.nodeType === 3) {
      const t = n.textContent.replace(/\s+/g, " ").trim();
      if (t) blocks.push({ type: "p", text: t });
    } else {
      visit(n);
    }
  });

  const first = blocks.find((b) => b.type === "h2" || b.type === "p");
  const title = (first && first.text ? first.text.slice(0, 60) : "") || "";
  if (result.messages && result.messages.length) {
    console.debug("docx messages", result.messages.slice(0, 8));
  }
  return { kind: "docx", title, blocks, headings, numPages: 0, pdf: null };
}
