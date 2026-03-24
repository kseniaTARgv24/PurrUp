const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    compareDirs: (dir1, dir2) => ipcRenderer.invoke("compare-dirs", dir1, dir2),
    scan_folder: (dir, file_list={}, root) => ipcRenderer.invoke("scan-folder", dir, file_list, root),
    sync_files: (dir1, dir2, compare_result_list, sync_mode, delete_file_method) => ipcRenderer.invoke("sync-files", dir1, dir2, compare_result_list, sync_mode, delete_file_method),
    openWindow: (name) => ipcRenderer.send("open-window", name)
});