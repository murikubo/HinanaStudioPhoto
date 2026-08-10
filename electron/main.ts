import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { gzip, gunzip } from "zlib";

app.setName("HINANA STUDIO PHOTO");
app.setAppUserModelId("studio.hinana.photo");

let mainWindow: BrowserWindow | null = null;
let currentProjectPath: string | null = null;
let pendingProjectPath = process.argv.find((argument) => /\.hinanaphoto$/i.test(argument)) || null;
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const send = (action: string) => mainWindow?.webContents.send("menu:action", action);
const readProjectFile = async (filePath: string) => {
  currentProjectPath = filePath;
  const raw = await fs.readFile(filePath);
  let data: Buffer;
  try { data = await gunzipAsync(raw); }
  catch { data = raw; }
  return { path: filePath, data: data.toString("utf8") };
};

const deliverPendingProject = async () => {
  if (!mainWindow || !pendingProjectPath) return;
  const filePath = pendingProjectPath;
  pendingProjectPath = null;
  try { mainWindow.webContents.send("project:open-file", await readProjectFile(filePath)); }
  catch (error) { dialog.showErrorBox("프로젝트 열기 실패", error instanceof Error ? error.message : "프로젝트를 읽을 수 없습니다."); }
};

const installMenu = () => {
  const template: MenuItemConstructorOptions[] = [
    { label: "파일", submenu: [
      { label: "이미지 열기", accelerator: "CmdOrCtrl+O", click: () => send("open") },
      { label: "이미지를 레이어로 추가", accelerator: "CmdOrCtrl+Shift+O", click: () => send("importLayer") },
      { type: "separator" },
      { label: "프로젝트 열기", accelerator: "CmdOrCtrl+Alt+O", click: () => send("openProject") },
      { label: "프로젝트 저장", accelerator: "CmdOrCtrl+S", click: () => send("saveProject") },
      { label: "프로젝트를 다른 이름으로 저장", accelerator: "CmdOrCtrl+Shift+S", click: () => send("saveProjectAs") },
      { type: "separator" },
      { label: "내보내기", accelerator: "CmdOrCtrl+E", click: () => send("export") },
      { type: "separator" },
      { role: "quit", label: "종료" },
    ]},
    { label: "편집", submenu: [
      { label: "실행 취소", accelerator: "CmdOrCtrl+Z", click: () => send("undo") },
      { label: "다시 실행", accelerator: "CmdOrCtrl+Shift+Z", click: () => send("redo") },
      { type: "separator" },
      { label: "원본 설정으로 초기화", click: () => send("reset") },
    ]},
    { label: "보기", submenu: [
      { label: "확대", accelerator: "CmdOrCtrl+Plus", click: () => send("zoomIn") },
      { label: "축소", accelerator: "CmdOrCtrl+-", click: () => send("zoomOut") },
      { label: "화면에 맞추기", accelerator: "CmdOrCtrl+0", click: () => send("fit") },
      { type: "separator" },
      { role: "togglefullscreen", label: "전체 화면" },
      { role: "toggleDevTools", label: "개발자 도구" },
    ]},
    { label: "도움말", submenu: [
      { label: "HINANA STUDIO PHOTO 정보", click: () => send("about") },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createWindow = () => {
  const appIcon = app.isPackaged
    ? path.join(process.resourcesPath, "photoicon.png")
    : path.join(app.getAppPath(), "photoicon.png");
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1050,
    minHeight: 680,
    backgroundColor: "#0d0f13",
    title: "HINANA STUDIO PHOTO",
    icon: appIcon,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay: process.platform === "darwin" ? undefined : { color: "#0d0f13", symbolColor: "#a9adb7", height: 58 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (app.isPackaged) void mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  else void mainWindow.loadURL("http://localhost:5173");
  mainWindow.on("closed", () => { mainWindow = null; });
};

ipcMain.handle("image:select", async () => {
  const result = await dialog.showOpenDialog({
    title: "이미지 열기",
    properties: ["openFile"],
    filters: [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "webp", "bmp", "gif"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const buffer = await fs.readFile(filePath);
  return { name: path.basename(filePath), data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
});

ipcMain.on("renderer:ready", () => { void deliverPendingProject(); });

ipcMain.handle("project:new", () => {
  currentProjectPath = null;
  return true;
});

ipcMain.handle("project:save", async (_event, data: string, saveAs = false) => {
  if (!currentProjectPath || saveAs) {
    const result = await dialog.showSaveDialog({
      title: saveAs ? "프로젝트를 다른 이름으로 저장" : "프로젝트 저장",
      defaultPath: currentProjectPath || "새 프로젝트.hinanaphoto",
      filters: [{ name: "HINANA STUDIO PHOTO 프로젝트", extensions: ["hinanaphoto"] }],
    });
    if (result.canceled || !result.filePath) return null;
    currentProjectPath = /\.hinanaphoto$/i.test(result.filePath) ? result.filePath : `${result.filePath}.hinanaphoto`;
  }
  const compressed = await gzipAsync(Buffer.from(data, "utf8"), { level: 9 });
  await fs.writeFile(currentProjectPath, compressed);
  return currentProjectPath;
});

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "HINANA STUDIO PHOTO 프로젝트 열기",
    properties: ["openFile"],
    filters: [{ name: "HINANA STUDIO PHOTO 프로젝트", extensions: ["hinanaphoto"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return readProjectFile(result.filePaths[0]);
});

ipcMain.handle("image:export", async (_event, raw: ArrayBuffer, suggestedName: string, format: "png" | "jpeg") => {
  const extension = format === "jpeg" ? "jpg" : "png";
  const result = await dialog.showSaveDialog({
    title: "이미지 내보내기",
    defaultPath: suggestedName.replace(/\.[^.]+$/, "") + "." + extension,
    filters: [{ name: format === "jpeg" ? "JPEG 이미지" : "PNG 이미지", extensions: [extension] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, Buffer.from(raw));
  return result.filePath;
});

ipcMain.handle("external:open", async (_event, rawUrl: string) => {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("지원하지 않는 링크입니다.");
  await shell.openExternal(url.toString());
  return true;
});

app.whenReady().then(() => {
  installMenu();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("open-file", (event, filePath) => {
  if (!/\.hinanaphoto$/i.test(filePath)) return;
  event.preventDefault();
  pendingProjectPath = filePath;
  if (mainWindow) void deliverPendingProject();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
