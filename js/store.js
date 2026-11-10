const DB_NAME = "paper-reader";
const DB_VER = 1;
const SETTINGS_KEY = "paper-reader-settings";

const defaultSettings = {
  fontSize: 20,
  lineHeight: 1.8,
  margin: 22,
  theme: "day",
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function hashBuffer(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function saveFile(record) {
  const db = await openDb();
  const tx = db.transaction("files", "readwrite");
  tx.objectStore("files").put(record);
  await txDone(tx);
  db.close();
}

export async function getFile(id) {
  const db = await openDb();
  const rec = await new Promise((resolve, reject) => {
    const req = db.transaction("files").objectStore("files").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rec;
}

export async function listFiles() {
  const db = await openDb();
  const rows = await new Promise((resolve, reject) => {
    const out = [];
    const req = db.transaction("files").objectStore("files").openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(out);
        return;
      }
      const rec = cursor.value || {};
      out.push({
        id: rec.id,
        name: rec.name,
        kind: rec.kind,
        type: rec.type,
        size: rec.size,
        title: rec.title,
        addedAt: rec.addedAt,
        lastReadAt: rec.lastReadAt,
      });
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
}

export async function deleteFile(id) {
  const db = await openDb();
  const tx = db.transaction(["files", "progress"], "readwrite");
  tx.objectStore("files").delete(id);
  tx.objectStore("progress").delete(id);
  await txDone(tx);
  db.close();
}

export async function touchFile(id, patch = {}) {
  const rec = await getFile(id);
  if (!rec) return;
  Object.assign(rec, patch, { lastReadAt: Date.now() });
  await saveFile(rec);
}

export async function saveProgress(id, data) {
  const db = await openDb();
  const tx = db.transaction("progress", "readwrite");
  tx.objectStore("progress").put({ id, ...data, updatedAt: Date.now() });
  await txDone(tx);
  db.close();
}

export async function getProgress(id) {
  const db = await openDb();
  const rec = await new Promise((resolve, reject) => {
    const req = db.transaction("progress").objectStore("progress").get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rec;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export { defaultSettings };
