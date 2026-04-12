const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { join, resolve, basename } = path;
const { v4: uuidv4 } = require("uuid");
const {homedir} = require("node:os");

////////////////// Main funcs ///////////////

//get file list from folders in a form {file_relative_path: size, date}
function scan_folder(dir, file_list={}, root) {

        if (!root) root = dir;

        if (!fs.existsSync(dir)) {
            console.log("Directory doesnt exists!");
        }
        else{
            fs.readdirSync(dir).forEach(file => {
                const fullPath = path.join(dir, file);
                const stats = fs.statSync(fullPath);

                if (stats.isDirectory()){
                    scan_folder(fullPath, file_list, root);
                    return;
                }

                const fileName = path.relative(root, fullPath);
                const fileDate = stats.mtime;
                const fileSize = stats.size;

                file_list[fileName]={
                    mtime: fileDate,
                    size: fileSize,
                }
            })


            return file_list;
        }
}

//compare files and get result in a form |is in dir1 -- is in dir2 -- (if both TRUE) status (same or not)|
function compareDirs(dir1, dir2) {
    let dir1_file_list = scan_folder(dir1); //{file_relative_path: size, date} (scan_folder result reference)
    let dir2_file_list = scan_folder(dir2);

    let allFiles = new Set([
        ...Object.keys(dir1_file_list),
        ...Object.keys(dir2_file_list)
    ])

    let compare_result = [] //file -- is in dir1 -- is in dir2 -- (if both TRUE) status (same or not)

    for (let file of allFiles){

        let f1 = dir1_file_list[file];
        let f2 = dir2_file_list[file];

        let status;

        if (f1 && f2){
            if (f1.size === f2.size && f1.mtime.getTime() === f2.mtime.getTime()){
                status = "in both dir's: same";
            } else { status = "in both dir's: different"; }
        } else if (f1){
            status = "only in dir1";
        } else if (f2){
            status = "only in dir2";
        } else if (f1){
            console.error("no files???")
        }

        compare_result.push({
            file,
            status
        });

        //найти файлы которые lData.size === rData.size &&
        //                 lData.mtime.getTime() === rData.mtime.getTime() &&
        //                 path.basename(leftFile.file) === path.basename(rightFile.file)
        //   и изменить их статус на "moved: from ? to ?"

    }
    return compare_result;
}

//sync files (for testing, later in DB)
const DELETE_OVERWRITE_METHODS = ["Recycle bin", "Permanent delete", "Versioning"]
const DELETE_METHOD_MAP = {
    "recycle": "Recycle bin",
    "permanent": "Permanent delete",
    "versioning": "Versioning"
};
const DELETE_METHOD_REVERSE_MAP = {
    "Recycle bin": "recycle",
    "Permanent delete": "permanent",
    "Versioning": "versioning"
};
const SYNC_MODES = ['Two way', 'Mirror', 'Update']
const SYNC_MODE_MAP = {
    "two-way": "Two way",
    "mirror": "Mirror",
    "update": "Update"
};
const REVERSE_SYNC_MODE_MAP = {
    "Two way": "two-way",
    "Mirror": "mirror",
    "Update": "update"
};

