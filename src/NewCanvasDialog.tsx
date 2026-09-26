import { useState } from "react";
import { imageSize } from "./editorUtilities";

export default function NewCanvasDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (width: number, height: number, color: string | null, name: string) => Promise<boolean> }) {
  const [name, setName] = useState("제목 없는 이미지");
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [transparent, setTransparent] = useState(true);
  const [color, setColor] = useState("#ffffff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="dialog-overlay" onMouseDown={() => { if (!busy) onClose(); }}><form className="utility-dialog" role="dialog" aria-modal="true" aria-labelledby="new-canvas-title" onMouseDown={e => e.stopPropagation()} onSubmit={async e => {
    e.preventDefault();
    if (busy) return;
    try { const size = imageSize(width, height); setError(""); setBusy(true); if (await onCreate(size.width, size.height, transparent ? null : color, name)) onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "캔버스를 만들지 못했습니다."); }
    finally { setBusy(false); }
  }}>
    <h2 id="new-canvas-title">새로 만들기</h2><p>빈 이미지를 만들고 그림·텍스트·이미지 레이어를 더해보세요.</p>
    <fieldset disabled={busy}>
      <label className="new-image-name">이미지 이름<input autoFocus maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="제목 없는 이미지" /></label>
      <div className="utility-presets">{[[1920,1080,"FHD"],[1080,1080,"정사각형"],[1080,1920,"세로형"],[1280,720,"썸네일"]].map(([w,h,label]) => <button type="button" key={label} onClick={() => { setWidth(Number(w)); setHeight(Number(h)); }}>{label}</button>)}</div>
      <div className="utility-dimensions"><label>너비 (px)<input type="number" min="1" max="16384" required value={width} onChange={e => setWidth(Number(e.target.value))} /></label><label>높이 (px)<input type="number" min="1" max="16384" required value={height} onChange={e => setHeight(Number(e.target.value))} /></label><button type="button" title="가로·세로 교환" onClick={() => { setWidth(height); setHeight(width); }}>↔</button></div>
      <label className="utility-check"><input type="checkbox" checked={transparent} onChange={e => setTransparent(e.target.checked)} /> 투명 배경</label>
      {!transparent && <label className="utility-check">배경색<input aria-label="배경색" type="color" value={color} onChange={e => setColor(e.target.value)} /></label>}
      <small>최대 한 변 16,384px · 총 6,400만 픽셀</small>
      {error && <p className="utility-error" role="alert">{error}</p>}
      <div className="utility-actions"><button type="button" onClick={onClose}>취소</button><button className="primary" type="submit">{busy ? "만드는 중…" : "만들기"}</button></div>
    </fieldset>
  </form></div>;
}
