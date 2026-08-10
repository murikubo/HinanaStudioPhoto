import { useCallback, useEffect, useRef, useState } from "react";
import {
  Blend, Brush, ChevronDown, ChevronUp, Download, FlipHorizontal2, FlipVertical2,
  AlignCenter, AlignLeft, AlignRight, Bold, Copy, Eye, EyeOff, FileArchive, FolderOpen, Image as ImageIcon, Info, Layers3,
  MousePointer2, PanelRight, Plus, Redo2, RotateCcw, RotateCw,
  Save, SlidersHorizontal, TextCursorInput, Trash2, Undo2, Upload, X, ZoomIn, ZoomOut,
} from "lucide-react";
import photoIconUrl from "../photoicon.png";
import packageInfo from "../package.json";

type Tool = "move" | "mosaic" | "brush" | "crop" | "text";
type AdjustmentKey = "brightness" | "contrast" | "saturation" | "temperature" | "hue";
type Adjustments = Record<AdjustmentKey, number>;
type LayerMeta = {
  id: string;
  name: string;
  kind: "pixel" | "text";
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  contentWidth: number;
  contentHeight: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: "400" | "700";
  textColor?: string;
  textAlign?: "left" | "center" | "right";
};
type LayerSnapshot = LayerMeta & { image: string };
type Snapshot = { image: string; adjustments: Adjustments; layers: LayerSnapshot[]; selectedLayerId: string };
type CropRect = { x: number; y: number; width: number; height: number };
type CropDrag = { mode: "move" | "nw" | "ne" | "sw" | "se"; startX: number; startY: number; rect: CropRect; displayWidth: number; displayHeight: number };
type TransformDrag = { mode: "resize" | "rotate"; id: string; centerX: number; centerY: number; startScaleX: number; startScaleY: number; startDistanceX: number; startDistanceY: number; startAngle: number; startRotation: number; snapshot: Snapshot };
type PhotoProject = {
  formatVersion: 1;
  application: "HINANA STUDIO PHOTO";
  savedAt: string;
  fileName: string;
  original: string;
  snapshot: Snapshot;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  hue: 0,
};

const adjustmentMeta: { key: AdjustmentKey; label: string; min: number; max: number; suffix?: string }[] = [
  { key: "brightness", label: "밝기", min: -100, max: 100 },
  { key: "contrast", label: "대비", min: -100, max: 100 },
  { key: "saturation", label: "채도", min: -100, max: 100 },
  { key: "temperature", label: "색온도", min: -100, max: 100 },
  { key: "hue", label: "색조", min: -180, max: 180, suffix: "°" },
];

const dataUrlToImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = reject;
  image.src = url;
});