async function sync_files(dir1, dir2, DBFile){

    // folders data and info:
    const folder_1_list = scan_folder(dir1); //{file_relative_path: size, date}
    const folder_2_list = scan_folder(dir2);
    let compare_result_list = compareDirs(dir1, dir2)  //|is in dir1 -- is in dir2 -- (if both TRUE) status (same or not)|  { file: 'b.txt', status: "in both dir's: same" }

    // user's sync settings
    const raw_sync_mode = await get_sync_mode_fromDB(DBFile);
    const sync_mode = SYNC_MODE_MAP[raw_sync_mode] || "Update";
    const raw_delete_file_method = await get_delete_file_method_fromDB(DBFile)
    const delete_file_method = DELETE_METHOD_MAP[raw_delete_file_method];
    const filterSettings = await get_filter_settings_fromDB(DBFile); // { include, exclude, size_min, size_max } --> {include: [ '*.txt', '*.docx' ], exclude: [ '*.tmp', '*.log' ], size_min: 0, size_max: 10000000 }
    // console.log("include "+ filterSettings.include);
    console.log("syncmode "+ sync_mode);
    console.log("delete_file_method "+delete_file_method);

    console.log("before: ", compareDirs(dir1, dir2));

    //// MOVED FILES ////
    const moved = detectMoved(folder_1_list, folder_2_list, compare_result_list)

    //// FILTERING ////
    let included_files = []

    for (let file of compare_result_list){

        //INCLUDE
        if (filterSettings.include.length > 0 && !filterSettings.include.includes("*")){
            // look for file 's that end with text after "*" (like in "*.txt")
            const isIncluded = filterSettings.include.some(pattern =>
                matchPattern(file.file, pattern)
            );
            if (!isIncluded){ //not included
                continue;
            }
        }
        //EXCLUDE
        if (filterSettings.exclude.length > 0){
            const isExcluded = filterSettings.exclude.some(pattern =>
                file.file.endsWith(pattern.replace("*", ""))
            );
            if (isExcluded){
                continue;
            }
        }
        //SIZE
        const size1 = folder_1_list[file] ? folder_1_list[file].size : 0;
        const size2 = folder_2_list[file] ? folder_2_list[file].size : 0;
        if ((filterSettings.size_min && (size1 < filterSettings.size_min || size2 < filterSettings.size_min)) ||
            (filterSettings.size_max && (size1 > filterSettings.size_max || size2 > filterSettings.size_max))) {
            continue;
        }
        included_files.push(file)
    }
    compare_result_list = included_files

    ///// MAIN SYNC PROC ////
    switch(sync_mode){
        case "Two way":
            for (let file of compare_result_list){
                if (file.status === "only in dir1"){
                    // copy file to dir2 // for example: file 'New folder\\c.txt'
                    // проверить, что есть такой путь во второй папке - New folder. Если нет- создать
                    const src = path.join(dir_1, file.file);
                    const dest = path.join(dir_2, file.file);
                    await fsp.mkdir(path.dirname(dest), { recursive: true });
                    await fsp.copyFile(src, dest);
                }
                else if (file.status === "only in dir2"){
                    // copy file to dir1
                    const src = path.join(dir_2, file.file);
                    const dest = path.join(dir_1, file.file);
                    await fsp.mkdir(path.dirname(dest), { recursive: true });
                    await fsp.copyFile(`${dir2}/${file.file}`, `${dir1}/${file.file}`);
                }
                else if (file.status === "in both dir's: same"){
                    //do nothing
                }
                else if (file.status === "in both dir's: different"){
                    //get two separate lists of files
                    //find this file my name/relative path in these lists
                    //compare by date (mtime)
                    //the oldest --> delete from folder, the newest --> copy to other folder

                    const f1 = folder_1_list[file.file];
                    const f2 = folder_2_list[file.file];

                    if (f1.mtime > f2.mtime){
                        // 1 is newer
                        // delete with switch
                        switch(delete_file_method){
                            case "Recycle bin": {
                                //move to trash
                                const src = path.join(dir2, file.file);
                                const dest = path.join(get_trash_folder(), file.file);

                                await fsp.mkdir(path.dirname(dest), {recursive: true});

                                await fsp.copyFile(src, dest);

                                await fsp.unlink(src);
                                break;
                            }
                            case "Permanent delete": {
                                // making sure the older file is deleted permanently
                                const src = path.join(dir2, file.file);
                                await fsp.unlink(src);
                                break;
                            }
                            case "Versioning": {
                                const src = path.join(dir2, file.file);

                                const dest = await getUniquePath(get_versioning_folder_fromDB(), file.file);

                                await fsp.mkdir(path.dirname(dest), { recursive: true });

                                await fsp.copyFile(src, dest);
                                break;
                            }
                        }
                        // then copy
                        const src = path.join(dir1, file.file);
                        const dest = path.join(dir2, file.file);

                        await fsp.mkdir(path.dirname(dest), { recursive: true });

                        await fsp.copyFile(src, dest);
                    }
                    else if (f1.mtime < f2.mtime){
                        // 2 is newer
                        // delete with switch
                        switch(delete_file_method){
                            case "Recycle bin": {
                                const src = path.join(dir1, file.file);
                                const dest = path.join(get_trash_folder(), file.file);

                                await fsp.mkdir(path.dirname(dest), { recursive: true });

                                await fsp.copyFile(src, dest);

                                break;
                            }

                            case "Permanent delete": {
                                const src = path.join(dir1, file.file);

                                await fsp.unlink(src);

                                break;
                            }

                            case "Versioning": {
                                const src = path.join(dir1, file.file);

                                const dest = await getUniquePath(get_versioning_folder_fromDB(), file.file);

                                await fsp.mkdir(path.dirname(dest), { recursive: true });

                                await fsp.copyFile(src, dest);

                                break;
                            }
                        }
                        // then copy
                        const src = path.join(dir2, file.file);
                        const dest = path.join(dir1, file.file);

                        await fsp.mkdir(path.dirname(dest), { recursive: true });

                        await fsp.copyFile(src, dest);
                    }
                    else{console.error("error when comparing time...")}

                    console.log("in both dir's: different method!")

                }
                else if (file.status === "Left: moved" || file.status === "Right: to move"){}
                else {console.error("wrong file status: ", file.status);}
            }
            break;
        case "Mirror":
            for (let file of compare_result_list){
                if (file.status === "only in dir1"){
                    const src = path.join(dir1, file.file);
                    const dest = path.join(dir2, file.file);

                    await fsp.mkdir(path.dirname(dest), { recursive: true });

                    await fsp.copyFile(src, dest);
                }
                else if (file.status === "only in dir2"){
                    // delete it
                    switch (delete_file_method) {

                        case "Recycle bin": {
                            const src = path.join(dir2, file.file);
                            const dest = path.join(get_trash_folder(), file.file);

                            await fsp.mkdir(path.dirname(dest), { recursive: true });

                            await fsp.copyFile(src, dest);
                            await fsp.unlink(src);

                            break;
                        }

                        case "Permanent delete": {
                            const src = path.join(dir2, file.file);

                            await fsp.unlink(src);

                            break;
                        }

                        case "Versioning": {
                            const src = path.join(dir2, file.file);

                            const dest = await getUniquePath(
                                await get_versioning_folder_fromDB(DBFile),
                                file.file
                            );

                            await fsp.mkdir(path.dirname(dest), { recursive: true });

                            await fsp.copyFile(src, dest);
                            await fsp.unlink(src);

                            break;
                        }
                    }
                }

                else if (file.status === "in both dir's: same"){
                    // do nothing
                }
                else if (file.status === "in both dir's: different"){
                    // delete this file in dir2, copy the file from 1 to 2
                    switch(delete_file_method){
                        case "Recycle bin": {
                            const src = path.join(dir2, file.file);
                            const dest = path.join(get_trash_folder(), file.file);

                            await fsp.mkdir(path.dirname(dest), { recursive: true });

                            await fsp.copyFile(src, dest);
                            await fsp.unlink(src);

                            break;
                        }

                        case "Permanent delete": {
                            const src = path.join(dir2, file.file);

                            await fsp.unlink(src);

                            break;
                        }

                        case "Versioning": {
                            const src = path.join(dir2, file.file);

                            const dest = await getUniquePath(get_versioning_folder_fromDB(), file.file);

                            await fsp.mkdir(path.dirname(dest), { recursive: true });

                            await fsp.copyFile(src, dest);
                            await fsp.unlink(src);

                            break;
                        }
                    }

                    const src = path.join(dir1, file.file);
                    const dest = path.join(dir2, file.file);

                    await fsp.mkdir(path.dirname(dest), { recursive: true });

                    await fsp.copyFile(src, dest);
                }
                else if (file.status === "Left: moved" || file.status === "Right: to move"){}
                else {console.error("wrong file status: ", file.status);}
            }
            await moveFiles(moved, dir2)
            break;
        case "Update":
            for (let file of compare_result_list){
                if (file.status === "only in dir1"){
                    const src = path.join(dir1, file.file);
                    const dest = path.join(dir2, file.file);

                    await fsp.mkdir(path.dirname(dest), { recursive: true });

                    await fsp.copyFile(src, dest);
                }
                else if (file.status === "only in dir2"){
                    // do nothing
                }
                else if (file.status === "in both dir's: same"){
                    // do nothing
                }
                else if (file.status === "in both dir's: different"){
                    switch(delete_file_method){
                        case "Recycle bin": {
                            const src = path.join(dir2, file.file);
                            const dest = path.join(get_trash_folder(), file.file);

                            await fsp.mkdir(path.dirname(dest), { recursive: true });

                            await fsp.copyFile(src, dest);
                            await fsp.unlink(src);

                            break;
                        }

                        case "Permanent delete": {
                            const src = path.join(dir2, file.file);

                            await fsp.unlink(src);

                            break;
                        }

                        case "Versioning": {
                            const src = path.join(dir2, file.file);

                            const dest = await getUniquePath(get_versioning_folder_fromDB(), file.file);

                            await fsp.mkdir(path.dirname(dest), { recursive: true });

                            await fsp.copyFile(src, dest);
                            await fsp.unlink(src);

                            break;
                        }
                    }
                    const src = path.join(dir1, file.file);
                    const dest = path.join(dir2, file.file);

                    await fsp.mkdir(path.dirname(dest), { recursive: true });

                    await fsp.copyFile(src, dest);
                }
                else if (file.status === "Left: moved" || file.status === "Right: to move"){}
                else {console.error("wrong file status: ", file.status);}
            }
            await moveFiles(moved, dir2)
            break;
    }

    console.log("after: ", compareDirs(dir1, dir2));

    return Date.now();
}

