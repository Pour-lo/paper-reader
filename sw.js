const CACHE = "paper-reader-v6";
const NETWORK_MS = 3000;
const REVALIDATE_MS = 8000;

const CORE = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/store.js",
  "./js/pdf-extract.js",
  "./js/docx-extract.js",
  "./js/viewer.js",
  "./js/pager.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

function toHref(u) {
  return new URL(u, self.registration.scope).href;
}

function timeoutSignal(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel: () => clearTimeout(t) };
}

async function fetchTimeout(req, ms) {
  const t = timeoutSignal(ms);
  try {
    return await fetch(req, { signal: t.signal });
  } finally {
    t.cancel();
  }
}

function isNavigate(req, url) {
  if (req.mode === "navigate" || req.destination === "document") return true;
  const p = url.pathname;
  return p.endsWith("/") || /(^|\/)index\.html$/.test(p) || p.endsWith("/paper-reader");
}

async function putBothDocs(cache, res) {
  if (!res || !res.ok) return;
  try {
    await cache.put(toHref("./"), res.clone());
    await cache.put(toHref("./index.html"), res.clone());
  } catch {}
}

async function mirrorDocument(cache) {
  const html =
    (await cache.match(toHref("./index.html"), { ignoreSearch: true })) ||
    (await cache.match(toHref("./"), { ignoreSearch: true }));
  if (html) await putBothDocs(cache, html);
}

async function matchInCache(cache, reqOrUrl) {
  try {
    return await cache.match(reqOrUrl, { ignoreSearch: true });
  } catch {
    return null;
  }
}

async function matchShell(req) {
  const url = new URL(req.url);
  const nav = isNavigate(req, url);

  let hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;

  if (url.search) {
    const clean = new URL(url.href);
    clean.search = "";
    hit = await caches.match(clean.href, { ignoreSearch: true });
    if (hit) return hit;
  }

  if (nav) {
    const candidates = [toHref("./"), toHref("./index.html")];
    if (url.pathname.endsWith("/")) candidates.push(url.href, url.href + "index.html");
    else candidates.push(url.href, url.href.replace(/\/?$/, "/") + "index.html");
    const keys = await caches.keys();
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const c of candidates) {
        hit = await matchInCache(cache, c);
        if (hit) return hit;
      }
    }
  }
  return null;
}

async function revalidate(req) {
  try {
    const res = await fetchTimeout(req, REVALIDATE_MS);
    if (res && res.ok && res.type !== "opaque") {
      const cache = await caches.open(CACHE);
      const url = new URL(typeof req === "string" ? req : req.url);
      if (isNavigate(typeof req === "string" ? new Request(req) : req, url)) {
        await putBothDocs(cache, res);
      } else {
        const clean = new URL(url.href);
        // Store under the URL without cache-busting query so ignoreSearch is not required later.
        try { await cache.put(req, res.clone()); } catch {}
      }
    }
  } catch {}
}

async function precacheList(cache, urls, ms) {
  await Promise.all(urls.map(async (u) => {
    try {
      const res = await fetchTimeout(u, ms);
      if (res && res.ok) {
        await cache.put(toHref(u), res.clone());
        if (u === "./" || u === "./index.html") await putBothDocs(cache, res);
      }
    } catch {}
  }));
}

self.addEventListener("install", (event) => {
  // Precache only the app shell so install can finish even on a slow link.
  // skipWaiting after precache so stale v2/v3 installs (no update toast) get v4 on the next launch.
  // Do not auto-reload clients here; the in-app toast still offers a manual refresh.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await precacheList(cache, CORE, 8000);
    await mirrorDocument(cache);
    // Activate as soon as the shell is cached so older installs (v2 cache-first,
    // no update toast) pick this up on the next launch without a reload loop.
    await self.skipWaiting();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const ready =
      (await matchInCache(cache, toHref("./index.html"))) ||
      (await matchInCache(cache, toHref("./")));
    if (ready) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("paper-reader-") && k !== CACHE)
          .map((k) => caches.delete(k))
      );
    }
    // Optional assets (pdf.js, fonts, cmaps) fill in behind the already-usable shell.
    try {
      const res = await fetchTimeout("./asset-list.json", 4000);
      if (res && res.ok) {
        const list = await res.json();
        if (Array.isArray(list) && list.length) {
          // Don't block activate on this; race with a timeout budget.
          await Promise.race([
            precacheList(cache, list.filter((u) => !CORE.includes(u)), 6000),
            new Promise((r) => setTimeout(r, 10000)),
          ]);
        }
      }
    } catch {}
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
    const cached = await matchShell(req);
    if (cached) {
      event.waitUntil(revalidate(req));
      return cached;
    }
    try {
      const res = await fetchTimeout(req, NETWORK_MS);
      if (res && res.ok && res.type !== "opaque") {
        const cache = await caches.open(CACHE);
        if (isNavigate(req, url)) await putBothDocs(cache, res);
        else {
          try { await cache.put(req, res.clone()); } catch {}
        }
      }
      return res;
    } catch {
      if (isNavigate(req, url)) {
        const fallback = await matchShell(new Request(toHref("./index.html"), { mode: "navigate" }));
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
  return Response.redirect(new URL("./?shared=1", self.registration.scope).toString(), 303);
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