export default function App() {
  const sourceRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const layerCanvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerFileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const originalRef = useRef<string>("");
  const undoRef = useRef<Snapshot[]>([]);
  const redoRef = useRef<Snapshot[]>([]);
  const strokeSnapshotRef = useRef<Snapshot | null>(null);
  const rendererReadySentRef = useRef(false);
  const brushLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [fileName, setFileName] = useState("새 이미지");
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [zoom, setZoom] = useState(1);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const adjustmentsRef = useRef(adjustments);
  const [brushSize, setBrushSize] = useState(72);
  const [brushColor, setBrushColor] = useState("#ffc639");
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [mosaicSize, setMosaicSize] = useState(14);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 10, y: 10, width: 80, height: 80 });
  const [painting, setPainting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const cropDragRef = useRef<CropDrag | null>(null);
  const layerMoveRef = useRef<{ id: string; startX: number; startY: number; x: number; y: number; displayWidth: number; displayHeight: number } | null>(null);
  const transformDragRef = useRef<TransformDrag | null>(null);
  const [status, setStatus] = useState("이미지를 열거나 이곳에 드래그하세요");
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg">("png");
  const [showExport, setShowExport] = useState(false);
  const [activePanel, setActivePanel] = useState<"adjust" | "layers">("adjust");
  const [layers, setLayers] = useState<LayerMeta[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState("background");
  const [showAbout, setShowAbout] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [projectPath, setProjectPath] = useState<string | null>(null);

  useEffect(() => { adjustmentsRef.current = adjustments; }, [adjustments]);

  const render = useCallback(() => {
    const output = canvasRef.current;
    const source = sourceRef.current;
    if (!output || !source.width) return;
    output.width = source.width;
    output.height = source.height;
    const ctx = output.getContext("2d");
    if (!ctx) return;
    const a = adjustmentsRef.current;
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.filter = `brightness(${100 + a.brightness}%) contrast(${100 + a.contrast}%) saturate(${100 + a.saturation}%) hue-rotate(${a.hue}deg)`;
    ctx.drawImage(source, 0, 0);
    for (const layer of layers) {
      if (!layer.visible) continue;
      const layerCanvas = layerCanvasesRef.current.get(layer.id);
      if (!layerCanvas) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity / 100;
      ctx.translate(source.width / 2 + layer.x, source.height / 2 + layer.y);
      ctx.rotate((layer.rotation * Math.PI) / 180);
      ctx.scale(layer.scaleX / 100, layer.scaleY / 100);
      ctx.drawImage(layerCanvas, -source.width / 2, -source.height / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    if (a.temperature !== 0) {
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = Math.abs(a.temperature) / 180;
      ctx.fillStyle = a.temperature > 0 ? "#ff8a35" : "#398cff";
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }, [layers]);

  useEffect(() => { render(); }, [adjustments, revision, render]);

  const currentSnapshot = (): Snapshot => ({
    image: sourceRef.current.toDataURL("image/png"),
    adjustments: { ...adjustmentsRef.current },
    layers: layers.map((layer) => ({
      ...layer,
      image: layerCanvasesRef.current.get(layer.id)?.toDataURL("image/png") || "",
    })),
    selectedLayerId,
  });

  const pushUndo = () => {
    if (!sourceRef.current.width) return;
    undoRef.current.push(currentSnapshot());
    if (undoRef.current.length > 30) undoRef.current.shift();
    redoRef.current = [];
  };

  const restoreSnapshot = async (snapshot: Snapshot) => {
    const image = await dataUrlToImage(snapshot.image);
    const source = sourceRef.current;
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    source.getContext("2d")!.drawImage(image, 0, 0);
    const restoredLayers: LayerMeta[] = [];
    const restoredCanvases = new Map<string, HTMLCanvasElement>();
    for (const saved of snapshot.layers || []) {
      const layerCanvas = document.createElement("canvas");
      layerCanvas.width = source.width;
      layerCanvas.height = source.height;
      if (saved.image) {
        const layerImage = await dataUrlToImage(saved.image);
        layerCanvas.getContext("2d")!.drawImage(layerImage, 0, 0);
      }
      restoredCanvases.set(saved.id, layerCanvas);
      const legacyScale = (saved as LayerSnapshot & { scale?: number }).scale || 100;
      restoredLayers.push({
        id: saved.id,
        name: saved.name,
        kind: saved.kind || "pixel",
        visible: saved.visible,
        opacity: saved.opacity,
        x: saved.x || 0,
        y: saved.y || 0,
        scaleX: saved.scaleX || legacyScale,
        scaleY: saved.scaleY || legacyScale,
        rotation: saved.rotation || 0,
        contentWidth: saved.contentWidth || source.width,
        contentHeight: saved.contentHeight || source.height,
        text: saved.text,
        fontSize: saved.fontSize,
        fontFamily: saved.fontFamily,
        fontWeight: saved.fontWeight,
        textColor: saved.textColor,
        textAlign: saved.textAlign,
      });
    }
    layerCanvasesRef.current = restoredCanvases;
    setLayers(restoredLayers);
    setSelectedLayerId(snapshot.selectedLayerId || "background");
    setAdjustments(snapshot.adjustments);
    adjustmentsRef.current = snapshot.adjustments;
    setRevision((value) => value + 1);
  };

  const serializeProject = (): string => JSON.stringify({
    formatVersion: 1,
    application: "HINANA STUDIO PHOTO",
    savedAt: new Date().toISOString(),
    fileName,
    original: originalRef.current,
    snapshot: currentSnapshot(),
  } satisfies PhotoProject);

  const restoreProject = async (raw: string, path: string | null = null) => {
    const project = JSON.parse(raw) as PhotoProject;
    if (project.application !== "HINANA STUDIO PHOTO" || project.formatVersion !== 1 || !project.snapshot?.image) {
      throw new Error("지원하지 않거나 손상된 HINANA PHOTO 프로젝트입니다.");
    }
    await restoreSnapshot(project.snapshot);
    originalRef.current = project.original || project.snapshot.image;
    setFileName(project.fileName || "복원된 프로젝트");
    setLoaded(true);
    setProjectPath(path);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setTool("move");
    undoRef.current = [];
    redoRef.current = [];
    setStatus(`프로젝트를 불러왔습니다${path ? ` · ${path}` : ""}`);
  };

  const saveProject = async (saveAs = false) => {
    if (!loaded) return;
    const data = serializeProject();
    if (window.hinanaPhoto) {
      const saved = await window.hinanaPhoto.saveProject(data, saveAs);
      if (saved) {
        setProjectPath(saved);
        setStatus(`프로젝트 저장 완료 · ${saved}`);
      }
      return;
    }
    const blob = new Blob([data], { type: "application/x-hinana-photo-project" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${fileName.replace(/\.[^.]+$/, "") || "새 프로젝트"}.hinanaphoto`;
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("프로젝트를 저장했습니다");
  };

  const openProject = async () => {
    try {
      if (window.hinanaPhoto) {
        const opened = await window.hinanaPhoto.openProject();
        if (opened) await restoreProject(opened.data, opened.path);
      } else projectFileInputRef.current?.click();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "프로젝트를 열 수 없습니다.");
    }
  };

  const undo = async () => {
    const snapshot = undoRef.current.pop();
    if (!snapshot) return;
    redoRef.current.push(currentSnapshot());
    await restoreSnapshot(snapshot);
    setStatus("실행 취소했습니다");
  };

  const redo = async () => {
    const snapshot = redoRef.current.pop();
    if (!snapshot) return;
    undoRef.current.push(currentSnapshot());
    await restoreSnapshot(snapshot);
    setStatus("다시 실행했습니다");
  };

  const loadBlob = async (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    try {
      const image = await dataUrlToImage(url);
      const source = sourceRef.current;
      source.width = image.naturalWidth;
      source.height = image.naturalHeight;
      source.getContext("2d")!.drawImage(image, 0, 0);
      originalRef.current = source.toDataURL("image/png");
      undoRef.current = [];
      redoRef.current = [];
      layerCanvasesRef.current.clear();
      setLayers([]);
      setSelectedLayerId("background");
      setProjectPath(null);
      void window.hinanaPhoto?.newProject();
      setAdjustments(DEFAULT_ADJUSTMENTS);
      adjustmentsRef.current = DEFAULT_ADJUSTMENTS;
      setFileName(name);
      setLoaded(true);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRevision((value) => value + 1);
      setStatus(`${image.naturalWidth} × ${image.naturalHeight}px · ${name}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const openImage = async () => {
    if (window.hinanaPhoto) {
      const selected = await window.hinanaPhoto.selectImage();
      if (selected) await loadBlob(new Blob([selected.data]), selected.name);
    } else fileInputRef.current?.click();
  };

  const transformImage = (kind: "cw" | "ccw" | "flipH" | "flipV") => {
    const old = sourceRef.current;
    if (!old.width) return;
    const originalWidth = old.width;
    const originalHeight = old.height;
    pushUndo();
    const next = document.createElement("canvas");
    const rotate = kind === "cw" || kind === "ccw";
    next.width = rotate ? old.height : old.width;
    next.height = rotate ? old.width : old.height;
    const ctx = next.getContext("2d")!;
    ctx.translate(next.width / 2, next.height / 2);
    if (kind === "cw") ctx.rotate(Math.PI / 2);
    if (kind === "ccw") ctx.rotate(-Math.PI / 2);
    if (kind === "flipH") ctx.scale(-1, 1);
    if (kind === "flipV") ctx.scale(1, -1);
    ctx.drawImage(old, -old.width / 2, -old.height / 2);
    old.width = next.width;
    old.height = next.height;
    old.getContext("2d")!.drawImage(next, 0, 0);
    for (const layer of layers) {
      const oldLayer = layerCanvasesRef.current.get(layer.id);
      if (!oldLayer) continue;
      const flattened = document.createElement("canvas");
      flattened.width = originalWidth;
      flattened.height = originalHeight;
      const flatContext = flattened.getContext("2d")!;
      flatContext.translate(originalWidth / 2 + layer.x, originalHeight / 2 + layer.y);
      flatContext.rotate((layer.rotation * Math.PI) / 180);
      flatContext.scale(layer.scaleX / 100, layer.scaleY / 100);
      flatContext.drawImage(oldLayer, -originalWidth / 2, -originalHeight / 2);
      const nextLayer = document.createElement("canvas");
      nextLayer.width = next.width;
      nextLayer.height = next.height;
      const layerContext = nextLayer.getContext("2d")!;
      layerContext.translate(nextLayer.width / 2, nextLayer.height / 2);
      if (kind === "cw") layerContext.rotate(Math.PI / 2);
      if (kind === "ccw") layerContext.rotate(-Math.PI / 2);
      if (kind === "flipH") layerContext.scale(-1, 1);
      if (kind === "flipV") layerContext.scale(1, -1);
      layerContext.drawImage(flattened, -flattened.width / 2, -flattened.height / 2);
      layerCanvasesRef.current.set(layer.id, nextLayer);
    }
    setLayers((current) => current.map((layer) => ({ ...layer, x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0, contentWidth: next.width, contentHeight: next.height })));
    setRevision((value) => value + 1);
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const output = canvasRef.current;
    if (!output) return null;
    const rect = output.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (output.width / rect.width),
      y: (clientY - rect.top) * (output.height / rect.height),
      scale: output.width / rect.width,
    };
  };

  const activePaintCanvas = () =>
    selectedLayerId === "background"
      ? sourceRef.current
      : layerCanvasesRef.current.get(selectedLayerId) || sourceRef.current;

  const pointForActiveLayer = (point: { x: number; y: number; scale: number }) => {
    const layer = layers.find((item) => item.id === selectedLayerId);
    if (!layer) return point;
    const centerX = sourceRef.current.width / 2;
    const centerY = sourceRef.current.height / 2;
    const radians = (-layer.rotation * Math.PI) / 180;
    const translatedX = point.x - centerX - layer.x;
    const translatedY = point.y - centerY - layer.y;
    const factorX = 100 / layer.scaleX;
    const factorY = 100 / layer.scaleY;
    return {
      x: (translatedX * Math.cos(radians) - translatedY * Math.sin(radians)) * factorX + centerX,
      y: (translatedX * Math.sin(radians) + translatedY * Math.cos(radians)) * factorY + centerY,
      scale: point.scale * ((factorX + factorY) / 2),
    };
  };

  const applyBrush = (clientX: number, clientY: number, begin = false) => {
    const rawPoint = canvasPoint(clientX, clientY);
    if (!rawPoint) return;
    const point = pointForActiveLayer(rawPoint);
    const target = activePaintCanvas();
    const context = target.getContext("2d")!;
    const previous = begin || !brushLastPointRef.current ? point : brushLastPointRef.current;
    context.save();
    context.globalAlpha = brushOpacity / 100;
    context.strokeStyle = brushColor;
    context.lineWidth = Math.max(1, brushSize * point.scale);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x + (begin ? 0.01 : 0), point.y);
    context.stroke();
    context.restore();
    brushLastPointRef.current = { x: point.x, y: point.y };
    setRevision((value) => value + 1);
  };

  const applyMosaic = (clientX: number, clientY: number) => {
    const output = canvasRef.current;
    const source = sourceRef.current;
    if (!output || !source.width) return;
    const rect = output.getBoundingClientRect();
    const x = (clientX - rect.left) * (source.width / rect.width);
    const y = (clientY - rect.top) * (source.height / rect.height);
    const scale = source.width / rect.width;
    const radius = (brushSize * scale) / 2;
    const block = Math.max(2, Math.round(mosaicSize * scale));
    const ctx = source.getContext("2d")!;
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d")!.drawImage(source, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();
    const startX = Math.floor((x - radius) / block) * block;
    const startY = Math.floor((y - radius) / block) * block;
    for (let py = startY; py < y + radius; py += block) {
      for (let px = startX; px < x + radius; px += block) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(copy, px, py, block, block, px, py, block, block);
        const sample = copy.getContext("2d")!.getImageData(
          Math.max(0, Math.min(source.width - 1, px + Math.floor(block / 2))),
          Math.max(0, Math.min(source.height - 1, py + Math.floor(block / 2))), 1, 1,
        ).data;
        ctx.fillStyle = `rgba(${sample[0]},${sample[1]},${sample[2]},${sample[3] / 255})`;
        ctx.fillRect(px, py, block, block);
      }
    }
    ctx.restore();
    setRevision((value) => value + 1);
  };

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    if (tool === "crop") return;
    if (tool === "text") {
      addTextLayerAt(event.clientX, event.clientY);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "mosaic") {
      strokeSnapshotRef.current = currentSnapshot();
      setPainting(true);
      applyMosaic(event.clientX, event.clientY);
    } else if (tool === "brush") {
      strokeSnapshotRef.current = currentSnapshot();
      brushLastPointRef.current = null;
      setPainting(true);
      applyBrush(event.clientX, event.clientY, true);
    } else if (tool === "move" && selectedLayerId !== "background") {
      const layer = layers.find((item) => item.id === selectedLayerId);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!layer || !rect) return;
      strokeSnapshotRef.current = currentSnapshot();
      layerMoveRef.current = {
        id: layer.id,
        startX: event.clientX,
        startY: event.clientY,
        x: layer.x,
        y: layer.y,
        displayWidth: rect.width,
        displayHeight: rect.height,
      };
    } else {
      panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
      setDragging(true);
    }
  };

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (painting && tool === "mosaic") applyMosaic(event.clientX, event.clientY);
    if (painting && tool === "brush") applyBrush(event.clientX, event.clientY);
    if (layerMoveRef.current) {
      const drag = layerMoveRef.current;
      const x = drag.x + ((event.clientX - drag.startX) / drag.displayWidth) * sourceRef.current.width;
      const y = drag.y + ((event.clientY - drag.startY) / drag.displayHeight) * sourceRef.current.height;
      setLayers((current) => current.map((layer) => layer.id === drag.id ? { ...layer, x, y } : layer));
    }
    if (dragging) setPan({
      x: panStart.current.panX + event.clientX - panStart.current.x,
      y: panStart.current.panY + event.clientY - panStart.current.y,
    });
  };

  const pointerUp = () => {
    if (painting && strokeSnapshotRef.current) {
      undoRef.current.push(strokeSnapshotRef.current);
      redoRef.current = [];
      strokeSnapshotRef.current = null;
      setStatus(tool === "brush" ? "브러시 획을 적용했습니다" : "모자이크를 적용했습니다");
    }
    if (layerMoveRef.current && strokeSnapshotRef.current) {
      undoRef.current.push(strokeSnapshotRef.current);
      redoRef.current = [];
      strokeSnapshotRef.current = null;
      setStatus("레이어 위치를 이동했습니다");
    }
    brushLastPointRef.current = null;
    layerMoveRef.current = null;
    setPainting(false);
    setDragging(false);
  };

  const resetAll = async () => {
    if (!originalRef.current) return;
    pushUndo();
    await restoreSnapshot({ image: originalRef.current, adjustments: { ...DEFAULT_ADJUSTMENTS }, layers: [], selectedLayerId: "background" });
    setStatus("원본 상태로 되돌렸습니다");
  };

  const applyCrop = () => {
    const source = sourceRef.current;
    if (!source.width) return;
    const originalWidth = source.width;
    const originalHeight = source.height;
    const x = Math.min(source.width - 1, Math.round((cropRect.x / 100) * source.width));
    const y = Math.min(source.height - 1, Math.round((cropRect.y / 100) * source.height));
    const width = Math.max(1, Math.min(source.width - x, Math.round((cropRect.width / 100) * source.width)));
    const height = Math.max(1, Math.min(source.height - y, Math.round((cropRect.height / 100) * source.height)));
    pushUndo();
    const cropCanvas = (canvas: HTMLCanvasElement) => {
      const next = document.createElement("canvas");
      next.width = width;
      next.height = height;
      next.getContext("2d")!.drawImage(canvas, x, y, width, height, 0, 0, width, height);
      return next;
    };
    const croppedSource = cropCanvas(source);
    source.width = width;
    source.height = height;
    source.getContext("2d")!.drawImage(croppedSource, 0, 0);
    for (const layer of layers) {
      const layerCanvas = layerCanvasesRef.current.get(layer.id);
      if (!layerCanvas) continue;
      const flattened = document.createElement("canvas");
      flattened.width = originalWidth;
      flattened.height = originalHeight;
      const context = flattened.getContext("2d")!;
      context.translate(originalWidth / 2 + layer.x, originalHeight / 2 + layer.y);
      context.rotate((layer.rotation * Math.PI) / 180);
      context.scale(layer.scaleX / 100, layer.scaleY / 100);
      context.drawImage(layerCanvas, -originalWidth / 2, -originalHeight / 2);
      layerCanvasesRef.current.set(layer.id, cropCanvas(flattened));
    }
    setLayers((current) => current.map((layer) => ({ ...layer, x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0, contentWidth: width, contentHeight: height })));
    setCropRect({ x: 10, y: 10, width: 80, height: 80 });
    setTool("move");
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRevision((value) => value + 1);
    setStatus(`${width} × ${height}px로 잘랐습니다`);
  };

  const cropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = (event.target as HTMLElement).dataset.handle as CropDrag["mode"] | undefined;
    const rect = canvas.getBoundingClientRect();
    cropDragRef.current = {
      mode: handle || "move",
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...cropRect },
      displayWidth: rect.width,
      displayHeight: rect.height,
    };
  };

  const cropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    const dx = ((event.clientX - drag.startX) / drag.displayWidth) * 100;
    const dy = ((event.clientY - drag.startY) / drag.displayHeight) * 100;
    const base = drag.rect;
    const right = base.x + base.width;
    const bottom = base.y + base.height;
    const minimum = 2;
    let next = { ...base };
    if (drag.mode === "move") {
      next.x = clamp(base.x + dx, 0, 100 - base.width);
      next.y = clamp(base.y + dy, 0, 100 - base.height);
    } else {
      if (drag.mode === "nw" || drag.mode === "sw") {
        next.x = clamp(base.x + dx, 0, right - minimum);
        next.width = right - next.x;
      }
      if (drag.mode === "ne" || drag.mode === "se") {
        next.width = clamp(base.width + dx, minimum, 100 - base.x);
      }
      if (drag.mode === "nw" || drag.mode === "ne") {
        next.y = clamp(base.y + dy, 0, bottom - minimum);
        next.height = bottom - next.y;
      }
      if (drag.mode === "sw" || drag.mode === "se") {
        next.height = clamp(base.height + dy, minimum, 100 - base.y);
      }
    }
    setCropRect(next);
  };

  const cropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    cropDragRef.current = null;
  };

  const transformPointerDown = (event: React.PointerEvent<HTMLElement>, mode: "resize" | "rotate") => {
    const layer = layers.find((item) => item.id === selectedLayerId);
    const frame = canvasRef.current?.getBoundingClientRect();
    if (!layer || !frame) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const centerX = frame.left + ((sourceRef.current.width / 2 + layer.x) / sourceRef.current.width) * frame.width;
    const centerY = frame.top + ((sourceRef.current.height / 2 + layer.y) / sourceRef.current.height) * frame.height;
    const radians = (layer.rotation * Math.PI) / 180;
    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;
    const localX = deltaX * Math.cos(radians) + deltaY * Math.sin(radians);
    const localY = -deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
    transformDragRef.current = {
      mode,
      id: layer.id,
      centerX,
      centerY,
      startScaleX: layer.scaleX,
      startScaleY: layer.scaleY,
      startDistanceX: Math.max(1, Math.abs(localX)),
      startDistanceY: Math.max(1, Math.abs(localY)),
      startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX),
      startRotation: layer.rotation,
      snapshot: currentSnapshot(),
    };
  };

  const transformPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = transformDragRef.current;
    if (!drag) return;
    if (drag.mode === "resize") {
      const radians = (drag.startRotation * Math.PI) / 180;
      const deltaX = event.clientX - drag.centerX;
      const deltaY = event.clientY - drag.centerY;
      const localX = deltaX * Math.cos(radians) + deltaY * Math.sin(radians);
      const localY = -deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
      const scaleX = clamp(drag.startScaleX * (Math.abs(localX) / drag.startDistanceX), 5, 500);
      const scaleY = clamp(drag.startScaleY * (Math.abs(localY) / drag.startDistanceY), 5, 500);
      setLayers((current) => current.map((layer) => layer.id === drag.id ? { ...layer, scaleX, scaleY } : layer));
    } else {
      const angle = Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX);
      const rawRotation = drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI;
      const rotation = ((rawRotation + 180) % 360 + 360) % 360 - 180;
      setLayers((current) => current.map((layer) => layer.id === drag.id ? { ...layer, rotation: Math.round(rotation * 10) / 10 } : layer));
    }
  };

  const transformPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = transformDragRef.current;
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    undoRef.current.push(drag.snapshot);
    redoRef.current = [];
    transformDragRef.current = null;
    setStatus("레이어 자유 변형을 적용했습니다");
  };

  const drawTextLayer = (layer: LayerMeta): LayerMeta => {
    const canvas = layerCanvasesRef.current.get(layer.id);
    if (!canvas || layer.kind !== "text") return layer;
    const context = canvas.getContext("2d")!;
    const fontSize = layer.fontSize || 64;
    const fontFamily = layer.fontFamily || "Inter";
    const fontWeight = layer.fontWeight || "400";
    const lines = (layer.text || "텍스트를 입력하세요").split("\n");
    const lineHeight = fontSize * 1.25;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
    context.textBaseline = "middle";
    context.fillStyle = layer.textColor || "#ffffff";
    const maxWidth = Math.max(20, ...lines.map((line) => context.measureText(line || " ").width));
    const totalHeight = Math.max(lineHeight, lines.length * lineHeight);
    const align = layer.textAlign || "center";
    context.textAlign = align;
    const centerX = canvas.width / 2;
    const blockLeft = centerX - maxWidth / 2;
    const textX = align === "left" ? blockLeft : align === "right" ? blockLeft + maxWidth : centerX;
    const startY = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;
    lines.forEach((line, index) => context.fillText(line || " ", textX, startY + index * lineHeight));
    return { ...layer, contentWidth: maxWidth, contentHeight: totalHeight };
  };

  const addTextLayerAt = (clientX: number, clientY: number) => {
    const point = canvasPoint(clientX, clientY);
    if (!point) return;
    pushUndo();
    const id = `text-${Date.now().toString(36)}`;
    const canvas = document.createElement("canvas");
    canvas.width = sourceRef.current.width;
    canvas.height = sourceRef.current.height;
    layerCanvasesRef.current.set(id, canvas);
    const layer = drawTextLayer({
      id,
      name: "텍스트",
      kind: "text",
      visible: true,
      opacity: 100,
      x: point.x - canvas.width / 2,
      y: point.y - canvas.height / 2,
      scaleX: 100,
      scaleY: 100,
      rotation: 0,
      contentWidth: 200,
      contentHeight: 80,
      text: "텍스트를 입력하세요",
      fontSize: 64,
      fontFamily: "Inter",
      fontWeight: "700",
      textColor: "#ffffff",
      textAlign: "center",
    });
    setLayers((current) => [...current, layer]);
    setSelectedLayerId(id);
    setActivePanel("layers");
    setTool("move");
    setRevision((value) => value + 1);
    setStatus("텍스트 레이어를 추가했습니다");
  };

  const addLayer = () => {
    if (!loaded) return;
    pushUndo();
    const id = `layer-${Date.now().toString(36)}`;
    const canvas = document.createElement("canvas");
    canvas.width = sourceRef.current.width;
    canvas.height = sourceRef.current.height;
    layerCanvasesRef.current.set(id, canvas);
    setLayers((current) => [...current, { id, name: `레이어 ${current.length + 1}`, kind: "pixel", visible: true, opacity: 100, x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0, contentWidth: canvas.width, contentHeight: canvas.height }]);
    setSelectedLayerId(id);
    setTool("brush");
    setStatus("새 픽셀 레이어를 추가했습니다");
  };

  const addImageLayerBlob = async (blob: Blob, name: string) => {
    if (!loaded) return;
    const url = URL.createObjectURL(blob);
    try {
      const image = await dataUrlToImage(url);
      pushUndo();
      const id = `layer-${Date.now().toString(36)}`;
      const canvas = document.createElement("canvas");
      canvas.width = sourceRef.current.width;
      canvas.height = sourceRef.current.height;
      const fit = Math.min(1, (canvas.width * 0.82) / image.naturalWidth, (canvas.height * 0.82) / image.naturalHeight);
      const width = image.naturalWidth * fit;
      const height = image.naturalHeight * fit;
      canvas.getContext("2d")!.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      layerCanvasesRef.current.set(id, canvas);
      setLayers((current) => [...current, {
        id,
        name: name.replace(/\.[^.]+$/, "") || `이미지 레이어 ${current.length + 1}`,
        kind: "pixel",
        visible: true,
        opacity: 100,
        x: 0,
        y: 0,
        scaleX: 100,
        scaleY: 100,
        rotation: 0,
        contentWidth: width,
        contentHeight: height,
      }]);
      setSelectedLayerId(id);
      setActivePanel("layers");
      setTool("move");
      setRevision((value) => value + 1);
      setStatus(`${name}을(를) 새 레이어로 추가했습니다`);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const importImageLayer = async () => {
    if (!loaded) return;
    if (window.hinanaPhoto) {
      const selected = await window.hinanaPhoto.selectImage();
      if (selected) await addImageLayerBlob(new Blob([selected.data]), selected.name);
    } else layerFileInputRef.current?.click();
  };

  const duplicateLayer = () => {
    const selected = layers.find((layer) => layer.id === selectedLayerId);
    const sourceLayer = selected && layerCanvasesRef.current.get(selected.id);
    if (!selected || !sourceLayer) return;
    pushUndo();
    const id = `layer-${Date.now().toString(36)}`;
    const canvas = document.createElement("canvas");
    canvas.width = sourceLayer.width;
    canvas.height = sourceLayer.height;
    canvas.getContext("2d")!.drawImage(sourceLayer, 0, 0);
    layerCanvasesRef.current.set(id, canvas);
    setLayers((current) => [...current, { ...selected, id, name: `${selected.name} 복사본` }]);
    setSelectedLayerId(id);
    setRevision((value) => value + 1);
  };

  const deleteLayer = () => {
    if (selectedLayerId === "background") return;
    pushUndo();
    layerCanvasesRef.current.delete(selectedLayerId);
    setLayers((current) => current.filter((layer) => layer.id !== selectedLayerId));
    setSelectedLayerId("background");
    setRevision((value) => value + 1);
    setStatus("레이어를 삭제했습니다");
  };

  const updateLayer = (id: string, patch: Partial<LayerMeta>, saveHistory = false) => {
    if (saveHistory) pushUndo();
    setLayers((current) => current.map((layer) => {
      if (layer.id !== id) return layer;
      const next = { ...layer, ...patch };
      return next.kind === "text" ? drawTextLayer(next) : next;
    }));
  };

  const moveLayerOrder = (direction: "up" | "down") => {
    const index = layers.findIndex((layer) => layer.id === selectedLayerId);
    if (index < 0) return;
    const nextIndex = direction === "up" ? Math.min(layers.length - 1, index + 1) : Math.max(0, index - 1);
    if (nextIndex === index) return;
    pushUndo();
    setLayers((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setRevision((value) => value + 1);
  };

  const exportImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const mime = exportFormat === "jpeg" ? "image/jpeg" : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92));
    if (!blob) return;
    const bytes = await blob.arrayBuffer();
    if (window.hinanaPhoto) {
      const saved = await window.hinanaPhoto.exportImage(bytes, fileName, exportFormat);
      if (saved) setStatus(`내보내기 완료 · ${saved}`);
    } else {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName.replace(/\.[^.]+$/, "") + (exportFormat === "jpeg" ? ".jpg" : ".png");
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus("이미지를 내보냈습니다");
    }
    setShowExport(false);
  };

  useEffect(() => {
    const cleanup = window.hinanaPhoto?.onMenuAction((action) => {
      if (action === "open") void openImage();
      if (action === "importLayer") void importImageLayer();
      if (action === "openProject") void openProject();
      if (action === "saveProject") void saveProject(false);
      if (action === "saveProjectAs") void saveProject(true);
      if (action === "export") setShowExport(true);
      if (action === "undo") void undo();
      if (action === "redo") void redo();
      if (action === "reset") void resetAll();
      if (action === "about") setShowAbout(true);
      if (action === "zoomIn") setZoom((z) => Math.min(4, z + 0.1));
      if (action === "zoomOut") setZoom((z) => Math.max(0.1, z - 0.1));
      if (action === "fit") { setZoom(1); setPan({ x: 0, y: 0 }); }
    });
    const projectCleanup = window.hinanaPhoto?.onProjectFile((project) => {
      void restoreProject(project.data, project.path).catch((error) =>
        setStatus(error instanceof Error ? error.message : "프로젝트를 열 수 없습니다."),
      );
    });
    if (!rendererReadySentRef.current) {
      rendererReadySentRef.current = true;
      window.hinanaPhoto?.rendererReady();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key.toLowerCase() === "m") setTool("mosaic");
      if (event.key.toLowerCase() === "v") setTool("move");
      if (event.key.toLowerCase() === "b" && loaded) setTool("brush");
      if (event.key.toLowerCase() === "c" && loaded) setTool("crop");
      if (event.key.toLowerCase() === "t" && loaded) setTool("text");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") { event.preventDefault(); void openImage(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void saveProject(event.shiftKey); }
    };
    window.addEventListener("keydown", onKey);
    return () => { cleanup?.(); projectCleanup?.(); window.removeEventListener("keydown", onKey); };
  });

  const displayPercent = Math.round(zoom * 100);
  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId);

  return (
    <main className="app-shell" onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith("image/")) {
        if (loaded) void addImageLayerBlob(file, file.name);
        else void loadBlob(file, file.name);
      }
    }}>
      <header className="topbar">
        <div className="brand-mark"><img src={photoIconUrl} alt="" /></div>
        <div className="brand"><strong>HINANA STUDIO</strong><span>PHOTO</span></div>
        <div className="document-title"><i />{projectPath ? projectPath.split(/[\\/]/).pop() : fileName}</div>
        <div className="top-actions">
          <button onClick={() => void openImage()}><FolderOpen size={14} /> 열기</button>
          <button onClick={() => void openProject()}><FileArchive size={14} /> 프로젝트</button>
          <button disabled={!loaded} onClick={() => void saveProject(false)}><Save size={14} /> 저장</button>
          <button disabled={!loaded} onClick={() => setShowExport(true)} className="primary"><Download size={14} /> 내보내기</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="left-panel">
          <nav className="tool-rail">
            <button className={tool === "move" ? "active" : ""} onClick={() => setTool("move")}><MousePointer2 size={20} /><span>이동</span><kbd>V</kbd></button>
            <button className={tool === "mosaic" ? "active" : ""} onClick={() => setTool("mosaic")}><Blend size={20} /><span>모자이크</span><kbd>M</kbd></button>
            <button disabled={!loaded} className={tool === "brush" ? "active" : ""} onClick={() => setTool("brush")}><Brush size={20} /><span>브러시</span><kbd>B</kbd></button>
            <button disabled={!loaded} className={tool === "text" ? "active" : ""} onClick={() => setTool("text")}><TextCursorInput size={20} /><span>텍스트</span><kbd>T</kbd></button>
            <button disabled={!loaded} className={tool === "crop" ? "active" : ""} onClick={() => setTool("crop")}><PanelRight size={20} /><span>자르기</span><kbd>C</kbd></button>
            <button className="info-tool" onClick={() => setShowAbout(true)}><Info size={19} /><span>정보</span></button>
          </nav>
          <div className="left-content">
            <div className="panel-heading"><ImageIcon size={15} /> 이미지</div>
            {loaded ? <>
              <div className="thumbnail-card">
                <canvas className="thumbnail" width={sourceRef.current.width || 1} height={sourceRef.current.height || 1} ref={(node) => {
                  if (node && canvasRef.current && loaded) node.getContext("2d")?.drawImage(canvasRef.current, 0, 0, node.width, node.height);
                }} />
                <div><strong>{fileName}</strong><span>{sourceRef.current.width} × {sourceRef.current.height}</span></div>
              </div>
              <div className="section-label">빠른 변형</div>
              <div className="transform-grid">
                <button onClick={() => transformImage("ccw")} title="왼쪽 회전"><RotateCcw size={16} /></button>
                <button onClick={() => transformImage("cw")} title="오른쪽 회전"><RotateCw size={16} /></button>
                <button onClick={() => transformImage("flipH")} title="좌우 반전"><FlipHorizontal2 size={16} /></button>
                <button onClick={() => transformImage("flipV")} title="상하 반전"><FlipVertical2 size={16} /></button>
              </div>
              <button className="reset-button" onClick={() => void resetAll()}><RotateCcw size={13} /> 원본으로 초기화</button>
            </> : <button className="empty-library" onClick={() => void openImage()}><span><ImageIcon size={28} /></span><strong>이미지를 열어보세요</strong><small>PNG, JPG, WEBP, BMP</small></button>}
          </div>
        </aside>

        <section className="center-stage">
          <div className="canvas-toolbar">
            <div><button disabled={!loaded} onClick={() => void undo()} title="실행 취소"><Undo2 size={15} /></button><button disabled={!loaded} onClick={() => void redo()} title="다시 실행"><Redo2 size={15} /></button></div>
            <span className="toolbar-separator" />
            <div><button onClick={() => setZoom((z) => Math.max(.1, z - .1))}><ZoomOut size={15} /></button><button className="zoom-readout" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>{displayPercent}%</button><button onClick={() => setZoom((z) => Math.min(4, z + .1))}><ZoomIn size={15} /></button></div>
            {tool === "mosaic" && <div className="tool-options"><label>브러시 <input type="range" min="20" max="220" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /><b>{brushSize}px</b></label><label>블록 <input type="range" min="4" max="40" value={mosaicSize} onChange={(e) => setMosaicSize(Number(e.target.value))} /><b>{mosaicSize}px</b></label></div>}
            {tool === "brush" && <div className="tool-options brush-options"><label>색상 <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} /></label><label>크기 <input type="range" min="1" max="220" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /><b>{brushSize}px</b></label><label>불투명도 <input type="range" min="1" max="100" value={brushOpacity} onChange={(e) => setBrushOpacity(Number(e.target.value))} /><b>{brushOpacity}%</b></label></div>}
            {tool === "crop" && <div className="tool-options crop-options">
              {(["x", "y", "width", "height"] as const).map((key) => <label key={key}>{key === "x" ? "왼쪽" : key === "y" ? "위" : key === "width" ? "너비" : "높이"}<input type="number" min={key === "width" || key === "height" ? "1" : "0"} max={key === "x" || key === "y" ? "99" : "100"} value={cropRect[key]} onChange={(e) => setCropRect((current) => ({ ...current, [key]: Math.max(key === "width" || key === "height" ? 1 : 0, Math.min(key === "x" || key === "y" ? 99 : 100, Number(e.target.value))) }))} /><b>%</b></label>)}
              <button className="crop-apply" onClick={applyCrop}>적용</button><button onClick={() => setTool("move")}>취소</button>
            </div>}
          </div>
          <div className={`canvas-viewport ${tool}`}>
            {!loaded && <div className="welcome-drop"><div className="welcome-icon"><ImageIcon size={34} /></div><h1>사진 편집을 시작하세요</h1><p>이미지를 끌어다 놓거나 파일을 열어주세요.</p><button onClick={() => void openImage()}><FolderOpen size={15} /> 이미지 열기</button><span>PNG · JPG · WEBP · BMP</span></div>}
            <div className="canvas-pan" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
              <div className="canvas-frame" style={{ transform: `scale(${zoom})` }}>
                <canvas ref={canvasRef} className={loaded ? "visible" : ""} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} />
                {selectedLayer && tool === "move" && <div className="transform-box" style={{
                  left: `${50 + (selectedLayer.x / sourceRef.current.width) * 100}%`,
                  top: `${50 + (selectedLayer.y / sourceRef.current.height) * 100}%`,
                  width: `${(selectedLayer.contentWidth * selectedLayer.scaleX / 100 / sourceRef.current.width) * 100}%`,
                  height: `${(selectedLayer.contentHeight * selectedLayer.scaleY / 100 / sourceRef.current.height) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${selectedLayer.rotation}deg)`,
                }}>
                  <span className="transform-handle nw" onPointerDown={(e) => transformPointerDown(e, "resize")} onPointerMove={transformPointerMove} onPointerUp={transformPointerUp} onPointerCancel={transformPointerUp} />
                  <span className="transform-handle ne" onPointerDown={(e) => transformPointerDown(e, "resize")} onPointerMove={transformPointerMove} onPointerUp={transformPointerUp} onPointerCancel={transformPointerUp} />
                  <span className="transform-handle sw" onPointerDown={(e) => transformPointerDown(e, "resize")} onPointerMove={transformPointerMove} onPointerUp={transformPointerUp} onPointerCancel={transformPointerUp} />
                  <span className="transform-handle se" onPointerDown={(e) => transformPointerDown(e, "resize")} onPointerMove={transformPointerMove} onPointerUp={transformPointerUp} onPointerCancel={transformPointerUp} />
                  <i className="rotation-line" /><span className="rotation-handle" onPointerDown={(e) => transformPointerDown(e, "rotate")} onPointerMove={transformPointerMove} onPointerUp={transformPointerUp} onPointerCancel={transformPointerUp} />
                </div>}
                {loaded && tool === "crop" && <div className="crop-overlay" style={{ left: `${cropRect.x}%`, top: `${cropRect.y}%`, width: `${Math.min(cropRect.width, 100 - cropRect.x)}%`, height: `${Math.min(cropRect.height, 100 - cropRect.y)}%` }} onPointerDown={cropPointerDown} onPointerMove={cropPointerMove} onPointerUp={cropPointerUp} onPointerCancel={cropPointerUp}>
                  <span data-handle="nw" /><span data-handle="ne" /><span data-handle="sw" /><span data-handle="se" /><b>{Math.round(sourceRef.current.width * Math.min(cropRect.width, 100 - cropRect.x) / 100)} × {Math.round(sourceRef.current.height * Math.min(cropRect.height, 100 - cropRect.y) / 100)}</b>
                </div>}
              </div>
            </div>
          </div>
        </section>

        <aside className="right-panel">
          <div className="panel-tabs"><button className={activePanel === "adjust" ? "active" : ""} onClick={() => setActivePanel("adjust")}><SlidersHorizontal size={14} /> 조정</button><button className={activePanel === "layers" ? "active" : ""} onClick={() => setActivePanel("layers")}><Layers3 size={14} /> 레이어</button></div>
          {activePanel === "adjust" ? <div className="inspector-body">
            <div className="inspector-title"><div><strong>색상 및 톤</strong><span>이미지 전체를 보정합니다</span></div><button disabled={!loaded} onClick={() => { pushUndo(); setAdjustments(DEFAULT_ADJUSTMENTS); }}><RotateCcw size={13} /></button></div>
            {adjustmentMeta.map((item) => <label className="adjustment" key={item.key}>
              <span><b>{item.label}</b><output>{adjustments[item.key] > 0 ? "+" : ""}{adjustments[item.key]}{item.suffix}</output></span>
              <div><input disabled={!loaded} type="range" min={item.min} max={item.max} value={adjustments[item.key]} onPointerDown={pushUndo} onChange={(e) => setAdjustments((current) => ({ ...current, [item.key]: Number(e.target.value) }))} /><i style={{ left: `${((-item.min) / (item.max - item.min)) * 100}%` }} /></div>
            </label>)}
            <div className="preset-title">빠른 프리셋</div>
            <div className="presets">
              <button disabled={!loaded} onClick={() => { pushUndo(); setAdjustments({ brightness: 6, contrast: 12, saturation: 16, temperature: 10, hue: 0 }); }}>선명하게</button>
              <button disabled={!loaded} onClick={() => { pushUndo(); setAdjustments({ brightness: 4, contrast: -8, saturation: -12, temperature: 20, hue: 0 }); }}>따뜻하게</button>
              <button disabled={!loaded} onClick={() => { pushUndo(); setAdjustments({ brightness: 2, contrast: 18, saturation: -100, temperature: 0, hue: 0 }); }}>흑백</button>
            </div>
          </div> : <div className="layers-panel">
            <div className="layer-list">
              {[...layers].reverse().map((layer) => <div key={layer.id} className={`layer-row ${selectedLayerId === layer.id ? "active" : ""}`} onClick={() => setSelectedLayerId(layer.id)}>
                <button className="layer-eye" onClick={(event) => { event.stopPropagation(); updateLayer(layer.id, { visible: !layer.visible }, true); }}>{layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                <canvas className="layer-thumb" width="42" height="38" ref={(node) => { const source = layerCanvasesRef.current.get(layer.id); const context = node?.getContext("2d"); if (node && source && context) { context.clearRect(0, 0, 42, 38); context.drawImage(source, 0, 0, 42, 38); } }} /><div><strong>{layer.name}</strong><small>{layer.kind === "text" ? "텍스트" : "픽셀"} 레이어 · {layer.opacity}%</small></div><i />
              </div>)}
              <div className={`layer-row ${selectedLayerId === "background" ? "active" : ""}`} onClick={() => setSelectedLayerId("background")}><span className="layer-eye"><Eye size={13} /></span><canvas className="layer-thumb" width="42" height="38" ref={(node) => { const context = node?.getContext("2d"); if (node && loaded && context) { context.clearRect(0, 0, 42, 38); context.drawImage(sourceRef.current, 0, 0, 42, 38); } }} /><div><strong>{loaded ? fileName : "배경"}</strong><small>배경 레이어</small></div><i /></div>
            </div>
            {selectedLayer && <div className="layer-properties">
              <label className="layer-name"><span>이름</span><input value={selectedLayer.name} onFocus={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })} /></label>
              {selectedLayer.kind === "text" && <div className="text-properties">
                <label><span>내용</span><textarea value={selectedLayer.text || ""} onFocus={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { text: e.target.value })} /></label>
                <div><select value={selectedLayer.fontFamily || "Inter"} onFocus={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { fontFamily: e.target.value })}><option>Inter</option><option>Arial</option><option>Georgia</option><option>Courier New</option><option>Malgun Gothic</option></select><input type="number" min="8" max="400" value={selectedLayer.fontSize || 64} onFocus={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { fontSize: clamp(Number(e.target.value), 8, 400) })} /><input type="color" value={selectedLayer.textColor || "#ffffff"} onChange={(e) => updateLayer(selectedLayer.id, { textColor: e.target.value }, true)} /></div>
                <div className="text-buttons"><button className={selectedLayer.fontWeight === "700" ? "active" : ""} onClick={() => updateLayer(selectedLayer.id, { fontWeight: selectedLayer.fontWeight === "700" ? "400" : "700" }, true)}><Bold size={13} /></button><button className={selectedLayer.textAlign === "left" ? "active" : ""} onClick={() => updateLayer(selectedLayer.id, { textAlign: "left" }, true)}><AlignLeft size={13} /></button><button className={(selectedLayer.textAlign || "center") === "center" ? "active" : ""} onClick={() => updateLayer(selectedLayer.id, { textAlign: "center" }, true)}><AlignCenter size={13} /></button><button className={selectedLayer.textAlign === "right" ? "active" : ""} onClick={() => updateLayer(selectedLayer.id, { textAlign: "right" }, true)}><AlignRight size={13} /></button></div>
              </div>}
              <label className="layer-slider"><span>불투명도</span><input type="range" min="0" max="100" value={selectedLayer.opacity} onPointerDown={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { opacity: Number(e.target.value) })} /><b>{selectedLayer.opacity}%</b></label>
              <label className="layer-slider"><span>가로 위치</span><input type="range" min={-sourceRef.current.width} max={sourceRef.current.width} value={selectedLayer.x} onPointerDown={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { x: Number(e.target.value) })} /><b>{Math.round(selectedLayer.x)}</b></label>
              <label className="layer-slider"><span>세로 위치</span><input type="range" min={-sourceRef.current.height} max={sourceRef.current.height} value={selectedLayer.y} onPointerDown={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { y: Number(e.target.value) })} /><b>{Math.round(selectedLayer.y)}</b></label>
              <label className="layer-slider"><span>가로 크기</span><input type="range" min="5" max="500" value={selectedLayer.scaleX} onPointerDown={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { scaleX: Number(e.target.value) })} /><b>{Math.round(selectedLayer.scaleX)}%</b></label>
              <label className="layer-slider"><span>세로 크기</span><input type="range" min="5" max="500" value={selectedLayer.scaleY} onPointerDown={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { scaleY: Number(e.target.value) })} /><b>{Math.round(selectedLayer.scaleY)}%</b></label>
              <label className="layer-slider"><span>회전</span><input type="range" min="-180" max="180" value={selectedLayer.rotation} onPointerDown={pushUndo} onChange={(e) => updateLayer(selectedLayer.id, { rotation: Number(e.target.value) })} /><b>{selectedLayer.rotation}°</b></label>
              <button className="layer-transform-reset" onClick={() => updateLayer(selectedLayer.id, { x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0 }, true)}><RotateCcw size={12} /> 변형 초기화</button>
            </div>}
            <div className="layer-create-actions"><button disabled={!loaded} onClick={() => void importImageLayer()}><Upload size={14} /> 이미지 레이어</button><button disabled={!loaded} onClick={addLayer}><Plus size={14} /> 빈 레이어</button></div>
            <div className="layer-actions"><button disabled={!selectedLayer || layers.indexOf(selectedLayer) === layers.length - 1} onClick={() => moveLayerOrder("up")} title="앞으로"><ChevronUp size={14} /></button><button disabled={!selectedLayer || layers.indexOf(selectedLayer) === 0} onClick={() => moveLayerOrder("down")} title="뒤로"><ChevronDown size={14} /></button><button disabled={!selectedLayer} onClick={duplicateLayer} title="레이어 복제"><Copy size={14} /></button><button disabled={!selectedLayer} onClick={deleteLayer} title="레이어 삭제"><Trash2 size={14} /></button></div>
          </div>}
        </aside>
      </section>

      <footer className="statusbar"><span className="status-dot" /><span>{status}</span><div><span>{loaded ? `${sourceRef.current.width} × ${sourceRef.current.height}px` : "이미지 없음"}</span><span>RGB / 8 bit</span><span>HINANA PHOTO Alpha</span></div></footer>
      <input ref={fileInputRef} hidden type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void loadBlob(file, file.name); e.currentTarget.value = ""; }} />
      <input ref={layerFileInputRef} hidden type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) void addImageLayerBlob(file, file.name); e.currentTarget.value = ""; }} />
      <input ref={projectFileInputRef} hidden type="file" accept=".hinanaphoto" onChange={(e) => { const file = e.target.files?.[0]; if (file) void file.text().then((raw) => restoreProject(raw, file.name)).catch((error) => setStatus(error instanceof Error ? error.message : "프로젝트를 열 수 없습니다.")); e.currentTarget.value = ""; }} />

      {showExport && <div className="dialog-overlay" onMouseDown={() => setShowExport(false)}><div className="export-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-heading"><div><Download size={19} /><span><strong>이미지 내보내기</strong><small>편집 결과를 새 파일로 저장합니다.</small></span></div><button onClick={() => setShowExport(false)}>×</button></div>
        <div className="dialog-body"><label>파일 형식</label><div className="format-options"><button className={exportFormat === "png" ? "selected" : ""} onClick={() => setExportFormat("png")}><strong>PNG</strong><span>무손실 · 최상의 품질</span></button><button className={exportFormat === "jpeg" ? "selected" : ""} onClick={() => setExportFormat("jpeg")}><strong>JPEG</strong><span>작은 용량 · 사진에 적합</span></button></div><div className="export-summary"><span>출력 크기</span><strong>{sourceRef.current.width} × {sourceRef.current.height}px</strong></div></div>
        <div className="dialog-actions"><button onClick={() => setShowExport(false)}>취소</button><button className="primary" onClick={() => void exportImage()}><Download size={14} /> 내보내기</button></div>
      </div></div>}

      {showAbout && <div className="about-overlay" onMouseDown={() => setShowAbout(false)}><section className="about-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <button className="about-close" onClick={() => setShowAbout(false)}><X size={23} /></button>
        <div className="about-logo"><img src={photoIconUrl} alt="HINANA STUDIO PHOTO" /></div>
        <h2>HINANA STUDIO PHOTO</h2>
        <p>사진과 이야기를 자유롭게 편집하는 데스크톱 스튜디오</p>
        <dl>
          <div><dt>프로그램 명</dt><dd>HINANA STUDIO PHOTO</dd></div>
          <div><dt>개발/제작자</dt><dd>비나래 <button className="about-github" onClick={() => window.hinanaPhoto ? void window.hinanaPhoto.openExternal("https://github.com/murikubo") : window.open("https://github.com/murikubo", "_blank")}>GitHub</button></dd></div>
          <div><dt>버전</dt><dd>Ver. {packageInfo.version.replace(/-alpha\.(\d+)$/i, " Alpha $1")}</dd></div>
        </dl>
        <small className="about-copyright">Copyright © 2026 비나래. All rights reserved. <button onClick={() => setShowLicense(true)}>라이선스</button></small>
      </section></div>}

      {showLicense && <div className="license-overlay" onMouseDown={() => setShowLicense(false)}><section className="license-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <header><div><strong>라이선스</strong><span>HINANA STUDIO PHOTO</span></div><button onClick={() => setShowLicense(false)}><X size={19} /></button></header>
        <div className="license-content">
          <h3>Copyright © 2026 비나래. All rights reserved.</h3>
          <p>HINANA STUDIO PHOTO는 오픈소스 소프트웨어가 아닙니다. 공식 바이너리는 무료로 사용할 수 있고 공식 앱으로 만든 결과물의 권리는 사용자에게 있습니다.</p>
          <p>다만 소스 코드의 수정·재배포·리브랜딩, 바이너리 재배포 또는 별도 서비스 제공 권한은 부여되지 않습니다.</p>
          <h4>허용되는 사용</h4>
          <ul><li>공식 무수정 바이너리의 개인 및 상업적 이미지 제작 사용</li><li>공식 앱으로 제작하거나 편집한 결과물의 이용·배포</li><li>사용자가 소유하거나 적법한 권한을 가진 이미지와 프로젝트 편집</li></ul>
          <h4>허용되지 않는 사용</h4>
          <ul><li>소스 코드의 수정, 재배포, 리브랜딩 및 파생 제품 제작</li><li>바이너리의 재배포, 다른 제품과의 번들 및 출처 표시 제거</li><li>사전 허가 없는 호스팅·상업 서비스 또는 별도 서비스 제공</li></ul>
          <p className="license-note">제3자 라이브러리와 글꼴은 각 구성 요소의 라이선스를 따릅니다. 전체 조건은 프로그램에 포함된 LICENSE 문서를 기준으로 합니다.</p>
        </div>
        <footer><button onClick={() => window.hinanaPhoto ? void window.hinanaPhoto.openExternal("https://github.com/murikubo") : window.open("https://github.com/murikubo", "_blank")}>GitHub</button><button className="primary" onClick={() => setShowLicense(false)}>확인</button></footer>
      </section></div>}
    </main>
  );
}