async function isSyncAllowed(scheduleSettings, last_sync, DBFile) {
    scheduleSettings = await get_schedule_settings_fromDB(DBFile);

    const newRunEvery =
        await interpret_run_every_time(scheduleSettings.run_every);

    let start_time =
        await interpret_delay_until_start(scheduleSettings.delay);


    const now = Date.now();

    if (now < start_time) {
        return last_sync;
    }

    if (!last_sync) {
        return true;
    }

        if (scheduleSettings.ignore_time_span) {

            const newTimeSpan =
                await interpret_ignore_timespan(
                    scheduleSettings.time_span
                );

            if (
                !(now >= newTimeSpan[0] &&
                    now <= newTimeSpan[1])
            ) {
                if (now < (last_sync + newRunEvery)) {
                    console.log("now is "+ now + ", start at "+ last_sync+newRunEvery);
                    return false;
                } else {
                    return true;
                }

            } else {
                console.log("forbitten timespan");
                return false;
            }

        } else {

            if (now < (last_sync + newRunEvery)) {
                console.log("now is "+ now + ", start at "+ last_sync+newRunEvery);
                return false;
            } else {
                return true;
            }

        }

}

async function saveTaskInTaskList(taskId, taskName, configFilePath) { //todo rename to saveUpdate...
    const TaskListPath = path.join(process.cwd(), "data", "tasks_list.json");

    let taskListData = { tasks: [] };
    if (fs.existsSync(TaskListPath)) {
        const raw = fs.readFileSync(TaskListPath, "utf-8");
        try {
            taskListData = JSON.parse(raw);
            if (!Array.isArray(taskListData.tasks)) taskListData.tasks = [];
        } catch {
            taskListData = { tasks: [] };
        }
    }

    const taskIndex = taskListData.tasks.findIndex(task => task.id === taskId);

    const newTask={
        id: taskId,
        name: taskName,
        configFilePath:configFilePath
    }
    console.log("taskIndex: ", taskIndex);

    if (taskIndex !== -1) { //so if exists --> rewrite
        taskListData.tasks[taskIndex]=newTask;
        fs.writeFileSync(TaskListPath, JSON.stringify(taskListData, null, 2));
        return false;

    } else {
        taskListData.tasks.push(newTask);
        fs.writeFileSync(TaskListPath, JSON.stringify(taskListData, null, 2));
        return true;
    }
}

