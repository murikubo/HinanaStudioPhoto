import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hinanaPhoto", {
  platform: process.platform,
  selectImage: () => ipcRenderer.invoke("image:select"),
  newProject: () => ipcRenderer.invoke("project:new"),
  adoptProject: (filePath: string) => ipcRenderer.invoke("project:adopt", filePath),
  saveProject: (data: string, saveAs = false) => ipcRenderer.invoke("project:save", data, saveAs),
  openProject: () => ipcRenderer.invoke("project:open"),
  onProjectFile: (callback: (project: { path: string; data: string }) => void) => {
    const listener = (_event: unknown, project: { path: string; data: string }) => callback(project);
    ipcRenderer.on("project:open-file", listener);
    return () => ipcRenderer.removeListener("project:open-file", listener);
  },
  rendererReady: () => ipcRenderer.send("renderer:ready"),
  exportImage: (data: ArrayBuffer, name: string, format: "png" | "jpeg") =>
    ipcRenderer.invoke("image:export", data, name, format),
  openExternal: (url: string) => ipcRenderer.invoke("external:open", url),
  onMenuAction: (callback: (action: string) => void) => {
    const listener = (_event: unknown, action: string) => callback(action);
    ipcRenderer.on("menu:action", listener);
    return () => ipcRenderer.removeListener("menu:action", listener);
  },
});
