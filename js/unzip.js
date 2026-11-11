/** Minimal ZIP reader for .docx (store + deflate), using DecompressionStream. */

function findEocd(view, u8) {
  const min = Math.max(0, u8.length - 22 - 65535);
  for (let i = u8.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

function decodeName(bytes, flags) {
  const utf8 = (flags & 0x0800) !== 0;
  try {
    return new TextDecoder(utf8 ? "utf-8" : "latin1").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

async function inflateRaw(data) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("当前环境无法解开 Word 文件");
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

export async function unzip(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const eocd = findEocd(view, u8);
  if (eocd < 0) throw new Error("不是有效的 Word 文件");
  const entries = view.getUint16(eocd + 10, true);
  const cdOff = view.getUint32(eocd + 16, true);
  if (view.getUint32(eocd + 4, true) !== 0 || view.getUint32(eocd + 16, true) === 0xffffffff) {
    // ZIP64 is rare for papers; fail clearly.
    if (view.getUint32(eocd + 20, true) === 0xffffffff || view.getUint16(eocd + 10, true) === 0xffff) {
      throw new Error("这份 Word 文件格式较特殊，暂时打不开。");
    }
  }
  const files = Object.create(null);
  let p = cdOff;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > u8.length || view.getUint32(p, true) !== 0x02014b50) {
      throw new Error("Word 文件已损坏");
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOff = view.getUint32(p + 42, true);
    const name = decodeName(u8.subarray(p + 46, p + 46 + nameLen), flags);
    p += 46 + nameLen + extraLen + commentLen;

    if (localOff + 30 > u8.length || view.getUint32(localOff, true) !== 0x04034b50) {
      throw new Error("Word 文件已损坏");
    }
    const localNameLen = view.getUint16(localOff + 26, true);
    const localExtraLen = view.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const data = u8.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      files[name] = data.slice();
    } else if (method === 8) {
      files[name] = await inflateRaw(data);
    } else {
      throw new Error("这份 Word 文件使用了不支持的压缩方式");
    }
  }
  return files;
}

export function textFromZip(files, path) {
  const data = files[path];
  if (!data) return "";
  return new TextDecoder("utf-8").decode(data);
}
