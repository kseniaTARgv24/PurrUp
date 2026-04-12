const { app, BrowserWindow } = require("electron");
const path = require("path");
const { ipcMain } = require("electron");
const BackupEngine = require("./BackUp_engine");
const fs = require("fs/promises");

let windows = {};
let currentTaskDraft ={
    taskId: null,
    taskName: "",
    dir1: "",
    dir2: "",
    delete_file_method: "",
    versioning_folder: "",
    sync_mode: "",
    filter_settings: {},
    schedule_settings: {}
}
const TaskListPath = path.join(process.cwd(), "data", "tasks_list.json");

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

function setDefaultTaskDraft() {
    return {
        taskId: null,
        taskName: "",
        dir1: "",
        dir2: "",
        sync_mode: "Two way",
        delete_file_method: "Recycle bin",

        filter_settings: {
            include: "*",
            exclude: [
                "\\System Volume Information\\",
                "\\$Recycle.Bin\\",
                "\\RECYCLE?\\",
                "\\Recovery\\",
                "*thumbs.db",
                "*-settings.json"
            ],
            size_min: 0,
            size_max: 10000000000
        },

        schedule_settings: {
            enabled: false,
            run_every_value: 1,
            run_every_unit: "hours",
            start_time: "",
            ignore_span_enabled: false,
            ignore_from: "",
            ignore_to: ""
        },

        versioning_folder: ""
    };
}

function openTaskEditorWindow() {
    const windowName = "taskEditor";

    if (windows[windowName]) {

        windows[windowName].webContents.send(
            "refresh-draft-ui",
            currentTaskDraft
        );

        windows[windowName].show();
        windows[windowName].focus();

    } else {

        createWindow(windowName, `${windowName}.html`);

        windows[windowName].webContents.once("did-finish-load", () => {
            windows[windowName].webContents.send(
                "refresh-draft-ui",
                currentTaskDraft
            );
        });

        windows[windowName].show();
        windows[windowName].focus();
    }
}

async function toggleSchedule(enabled, taskId) {
    const DBFile = await BackupEngine.get_bd_file_by_id(taskId);
    if (!DBFile) {
        console.error("DBFile not found for task:", taskId);
        return null;
    }

    const taskName = await BackupEngine.get_task_name_by_id(taskId);
    const folders = await BackupEngine.get_folders_fromDB(DBFile);

    const delete_file_method = await BackupEngine.get_delete_file_method_fromDB(DBFile);
    const versioning_folder = await BackupEngine.get_versioning_folder_fromDB(DBFile);
    const sync_mode = await BackupEngine.get_sync_mode_fromDB(DBFile);
    const filter_settings = await BackupEngine.get_filter_settings_fromDB(DBFile);
    const schedule_settings = await BackupEngine.get_schedule_settings_fromDB(DBFile);

    const updatedSchedule = {
        ...schedule_settings,
        enabled
    };

    console.log("toggleSchedule now: "+ enabled);

    return await BackupEngine.save_updateTaskInDB(
        taskId,
        taskName,
        folders?.[0] || "",
        folders?.[1] || "",
        delete_file_method,
        versioning_folder,
        sync_mode,
        filter_settings,
        updatedSchedule
    );
}

async function getTaskList() {
    try {
        const raw = await fs.readFile(TaskListPath, "utf8");
        const parsed = JSON.parse(raw);

        return parsed.tasks || [];
    } catch (err) {
        console.error("Failed to load task list:", err);
        return [];
    }
}

function startSyncChecker(){
    setInterval(async () => {
        const taskList = await getTaskList();

        for (const task of taskList) {

            const DBFile = task.configFilePath;

            const scheduleSettings =
                await BackupEngine.get_schedule_settings_fromDB(DBFile);

            if (!scheduleSettings?.enabled) continue;

            const last_sync =
                await BackupEngine.get_last_sync_fromDB(DBFile);

            const allowed = await BackupEngine.isSyncAllowed(
                scheduleSettings,
                last_sync,
                DBFile
            );

            if (allowed) {
                console.log("SYNC NOW:", task.id);

                const folders =
                    await BackupEngine.get_folders_fromDB(DBFile);

                await BackupEngine.sync_files(
                    folders[0],
                    folders[1],
                    DBFile
                );
            }
        }
    }, 30 * 1000); // каждые 30 секунд
}

