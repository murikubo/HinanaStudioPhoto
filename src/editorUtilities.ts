export function imageSize(width: number, height: number, percent = 100) {
  if (![width, height, percent].every(Number.isFinite) || width <= 0 || height <= 0 || percent <= 0) throw new Error("올바른 이미지 크기를 입력하세요.");
  const w = Math.max(1, Math.round(width * percent / 100));
  const h = Math.max(1, Math.round(height * percent / 100));
  if (w > 16384 || h > 16384 || w * h > 64_000_000) throw new Error("최대 한 변 16,384px, 총 6,400만 픽셀까지 지원합니다.");
  return { width: w, height: h };
}

// Centered percentage rectangle with the requested pixel aspect ratio.
export function cropPreset(width: number, height: number, ratio: number) {
  if (![width, height, ratio].every(Number.isFinite) || Math.min(width, height, ratio) <= 0) throw new Error("잘못된 자르기 비율입니다.");
  const w = Math.min(width, height * ratio);
  const h = w / ratio;
  return { x: (1 - w / width) * 50, y: (1 - h / height) * 50, width: w / width * 100, height: h / height * 100 };
}

export function nudgePosition(x: number, y: number, key: string, fast: boolean) {
  const step = fast ? 10 : 1;
  return { x: x + (key === "ArrowRight" ? step : key === "ArrowLeft" ? -step : 0), y: y + (key === "ArrowDown" ? step : key === "ArrowUp" ? -step : 0) };
}

export function pixelHex(pixel: ArrayLike<number>) {
  if (pixel[3] === 0) return null;
  return "#" + [pixel[0], pixel[1], pixel[2]].map(value => value.toString(16).padStart(2, "0")).join("");
}
