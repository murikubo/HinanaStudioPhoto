export type Transform = { x: number; y: number; rotation: number; scaleX: number; scaleY: number };
export function transformLayer<T extends Transform>(layer: T, kind: "cw" | "ccw" | "flipH" | "flipV"): T {
  if (kind === "cw") return { ...layer, x: -layer.y, y: layer.x, rotation: layer.rotation + 90 };
  if (kind === "ccw") return { ...layer, x: layer.y, y: -layer.x, rotation: layer.rotation - 90 };
  if (kind === "flipH") return { ...layer, x: -layer.x, rotation: -layer.rotation, scaleX: -layer.scaleX };
  return { ...layer, y: -layer.y, rotation: -layer.rotation, scaleY: -layer.scaleY };
}
export function cropLayer<T extends { x: number; y: number }>(layer: T, oldWidth: number, oldHeight: number, x: number, y: number, width: number, height: number): T {
  return { ...layer, x: oldWidth / 2 + layer.x - x - width / 2, y: oldHeight / 2 + layer.y - y - height / 2 };
}
