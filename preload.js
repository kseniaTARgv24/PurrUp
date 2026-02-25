const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("purrupBackup", {
    preview: (config) => ipcRenderer.invoke("backup:preview", config),
    run: (config) => ipcRenderer.invoke("backup:run", config)
});
