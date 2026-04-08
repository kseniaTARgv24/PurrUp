const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
    compareDirs: (dir1, dir2) => ipcRenderer.invoke("compare-dirs", dir1, dir2),
    scan_folder: (dir, file_list={}, root) => ipcRenderer.invoke("scan-folder", dir, file_list, root),
    sync_files: (dir1, dir2, compare_result_list, sync_mode, delete_file_method) => ipcRenderer.invoke("sync-files", dir1, dir2, compare_result_list, sync_mode, delete_file_method),
    save_updateTaskInDB: (task) =>ipcRenderer.invoke("save-update-task-db", task),
    removeTaskFromDB: (taskName) =>ipcRenderer.invoke("remove-task-db", taskName),
    get_sync_mode_fromDB: (taskName) =>ipcRenderer.invoke("get-sync-mode-db", taskName),
    get_delete_file_method_fromDB: (taskName) =>ipcRenderer.invoke("get-delete-method-db", taskName),
    get_filter_settings_fromDB: (taskName) =>ipcRenderer.invoke("get-filter-settings-db", taskName),
    get_schedule_settings_fromDB: (taskName) =>ipcRenderer.invoke("get-schedule-settings-db", taskName),
    get_versioning_folder_fromDB: (taskName) =>ipcRenderer.invoke("get-versioning-folder-db", taskName),
    openWindow: (name) => ipcRenderer.send("open-window", name),
    closeWindow: (name) => ipcRenderer.send("close-window", name),
    updateTaskDraft: (data) => ipcRenderer.invoke("update-task-draft", data),
});