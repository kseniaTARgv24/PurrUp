const { app, BrowserWindow } = require("electron");
const path = require("path"); //для нахождения файлов
const { ipcMain } = require("electron");

let windows = {};

function createWindow(name, file, options = {}) {
    windows[name] = new BrowserWindow({
        width: 900,
        height: 600,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"), //че за хуйня
            contextIsolation: true
        },
        ...options
    });

    windows[name].on('close', (e) => {
        e.preventDefault();
        windows[name].hide();
    });

    windows[name].loadFile(path.join(__dirname, "renderer", file));
    windows[name].setMenu(null);
}

function createAllWindows() {
    createWindow("widget", "widget.html",{
        width: 330,
        height: 550,
        resizable: false,
        movable: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: false,
        alwaysOnBottom: true,
        frame: false,
        show: true,
        focusable: true,
    })

    createWindow("logs", "logs.html",{show:false,})
    createWindow("taskEditor", "taskEditor.html",{
        show:false,
    })
    createWindow("Comp_Filter_Synch_Sched", "Comp_Filter_Synch_Sched.html",{show:false,})

}

/////////////////////////////////////////
app.whenReady().then(createAllWindows);

//Quit the app when all windows are closed:
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.on("open-window", (event, name) => {
    if (windows[name]) {
        windows[name].show();
        windows[name].focus();
    }else {
        createWindow(name, `${name}.html`);
        windows[name].show();
        windows[name].focus();}
});


