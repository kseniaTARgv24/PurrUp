const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    compareDirs: (dir1, dir2) => ipcRenderer.invoke("compare-dirs", dir1, dir2),
    scan_folder: (dir, file_list={}, root) => ipcRenderer.invoke("scan-folder", dir, file_list, root),
    openWindow: (name) => ipcRenderer.send("open-window", name)
});