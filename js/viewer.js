export function createViewer({ root, image, caption, stage, onClose }) {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let baseW = 0;
  let baseH = 0;
  let pointers = new Map();
  let lastPinch = null;
  let lastTap = 0;

  function apply() {
    image.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function fit() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    if (!iw || !ih || !sw || !sh) return;
    const s = Math.min(sw / iw, sh / ih);
    baseW = iw;
    baseH = ih;
    scale = s;
    tx = (sw - iw * s) / 2;
    ty = (sh - ih * s) / 2;
    apply();
  }

  function clamp() {
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const w = baseW * scale;
    const h = baseH * scale;
    if (w <= sw) tx = (sw - w) / 2;
    else tx = Math.min(0, Math.max(sw - w, tx));
    if (h <= sh) ty = (sh - h) / 2;
    else ty = Math.min(0, Math.max(sh - h, ty));
  }

  function onPointerDown(e) {
    stage.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    lastPinch = null;
    if (pointers.size === 1) {
      const now = Date.now();
      if (now - lastTap < 280) {
        const sw = stage.clientWidth;
        const sh = stage.clientHeight;
        const iw = baseW || 1;
        const ih = baseH || 1;
        const fitS = Math.min(sw / iw, sh / ih);
        if (scale < fitS * 1.4) {
          const rect = stage.getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          const nx = (px - tx) / scale;
          const ny = (py - ty) / scale;
          scale = Math.min(fitS * 3, 4);
          tx = px - nx * scale;
          ty = py - ny * scale;
        } else {
          fit();
        }
        clamp();
        apply();
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      tx += cur.x - prev.x;
      ty += cur.y - prev.y;
      clamp();
      apply();
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      if (lastPinch) {
        const rect = stage.getBoundingClientRect();
        const px = mid.x - rect.left;
        const py = mid.y - rect.top;
        const nx = (px - tx) / scale;
        const ny = (py - ty) / scale;
        const next = Math.max(0.2, Math.min(8, scale * (dist / lastPinch.dist)));
        scale = next;
        tx = px - nx * scale;
        ty = py - ny * scale;
        clamp();
        apply();
      }
      lastPinch = { dist, mid };
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    lastPinch = null;
    try { stage.releasePointerCapture(e.pointerId); } catch {}
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const nx = (px - tx) / scale;
    const ny = (py - ty) / scale;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    scale = Math.max(0.2, Math.min(8, scale * factor));
    tx = px - nx * scale;
    ty = py - ny * scale;
    clamp();
    apply();
  }

  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("wheel", onWheel, { passive: false });

  function open(url, cap) {
    image.src = url;
    caption.textContent = cap || "点图片可放大，两指缩放";
    root.hidden = false;
    document.body.style.overflow = "hidden";
    image.onload = () => fit();
    if (image.complete && image.naturalWidth) fit();
  }

  function close() {
    root.hidden = true;
    image.removeAttribute("src");
    document.body.style.overflow = "";
    pointers.clear();
    if (onClose) onClose();
  }

  return { open, close, fit };
}