async function save_updateTaskInDB(taskId, taskName, dir1, dir2, delete_file_method, versioning_folder, sync_mode, filter_settings, schedule_settings, last_sync_time){

    if (!taskId) taskId = uuidv4();

    const DB_FILE_NAME = `${taskId}-settings.json`;

    // Bind settings to the task's target folder
    const targetFolder = dir2;
    const dbFilePath = path.join(targetFolder, DB_FILE_NAME);

    // Normalize input paths
    const folders = [normalize(dir1), normalize(dir2)];
    const normVersioningFolder = versioning_folder ? normalize(versioning_folder) : null;
    // Prepare filters; always exclude the settings file from sync
    const include = (filter_settings && Array.isArray(filter_settings.include)) ? filter_settings.include : [];
    const exclude = (filter_settings && Array.isArray(filter_settings.exclude)) ? filter_settings.exclude : [];
    // const excludeRaw = (filter_settings && Array.isArray(filter_settings.exclude)) ? filter_settings.exclude : [];
    // const exclude = Array.from(new Set([...excludeRaw, DB_FILE_NAME]));

    const size_min = (filter_settings && typeof filter_settings.size_min === "number") ? filter_settings.size_min : 0;
    const size_max = (filter_settings && typeof filter_settings.size_max === "number") ? filter_settings.size_max : 0;

    const filters = { include, exclude, size_min, size_max };
    const schedule = schedule_settings ? { ...schedule_settings } : {};

    const last_sync = last_sync_time ? last_sync_time : null;


    const newConfig = {
        id: taskId,
        taskName,
        folders,
        delete_file_method: DELETE_METHOD_MAP[delete_file_method] || "Recycle bin",
        versioning_folder: normVersioningFolder,
        sync_mode: SYNC_MODE_MAP[sync_mode] || "Update",
        filters,
        schedule,
        last_sync
    };

    let finalConfig = newConfig;

    if (fs.existsSync(dbFilePath)) {
        try {
            const existingRaw = await fsp.readFile(dbFilePath, "utf8");
            const existing = JSON.parse(existingRaw);

            // Update existing config but keep unknown fields
            finalConfig = {
                ...existing,
                ...newConfig,
                filters: {
                    ...(existing.filters || {}),
                    ...newConfig.filters
                },
                schedule: {
                    ...(existing.schedule || {}),
                    ...newConfig.schedule
                },
                folders_meta: {
                    ...(existing.folders_meta || {}),
                    ...newConfig.folders_meta
                }
            };
        } catch (err) {
            // Invalid/corrupted JSON -> log and recreate
            console.error("Failed to read/parse existing task DB file, recreating it:", err);
        }
    }

    await fsp.writeFile(dbFilePath, JSON.stringify(finalConfig, null, 2), "utf8");

    await saveTaskInTaskList(taskId, taskName, normalize(dbFilePath));

    return dbFilePath;
}

