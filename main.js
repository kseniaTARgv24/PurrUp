const { app, BrowserWindow } = require("electron");
const path = require("path");
const { ipcMain } = require("electron");
const backupEngine = require("./BackUp_engine.js");

let windows = {};
let currentTaskDraft ={
    taskId: null,
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

function clearDraft() {
    currentTaskDraft = {
        taskName: "",
        dir1: "",
        dir2: "",
        delete_file_method: "recycle",
        versioning_folder: "",
        sync_mode: "two-way",
        filter_settings: {},
        schedule_settings: {}
    };
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

ipcMain.handle("remove-task-db", (event, taskName) => {
    return backupEngine.removeTaskFromDB(taskName);
});

ipcMain.handle("update-task-draft", (event, partialData) => {
    currentTaskDraft = {
        ... currentTaskDraft,
        ... partialData
    };
    console.log(JSON.stringify(currentTaskDraft, null, 2));
    return currentTaskDraft;
})

ipcMain.handle("save-task", async () => {
    await backupEngine.save_updateTaskInDB(
        currentTaskDraft.taskName,
        currentTaskDraft.dir1,
        currentTaskDraft.dir2,
        currentTaskDraft.delete_file_method,
        currentTaskDraft.versioning_folder,
        currentTaskDraft.sync_mode,
        currentTaskDraft.filter_settings,
        currentTaskDraft.schedule_settings
    );

    clearDraft();

    return true;
});

ipcMain.handle("open-task-settings", (event, windowName, taskId) => {
    currentTaskDraft.taskId = taskId;
    //
    // допиши сюда присваивание драфту значений по функциям, которые я дам ниже

    if (windows[windowName]) {
        windows[windowName].show();
        windows[windowName].focus();
    }else
    {
        createWindow(windowName, `${windowName}.html`);
        windows[windowName].show();
        windows[windowName].focus();}
})