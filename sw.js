const CACHE = "paper-reader-v1";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let assets = ["./ ", "./index.html", "./css/app.css", "./js/app.js", "./js/store.js", "./js/pdf-extract.js", "./js/docx-extract.js", "./js/viewer.js", "./manifest.json", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./vendor/mammoth.browser.min.js", "./vendor/pdfjs/pdf.min.mjs", "./vendor/pdfjs/pdf.worker.min.mjs"];
    try {
      const res = await fetch("./asset-list.json");
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) assets = list;
      }
    } catch {}
    // Cache what we can; missing optional assets should not fail install.
    await Promise.allSettled(assets.map((u) => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === "POST" && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"))) {
    event.respondWith(handleShare(req));
    return;
  }

  if (req.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type !== "opaque") {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      if (req.mode === "navigate") {
        const fallback = await caches.match("./index.html") || await caches.match("./");
        if (fallback) return fallback;
      }
      throw new Error("offline");
    }
  })());
});

async function handleShare(request) {
  try {
    const form = await request.formData();
    const file = form.get("file") || form.get("files");
    if (file && typeof file !== "string") {
      const buf = await file.arrayBuffer();
      const rec = {
        id: "shared-incoming",
        name: file.name || "shared.pdf",
        kind: (file.name || "").toLowerCase().endsWith(".docx") ? "docx" : "pdf",
        type: file.type || "",
        size: file.size || buf.byteLength,
        title: file.name || "分享的文件",
        addedAt: Date.now(),
        lastReadAt: Date.now(),
        buffer: buf,
      };
      await putShared(rec);
    }
  } catch (err) {
    console.warn("share ingest", err);
  }
  return Response.redirect(new URL("./?shared=1", self.location.href).toString(), 303);
}

function putShared(rec) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("paper-reader", 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "id" });
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(rec);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    open.onerror = () => reject(open.error);
  });
}