async function removeTaskFromDB(dirOrDbFile){
    const dbFilePath = resolveTaskDbFilePath(dirOrDbFile);

    if (!fs.existsSync(dbFilePath)) {
        return false;
    }

    try {
        await fsp.unlink(dbFilePath);
        return true;
    } catch (err) {
        console.error(`Failed to remove task DB file (${dbFilePath}):`, err);
        throw err;
    }
}

//////////// Helper funcs ///////////////

// Get info from DB :

async function get_folders_fromDB(DBFile){
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    if (!fs.existsSync(dbFilePath)) {
        console.error(`Task DB file not found: ${dbFilePath}`);
        return [];
    }

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);

        if (!Array.isArray(config.folders)) {
            console.error("Invalid task DB format: 'folders' must be an array.");
            return [];
        }

        const folders = config.folders
            .filter(folder => typeof folder === "string" && folder.trim().length > 0)
            .map(normalize);

        return folders;
    } catch (err) {
        console.error(`Failed to read folders from task DB (${dbFilePath}):`, err);
        return [];
    }
}

async function get_sync_mode_fromDB(DBFile){
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    const fallbackMode = SYNC_MODES[2];

    if (!fs.existsSync(dbFilePath)) {
        console.error(`Task DB file not found: ${dbFilePath}`);
        return fallbackMode;
    }

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);
        const sync_mode = config.sync_mode;

        if (typeof sync_mode !== "string") {
            console.error("Invalid task DB format: 'sync_mode' must be a string.");
            return fallbackMode;
        }

        if (!SYNC_MODES.includes(sync_mode)) {
            console.error(`Invalid sync mode in task DB: ${sync_mode}. Falling back to default.`);
            return fallbackMode;
        }

        return REVERSE_SYNC_MODE_MAP[sync_mode] || "update";
    } catch (err) {
        console.error(`Failed to read sync mode from task DB (${dbFilePath}):`, err);
        return fallbackMode;
    }
}