app.whenReady().then(() => {
    createAllWindows();
    startSyncChecker();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.on("open-window", (event, name) => {
    if (windows[name]) {
        windows[name].webContents.send("refresh-draft-ui")
        windows[name].show();
        windows[name].focus();
    }else {
        createWindow(name, `${name}.html`);
        windows[name].webContents.once("did-finish-load", () => {
            windows[name].webContents.send("refresh-draft-ui");
        });
        windows[name].show();
        windows[name].focus();}
});

ipcMain.on("hide-window", (event, name) => {
    if (windows[name]) {
        windows[name].hide();
    }else {
        createWindow(name, `${name}.html`);
        windows[name].hide();}
});

ipcMain.handle("compare-dirs", (event, dir1, dir2) => {
    return BackupEngine.compareDirs(dir1, dir2); // возвращаем результат в renderer
});

ipcMain.handle("scan-folder", (event, dir, file_list={}, root) => {
    return BackupEngine.scan_folder(dir, file_list, root);
})

ipcMain.handle("remove-task-db", (event, taskName) => {
    return BackupEngine.removeTaskFromDB(taskName);
});

ipcMain.handle("get-current-task-draft", async () => {
    return currentTaskDraft;
});

ipcMain.handle("get-default-task-draft", async () => {
    return setDefaultTaskDraft();
});

ipcMain.handle("update-task-draft", (event, partialData) => {
    currentTaskDraft = {
        ... currentTaskDraft,
        ... partialData
    };
    console.log(JSON.stringify(currentTaskDraft, null, 2));
    return currentTaskDraft;
});

ipcMain.handle("save-task", async () => {
    await BackupEngine.save_updateTaskInDB(
        currentTaskDraft.taskId,
        currentTaskDraft.taskName,
        currentTaskDraft.dir1,
        currentTaskDraft.dir2,
        currentTaskDraft.delete_file_method,
        currentTaskDraft.versioning_folder,
        currentTaskDraft.sync_mode,
        currentTaskDraft.filter_settings,
        currentTaskDraft.schedule_settings
    );

    currentTaskDraft = setDefaultTaskDraft();

    if (windows["widget"]) {
        windows["widget"].webContents.send("refresh-task-list");
    }

    return currentTaskDraft;
});

ipcMain.handle("open-task-settings",async (event, taskId) => {

    currentTaskDraft.taskId = taskId;

    const DBFile = await BackupEngine.get_bd_file_by_id(taskId)
    if (!DBFile) {
        console.error("DBFile not found for task:", taskId);
        return null;
    }
    console.log("OPEN TASK ID:", taskId);
    console.log("DB FILE:", DBFile);
    currentTaskDraft.sync_mode = await BackupEngine.get_sync_mode_fromDB(DBFile);
    currentTaskDraft.delete_file_method = await BackupEngine.get_delete_file_method_fromDB(DBFile);
    currentTaskDraft.filter_settings = await BackupEngine.get_filter_settings_fromDB(DBFile);
    currentTaskDraft.schedule_settings = await BackupEngine.get_schedule_settings_fromDB(DBFile);
    currentTaskDraft.versioning_folder = await BackupEngine.get_versioning_folder_fromDB(DBFile);

    const folders = await BackupEngine.get_folders_fromDB(DBFile);
    currentTaskDraft.dir1 = folders?.[0] || "";
    currentTaskDraft.dir2 = folders?.[1] || "";

    currentTaskDraft.taskName = await BackupEngine.get_task_name_by_id(taskId);

    console.log("Draft loaded:", currentTaskDraft);

    openTaskEditorWindow()

    return currentTaskDraft;
});

ipcMain.handle("start-new-task", async (event) => {
    currentTaskDraft = setDefaultTaskDraft();
    openTaskEditorWindow();
    return currentTaskDraft;
})

ipcMain.handle("is-schedule-enabled", async (event, taskId) => {
    const dbFile = await BackupEngine.get_bd_file_by_id(taskId);
    const scheduleSettings = await BackupEngine.get_schedule_settings_fromDB(dbFile);
    return scheduleSettings.enabled;
})

ipcMain.handle("toggle-schedule", async (event, enabled, taskId) => {
    await toggleSchedule(enabled, taskId);

    if (windows["Comp_Filter_Synch_Sched"]) {
        windows["Comp_Filter_Synch_Sched"].webContents.send("refresh-draft-ui");
    }

    return true;
});

ipcMain.handle("run-task-now", async (event, taskId) => {
    const DBFile = await BackupEngine.get_bd_file_by_id(taskId);
    if (!DBFile) {
        console.error("DBFile not found for task:", taskId);
        return null;
    }
    const folders = await BackupEngine.get_folders_fromDB(DBFile);
    await BackupEngine.sync_files(folders[0], folders[1], DBFile);
    console.log("run-task-now started:", taskId);
})

ipcMain.handle("get-task-list", async () => {
    return await getTaskList();
});