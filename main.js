const { app, BrowserWindow } = require("electron");
const path = require("path"); //для нахождения файлов

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

    windows[name].show();
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
        skipTaskbar: true
    })

    // createWindow("logs", "logs.html")
    // createWindow("taskEditor", "taskEditor.html")
    // createWindow("comparison", "comparison.html")
    // createWindow("schedule", "schedule.html")
    // createWindow("sync", "sync.html")
    // createWindow("filter", "filter.html")
}

/////////////////////////////////////////

app.whenReady().then(createAllWindows);

//Quit the app when all windows are closed:
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});