async function get_delete_file_method_fromDB(DBFile){
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    const fallbackMethod = DELETE_OVERWRITE_METHODS[1];

    if (!fs.existsSync(dbFilePath)) {
        console.error(`Task DB file not found: ${dbFilePath}`);
        return fallbackMethod;
    }

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);
        const delete_file_method = config.delete_file_method;

        if (typeof delete_file_method !== "string") {
            console.error("Invalid task DB format: 'delete_file_method' must be a string.");
            return fallbackMethod;
        }

        if (!DELETE_OVERWRITE_METHODS.includes(delete_file_method)) {
            console.error(`Invalid delete file method in task DB: ${delete_file_method}. Falling back to default.`);
            return fallbackMethod;
        }

        return DELETE_METHOD_REVERSE_MAP[delete_file_method];
    } catch (err) {
        console.error(`Failed to read delete file method from task DB (${dbFilePath}):`, err);
        return fallbackMethod;
    }
}

async function get_filter_settings_fromDB(DBFile) {
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    const fallbackFilters = {
        include: ["*"],
        exclude: [],
        size_min: 0,
        size_max: 0
    };

    if (!fs.existsSync(dbFilePath)) {
        console.error(`Task DB file not found: ${dbFilePath}`);
        return fallbackFilters;
    }

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);
        const filters = config.filters || {};

        const include = Array.isArray(filters.include)
            ? filters.include.filter(v => typeof v === "string")
            : fallbackFilters.include;
        const exclude = Array.isArray(filters.exclude)
            ? filters.exclude.filter(v => typeof v === "string")
            : fallbackFilters.exclude;
        const size_min = (typeof filters.size_min === "number" && Number.isFinite(filters.size_min))
            ? Math.max(0, filters.size_min)
            : fallbackFilters.size_min;
        const size_max = (typeof filters.size_max === "number" && Number.isFinite(filters.size_max))
            ? Math.max(0, filters.size_max)
            : fallbackFilters.size_max;

        return { include, exclude, size_min, size_max };
    } catch (err) {
        console.error(`Failed to read filter settings from task DB (${dbFilePath}):`, err);
        return fallbackFilters;
    }
}

async function get_schedule_settings_fromDB(DBFile) {
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    const fallbackSchedule = {
        enabled: false,
        run_every: "1h",      // "30m", "1h", "1d"
        delay: null,          // "07:07 AM" or null
        ignore_time_span: false,
        time_span: []         // ["10:10 PM", "10:20 PM"]
    };

    if (!fs.existsSync(dbFilePath)) {
        console.error(`Task DB file not found: ${dbFilePath}`);
        return fallbackSchedule;
    }

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);
        const schedule = config.schedule || {};

        const enabled = typeof schedule.enabled === "boolean"
            ? schedule.enabled
            : fallbackSchedule.enabled;

        const run_every = (typeof schedule.run_every === "string" && /^[1-9]\d*[mhd]$/.test(schedule.run_every))
            ? schedule.run_every
            : fallbackSchedule.run_every;

        const delay = typeof schedule.delay === "string" && schedule.delay.trim().length > 0
            ? schedule.delay.trim()
            : fallbackSchedule.delay;

        const ignore_time_span = typeof schedule.ignore_time_span === "boolean"
            ? schedule.ignore_time_span
            : fallbackSchedule.ignore_time_span;

        const time_span = (
            Array.isArray(schedule.time_span) &&
            schedule.time_span.length === 2 &&
            schedule.time_span.every(v => typeof v === "string" && v.trim().length > 0)
        )
            ? [schedule.time_span[0].trim(), schedule.time_span[1].trim()]
            : fallbackSchedule.time_span;

        return { enabled, run_every, delay, ignore_time_span, time_span };
    } catch (err) {
        console.error(`Failed to read schedule settings from task DB (${dbFilePath}):`, err);
        return fallbackSchedule;
    }
}

async function get_versioning_folder_fromDB(DBFile) {
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    if (!fs.existsSync(dbFilePath)) {
        console.error(`Task DB file not found: ${dbFilePath}`);
        return "";
    }

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);

        return config.versioning_folder || "";
    } catch (err) {
        console.error(
            `Failed to read versioning folder from task DB (${dbFilePath}):`,
            err
        );
        return "";
    }
}

async function get_last_sync_fromDB(DBFile) {
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    if (!fs.existsSync(dbFilePath)) {
        console.error(`Task DB file not found: ${dbFilePath}`);
        return null;
    }

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);

        return config.last_sync || null;

    } catch (err) {
        console.error(`Failed to read last_sync from task DB (${dbFilePath}):`, err);
        return null;
    }
}

