const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    openWindow: (name) => ipcRenderer.send("open-window", name)
});