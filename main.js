const { app, BrowserWindow } = require("electron");
const path = require("path"); //для нахождения файлов
const { ipcMain } = require("electron");
const { previewBackup, runBackup } = require("./backupEngine");

let windows = {};

function createWindow(name, file, options = {}) {
    windows[name] = new BrowserWindow({
        width: 900,
        height: 600,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true
        },
        ...options
    });

    windows[name].loadFile(path.join(__dirname, "renderer", file));
    windows[name].setMenu(null);
}

function createAllWindows() {
    createWindow("widget", "widget.html",{
        width: 300,
        height: 500,
        closable: true,
        focusable: false,
        fullscreenable: false,
        maximizable: false,
        minimizable: false,
        movable: true,
        resizable: false,
        skipTaskbar: true,
        show:true,
    })

    createWindow("logs", "logs.html")
    createWindow("taskEditor", "taskEditor.html",{
        show:true,
    })
    createWindow("Comp_Filter_Synch_Sched", "Comp_Filter_Synch_Sched.html")

}

/////////////////////////////////////////
ipcMain.handle("backup:preview", async (_event, config) => previewBackup(config));
ipcMain.handle("backup:run", async (_event, config) => runBackup(config));

app.whenReady().then(createAllWindows);


//Quit the app when all windows are closed:
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.on("open-window", (event, name) => {
    if (windows[name]) {
        windows[name].show();
        windows[name].focus();
    }
});