async function get_task_name_by_id(taskId){
    let taskListData =[]
    const TaskListPath = path.join(process.cwd(), "data", "tasks_list.json");
    const raw = fs.readFileSync(TaskListPath, "utf-8");
    taskListData = JSON.parse(raw);
    const task = taskListData.tasks.find(t => t.id === taskId);

    return task.name;
}

async function get_bd_file_by_id(taskId) {
    const TaskListPath = path.join(process.cwd(), "data", "tasks_list.json");

    const raw = fs.readFileSync(TaskListPath, "utf-8");
    const taskListData = JSON.parse(raw);

    const task = taskListData.tasks.find(t => t.id === taskId);

    if (!task) {
        console.error("Task not found in task list:", taskId);
        return null;
    }

    return task.configFilePath;
}

// Get locally
//https://stackoverflow.com/questions/936397/finding-the-recycle-bin-on-a-local-ntfs-drive/945561#945561
//not the real hidden tf, maybe change later like in this link
function get_trash_folder(){
    const homeDir = homedir();
    let trashFolder;

    if (process.platform === "win32") {
        trashFolder = path.join(homeDir, "Recycle Bin");
    } else if (process.platform === "darwin") {
        trashFolder = path.join(homeDir, ".Trash");
    } else {
        trashFolder = path.join(homeDir, ".local", "share", "Trash", "files");
    }

    try {
        fs.mkdirSync(trashFolder, { recursive: true });
        return normalize(trashFolder);
    } catch (err) {
        console.error("Failed to prepare trash folder, using fallback:", err);
        const fallbackTrash = path.join(process.cwd(), ".purrup-trash");
        fs.mkdirSync(fallbackTrash, { recursive: true });
        return normalize(fallbackTrash);
    }
}

// interpret info

async function interpret_run_every_time(run_every){
    // "30m", "1h", "1d"
    let ms;
    const time_value = Number(run_every.slice(0, -1));

    if (run_every.endsWith("m")) {
        ms = time_value * 60 * 1000;
    } else if (run_every.endsWith("h")) {
        ms = time_value * 60 * 60 * 1000;
    } else if (run_every.endsWith("d")) {
        ms = time_value * 24 * 60 * 60 * 1000;
    } else {
        console.error("WRONG UI TIME FORMAT");
        return null;
    }
    return ms;
}

async function interpret_delay_until_start(start_time) {
    if (!start_time) {
        return Date.now();
    }

    const targetTime = new Date(start_time).getTime();

    if (isNaN(targetTime)) {
        return Date.now();
    }

    return targetTime;
}

async function interpret_ignore_timespan(from, to) {
    // "03:19", "13:20"

    function parseTimeToMs(timeString) {
        const [hours, minutes] = timeString
            .split(":")
            .map(Number);

        return (
            hours * 60 * 60 * 1000 +
            minutes * 60 * 1000
        );
    }

    return [
        parseTimeToMs(from),
        parseTimeToMs(to)
    ];
}

// Other helping funcs :

function isTaskSettingsFileName(fileName) {
    return typeof fileName === "string" && fileName.toLowerCase().endsWith("-settings.json");
}

function resolveTaskDbFilePath(dirOrDbFile) {
    // If an explicit JSON path is passed, use it directly.
    if (typeof dirOrDbFile === "string" && path.extname(dirOrDbFile).toLowerCase() === ".json") {
        return dirOrDbFile;
    }

    const baseDir = dirOrDbFile || process.cwd();

    try {
        if (fs.existsSync(baseDir)) {
            const settingsFiles = fs.readdirSync(baseDir, { withFileTypes: true })
                .filter(entry => entry.isFile() && isTaskSettingsFileName(entry.name))
                .map(entry => entry.name)
                .sort((a, b) => a.localeCompare(b));

            if (settingsFiles.length > 0) {
                return path.join(baseDir, settingsFiles[0]);
            }
        }
    } catch (err) {
        console.error(`Failed to resolve task DB file in ${baseDir}:`, err);
    }

    // Default file name when no task settings file exists yet.
    return path.join(baseDir, "task-settings.json");
}

