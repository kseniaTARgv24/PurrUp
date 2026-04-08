const { app, BrowserWindow } = require("electron");
const path = require("path");
const { ipcMain } = require("electron");
const backupEngine = require("./BackUp_engine.js");

let windows = {};
let currentTaskDraft ={
    taskName: "",
    source: "",
    target: "",
    delete_file_method: "",
    versioning_folder: "",
    sync_mode: "",
    filter_settings: {},
    schedule_settings: {}
}

function createWindow(name, file, options = {}) {
    windows[name] = new BrowserWindow({
        width: 900,
        height: 600,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"), //че за хуйня
            contextIsolation: true,
        },
        ...options
    });

    windows[name].on('close', (e) => {
        e.preventDefault();
        windows[name].hide();
    });

    windows[name].loadFile(path.join(__dirname, "renderer", file));
    windows[name].setMenu(null);

    // windows[name].webContents.openDevTools();

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
    createWindow("Comp_Filter_Synch_Sched", "Comp_Filter_Synch_Sched.html",{
        show:false,
        frame: false,
        skipTaskbar: true,
        resizable: true,
        movable: true,
        focusable: true,
    })

}

app.whenReady().then(createAllWindows);

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

ipcMain.on("close-window", (event, name) => {
    if (windows[name]) {
        windows[name].close();
    }else {
        createWindow(name, `${name}.html`);
        windows[name].close();}
});

ipcMain.handle("compare-dirs", (event, dir1, dir2) => {
    return backupEngine.compareDirs(dir1, dir2); // возвращаем результат в renderer
});

ipcMain.handle("scan-folder", (event, dir, file_list={}, root) => {
    return backupEngine.scan_folder(dir, file_list, root);
})

ipcMain.handle("save-update-task-db", (event, task) => {
    return backupEngine.save_updateTaskInDB(task);
});

ipcMain.handle("remove-task-db", (event, taskName) => {
    return backupEngine.removeTaskFromDB(taskName);
});

ipcMain.handle("get-sync-mode-db", (event, taskName) => {
    return backupEngine.get_sync_mode_fromDB(taskName);
});

ipcMain.handle("get-delete-method-db", (event, taskName) => {
    return backupEngine.get_delete_file_method_fromDB(taskName);
});

ipcMain.handle("get-filter-settings-db", (event, taskName) => {
    return backupEngine.get_filter_settings_fromDB(taskName);
});

ipcMain.handle("get-schedule-settings-db", (event, taskName) => {
    return backupEngine.get_schedule_settings_fromDB(taskName);
});

ipcMain.handle("get-versioning-folder-db", (event, taskName) => {
    return backupEngine.get_versioning_folder_fromDB(taskName);
});

ipcMain.handle("update-task-draft", (event, partialData) => {
    currentTaskDraft = {
        ... currentTaskDraft,
        ... partialData
    };
    return currentTaskDraft;
})

ipcMain.handle("save-current-task", () => {
    return backupEngine.save_updateTaskInDB(currentTaskDraft);
    //+add to list
});