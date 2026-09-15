import { promises as fs } from "node:fs";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const compress = promisify(gzip);
const decompress = promisify(gunzip);
export function validateProject(data: string) {
  const p = JSON.parse(data);
  const png = (v: unknown) => typeof v === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v);
  if (p?.application !== "HINANA STUDIO PHOTO" || p.formatVersion !== 1 || !png(p.original) || !png(p.snapshot?.image) || !Array.isArray(p.snapshot.layers) || p.snapshot.layers.length > 200) throw new Error("지원하지 않거나 손상된 프로젝트입니다.");
  const ids = new Set();
  for (const layer of p.snapshot.layers) {
    if (!layer || typeof layer.id !== "string" || ids.has(layer.id) || !png(layer.image)) throw new Error("레이어 데이터가 손상되었습니다.");
    ids.add(layer.id);
    for (const key of ["x", "y", "rotation", "opacity"]) if (!Number.isFinite(layer[key])) throw new Error("잘못된 레이어 변형값입니다.");
    for (const key of ["scaleX", "scaleY", "scale"]) if (layer[key] !== undefined && (!Number.isFinite(layer[key]) || layer[key] === 0)) throw new Error("잘못된 레이어 크기입니다.");
    if (layer.opacity < 0 || layer.opacity > 100 || typeof layer.visible !== "boolean") throw new Error("잘못된 레이어 표시값입니다.");
  }
  if (!p.snapshot.adjustments || Object.values(p.snapshot.adjustments).some(v => typeof v !== "number" || !Number.isFinite(v))) throw new Error("잘못된 색상 조정값입니다.");
  for (const key of ["brightness", "contrast", "saturation", "temperature", "hue"]) if (!Number.isFinite(p.snapshot.adjustments[key])) throw new Error("색상 조정값이 누락되었습니다.");
  return data;
}
export async function readProject(filePath: string) {
  const raw = await fs.readFile(filePath);
  const decoded = raw[0] === 0x1f && raw[1] === 0x8b ? await decompress(raw, { maxOutputLength: 512 * 1024 * 1024 }) : raw;
  return validateProject(decoded.toString("utf8"));
}
export async function writeProject(filePath: string, data: string) {
  validateProject(data);
  const buffer = await compress(Buffer.from(data, "utf8"));
  const temp = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, buffer, { flag: "wx" });
    await fs.rename(temp, filePath);
  } finally { await fs.unlink(temp).catch(() => {}); }
}