async function getUniquePath(dir, fileName) {
    const ext = path.extname(fileName);     // .txt
    const name = path.basename(fileName, ext);

    let newPath = path.join(dir, fileName);
    let i = 1;

    while (true) {
        try {
            await fsp.access(newPath);
            newPath = path.join(dir, `${name} (${i})${ext}`);
            i++;
        } catch {
            return newPath; // свободное имя найдено
        }
    }
}

function detectMoved(folder_1_list, folder_2_list, compare_result_list){
    //get OnlyInLeft, OnlyInRight from compare_result_list --  { file: 'a.txt', status: "in both dir's: same" },
    const OnlyInLeft = [];
    const OnlyInRight = [];

    const moved = [];

    for (const file of compare_result_list){
        if (file.status === "only in dir1"){
            OnlyInLeft.push(file);
        }
        else if (file.status === "only in dir2"){
            OnlyInRight.push(file);
        }
    }

    for (const leftFile of OnlyInLeft){
        for (const rightFile of OnlyInRight){
            const lData = folder_1_list[leftFile.file];
            const rData = folder_2_list[rightFile.file];

            if(lData.size === rData.size &&
                lData.mtime.getTime() === rData.mtime.getTime() &&
                path.basename(leftFile.file) === path.basename(rightFile.file))
            {
                moved.push({
                    from: rightFile.file,
                    to: leftFile.file
                });

                // изменить статус
                const leftItem = compare_result_list.find(
                    obj => obj.file === leftFile.file
                );

                if (leftItem) {
                    leftItem.status = "Left: moved";
                }

                const rightItem = compare_result_list.find(
                    obj => obj.file === rightFile.file
                );

                if (leftItem) {
                    rightItem.status = "Right: to move";
                }

            }
        }
    }

    return moved;
}

function normalize(p) {
    return p.replace(/\\/g, "/");
}

async function moveFiles(list, dir2) {
    for (const item of list) {
        const fromPath = path.join(dir2, item.from);
        const toPath = path.join(dir2, item.to);

        const dir = path.dirname(toPath); // папка назначения

        // 1. создаём папку (если нет)
        await fsp.mkdir(dir, { recursive: true });

        // 2. перемещаем файл
        await fsp.rename(fromPath, toPath);
    }
}

function matchPattern(fileName, pattern) {
    if (pattern === "*") return true;

    const regex = new RegExp(
        "^" + pattern
            .replace(/\./g, "\\.")
            .replace(/\*/g, ".*") + "$"
    );

    return regex.test(fileName);
}

async function update_last_sync(DBFile, timestamp = Date.now()) {
    const dbFilePath = resolveTaskDbFilePath(DBFile);

    try {
        const raw = fs.readFileSync(dbFilePath, "utf8");
        const config = JSON.parse(raw);

        config.last_sync = timestamp;

        fs.writeFileSync(
            dbFilePath,
            JSON.stringify(config, null, 2),
            "utf8"
        );

    } catch (err) {
        console.error(`Failed to update last_sync (${dbFilePath}):`, err);
    }
}

////////////////////////////// exporting ////////////////////////////
module.exports = {
    compareDirs,
    scan_folder,
    sync_files,
    save_updateTaskInDB,
    removeTaskFromDB,
    get_folders_fromDB,
    get_sync_mode_fromDB,
    get_delete_file_method_fromDB,
    get_filter_settings_fromDB,
    get_schedule_settings_fromDB,
    get_versioning_folder_fromDB,
    get_last_sync_fromDB,
    get_task_name_by_id,
    get_bd_file_by_id,
    isSyncAllowed,
    update_last_sync,
    saveTaskInTaskList
};


/////////////////////////////// funcs tests ///////////////////////////

// const dir_1 = "C:/Users/Seagulltoon/Desktop/1"
// const dir_2 = "C:/Users/Seagulltoon/Desktop/2"


let taskListData = { tasks: [    {
        "id": "fdc673a0-f5e1-46dd-bfd3-cee30cb2e198",
        "name": "twoway",
        "configFilePath": "C:/Users/Seagulltoon/Desktop/e2/fdc673a0-f5e1-46dd-bfd3-cee30cb2e198-settings.json"
    }] };
let taskIndex= taskListData.tasks.findIndex(task => task.id === "fdc673a0-f5e1-46dd-bfd3-cee30cb2e198")
console.log(taskListData.tasks[taskIndex]);

