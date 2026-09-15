/// <reference types="vite/client" />

interface Window {
  hinanaPhoto?: {
    platform: string;
    selectImage: () => Promise<{ name: string; data: ArrayBuffer } | null>;
    newProject: () => Promise<boolean>;
    adoptProject: (filePath: string) => Promise<void>;
    saveProject: (data: string, saveAs?: boolean) => Promise<string | null>;
    openProject: () => Promise<{ path: string; data: string } | null>;
    onProjectFile: (callback: (project: { path: string; data: string }) => void) => () => void;
    rendererReady: () => void;
    exportImage: (data: ArrayBuffer, name: string, format: "png" | "jpeg") => Promise<string | null>;
    openExternal: (url: string) => Promise<boolean>;
    onMenuAction: (callback: (action: string) => void) => () => void;
  };
}
