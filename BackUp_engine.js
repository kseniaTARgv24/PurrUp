//for console testing:
// import path from "path";
// import fs from "fs";
// import fsp from "fs/promises";
// const { join, resolve, basename } = path;

// for export:
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { join, resolve, basename } = path;


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
const SYNC_MODES = ['Two way', 'Mirror', 'Update']
const DELETE_OVERWRITE_METHODS = ["Recycle bin", "Permanent delete", "Versioning"]

async function sync_files(dir1, dir2){

    // folders data and info:
    const folder_1_list = scan_folder(dir1); //{file_relative_path: size, date}
    const folder_2_list = scan_folder(dir2);
    let compare_result_list = compareDirs(dir1, dir2)  //|is in dir1 -- is in dir2 -- (if both TRUE) status (same or not)|  { file: 'b.txt', status: "in both dir's: same" }

    // user's sync settings
    const sync_mode = get_sync_mode_fromDB();
    const delete_file_method = get_delete_file_method_fromDB()
    const filterSettings = get_filter_settings_fromDB(); // { include, exclude, size_min, size_max } --> {include: [ '*.txt', '*.docx' ], exclude: [ '*.tmp', '*.log' ], size_min: 0, size_max: 10000000 }

    console.log("before: ", compareDirs(dir1, dir2));

    //// MOVED FILES ////
    const moved = detectMoved(folder_1_list, folder_2_list, compare_result_list)

    //// FILTERING ////
    let included_files = []
    for (let file of compare_result_list){
        //INCLUDE
        if (filterSettings.include.length > 0 || !filterSettings.include.includes("*")){
            // look for file 's that end with text after "*" (like in "*.txt")
            const isIncluded = filterSettings.include.some(pattern =>    // параметры => то с ними сделать?
                file.file.endsWith(pattern.replace("*", ""))      // тут: паттерн => есть ли файлы с окончанием как (если обрезать вот так паттерн)?
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
                    switch(delete_file_method){
                        case "Recycle bin": {
                            const src = path.join(dir2, file.file);
                            const dest = path.join(get_trash_folder(), file.file);

                            await fsp.mkdir(path.dirname(dest), { recursive: true });

                            await fsp.copyFile(src, dest);

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

async function isSyncAllowed(scheduleSettings, last_sync){
    //todo NB!! task_active_toggle in widget = schedule enabled in task editor!!! (shortcut)

    let newRunEvery = interpret_run_every_time(scheduleSettings.run_every);
    let newDelay =    interpret_delay_until_start(scheduleSettings.delay)
    let newTimeSpan = interpret_ignore_timespan(scheduleSettings.time_span);

    scheduleSettings = get_schedule_settings_fromDB()
    if (!newDelay){
        newDelay = 0;
    }
    const now = Date.now();
    const start_time = now + newDelay

    if (! last_sync){
        return await run_sync(); //initial first run
    }

    if (scheduleSettings.enabled){
        if (now >= start_time){
            if (scheduleSettings.ignore_time_span){
                if(!(now >= newTimeSpan[0] && now <= newTimeSpan[1])){
                    if (now < (last_sync + newRunEvery)){
                        return last_sync;
                    }
                    else {
                        const folders = get_folders_fromDB();
                        last_sync = sync_files(folders[0], folders[2])
                        return last_sync;
                    }
                }else{
                    return last_sync; // no
                }
            }
            else{
                if (now < (last_sync + newRunEvery)){
                    return last_sync;
                }
                else {
                    return await run_sync();
                }
            }
        }
    }
    else {
        return last_sync;
    }

    async function run_sync(){
        const folders = get_folders_fromDB();
        last_sync =  await sync_files(folders[0], folders[2])
        return last_sync;
    }

}

async function save_updateTaskInDB(taskName, dir1, dir2, delete_file_method, versioning_folder, sync_mode, filter_settings, schedule_settings){
    // Task settings format:
    // - taskName: "Namename"
    // - folders: ["C:/.../1", "C:/.../2"]
    // - delete_file_method: "Recycle bin" | "Permanent delete" | "Versioning"
    // - versioning_folder: "C:/.../dir2_version"
    // - sync_mode: "Two way" | "Mirror" | "Update"
    // - filters: { include: ["*.txt"], exclude: ["secret*.txt", ".purrup-task.json"], size_min, size_max }
    // - schedule: { enabled, run_every, delay/start_time, ignore_time_span/time_span ... }
    //
    // Storage:
    // - Store task settings as JSON in the target folder (dir2) as `.purrup-task.json`
    // - If the file exists: validate JSON and update it
    // - If corrupted/invalid: recreate
    // - Ensure `.purrup-task.json` is always in filters.exclude
    // - Trash folder is not stored here (it is resolved locally)

    const DB_FILE_NAME = ".purrup-task.json";

    // Bind settings to the task's target folder
    const targetFolder = dir2;
    const dbFilePath = path.join(targetFolder, DB_FILE_NAME);

    // Normalize input paths
    const folders = [normalize(dir1), normalize(dir2)];
    const normVersioningFolder = versioning_folder ? normalize(versioning_folder) : null;
    // Prepare filters; always exclude the settings file from sync
    const include = (filter_settings && Array.isArray(filter_settings.include)) ? filter_settings.include : [];
    const excludeRaw = (filter_settings && Array.isArray(filter_settings.exclude)) ? filter_settings.exclude : [];
    const exclude = Array.from(new Set([...excludeRaw, DB_FILE_NAME]));

    const size_min = (filter_settings && typeof filter_settings.size_min === "number") ? filter_settings.size_min : 0;
    const size_max = (filter_settings && typeof filter_settings.size_max === "number") ? filter_settings.size_max : 0;

    const filters = { include, exclude, size_min, size_max };
    const schedule = schedule_settings ? { ...schedule_settings } : {};

    const newConfig = {
        taskName,
        folders,
        delete_file_method,
        versioning_folder: normVersioningFolder,
        sync_mode,
        filters,
        schedule,
        folders_meta: {
            versioning_folder: normVersioningFolder
        }
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
    return dbFilePath;
}

async function removeTaskFromDB(dirOrDbFile){
    const DB_FILE_NAME = ".purrup-task.json";

    let dbFilePath;
    if (!dirOrDbFile) {
        dbFilePath = path.join(process.cwd(), DB_FILE_NAME);
    } else if (path.basename(dirOrDbFile) === DB_FILE_NAME) {
        dbFilePath = dirOrDbFile;
    } else {
        dbFilePath = path.join(dirOrDbFile, DB_FILE_NAME);
    }

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

function get_folders_fromDB(DBFile){
    const defaultDbFile = path.join(process.cwd(), ".purrup-task.json");
    const dbFilePath = DBFile || defaultDbFile;

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

function get_sync_mode_fromDB(DBFile){
    const DB_FILE_NAME = ".purrup-task.json";
    const defaultDbFile = path.join(process.cwd(), DB_FILE_NAME);
    let dbFilePath;

    if (!DBFile) {
        dbFilePath = defaultDbFile;
    } else if (path.basename(DBFile) === DB_FILE_NAME) {
        dbFilePath = DBFile;
    } else {
        dbFilePath = path.join(DBFile, DB_FILE_NAME);
    }

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

        return sync_mode;
    } catch (err) {
        console.error(`Failed to read sync mode from task DB (${dbFilePath}):`, err);
        return fallbackMode;
    }
}

function get_delete_file_method_fromDB(DBFile){
    const DB_FILE_NAME = ".purrup-task.json";
    const defaultDbFile = path.join(process.cwd(), DB_FILE_NAME);
    let dbFilePath;

    if (!DBFile) {
        dbFilePath = defaultDbFile;
    } else if (path.basename(DBFile) === DB_FILE_NAME) {
        dbFilePath = DBFile;
    } else {
        dbFilePath = path.join(DBFile, DB_FILE_NAME);
    }

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

        return delete_file_method;
    } catch (err) {
        console.error(`Failed to read delete file method from task DB (${dbFilePath}):`, err);
        return fallbackMethod;
    }
}

function get_filter_settings_fromDB(DBFile) {
    const DB_FILE_NAME = ".purrup-task.json";
    const defaultDbFile = path.join(process.cwd(), DB_FILE_NAME);
    let dbFilePath;

    if (!DBFile) {
        dbFilePath = defaultDbFile;
    } else if (path.basename(DBFile) === DB_FILE_NAME) {
        dbFilePath = DBFile;
    } else {
        dbFilePath = path.join(DBFile, DB_FILE_NAME);
    }

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

function get_schedule_settings_fromDB() {
    // GET FROM DB


    const enabled = true;
    const run_every = "1h";  // "30m", "1h", "1d"
    const delay = new Date();         //interpret_delay_until_start("10:10 AM")
    const ignore_time_span = false;
    const time_span = ["10:10 PM", "10:20 PM"]

    return { enabled, run_every, delay, ignore_time_span, time_span };
}

function get_versioning_folder_fromDB(){
    // GET FROM DB

    const versioning_folder = "C:/Users/Seagulltoon/Desktop/dir2_version"
    return versioning_folder;
}

// Get locally

function get_trash_folder(){
    // LOCAL
    const trash_folder = "C:/Users/Seagulltoon/Desktop/Recycle Bin"
    return trash_folder;
}

// interpret info

function interpret_run_every_time(run_every){
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

function interpret_delay_until_start(start_time){
    //"07:07 AM"

    if (!start_time){
        return null;
    }

    const now = Date.now();

    const uiTime = new Date(`1970-01-01 ${start_time}`);

    const target = new Date(now);
    target.setHours(uiTime.getHours());
    target.setMinutes(uiTime.getMinutes());
    target.setSeconds(0);
    target.setMilliseconds(0);

    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }

    return target - now;
}

function interpret_ignore_timespan(from, to){
    // 10:10 AM; 07:07 PM
    function parseTime(timeString) {
        const date = new Date(`1970-01-01 ${timeString}`);
        return date.getHours() * 60 + date.getMinutes(); // минуты от начала суток
    }

    const fromMinutes = parseTime(from);
    const toMinutes = parseTime(to);

    return [fromMinutes, toMinutes];
}

// Other helping funcs :

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


////////////////////////////// exporting ////////////////////////////
module.exports = {
    compareDirs,
    scan_folder,
    sync_files,
    save_updateTaskInDB,
    removeTaskFromDB,
    get_sync_mode_fromDB,
    get_delete_file_method_fromDB,
    get_filter_settings_fromDB
};








/////////////////////////////// funcs tests ///////////////////////////

const dir_1 = "C:/Users/xicey/Desktop/1"
const dir_2 = "C:/Users/xicey/Desktop/2"

//saveTaskToDB(....)
// console.log(get_folders_fromDB(///))
//........
// electron . --enable-logging

//////////////////////////////////////////////////////////////////////

// get_foldersfromDB check
//   console.log(
//   get_folders_fromDB("C:/Users/xicey/Desktop/2/.purrup-task.json")
//  );

// removeTaskFromDB check
// 1 VARIANT: delete file directly
//  removeTaskFromDB("C:/Users/xicey/Desktop/2/.purrup-task.json")
//  .then((result) => console.log("deleted:", result))
//  .catch((err) => console.error(err));
// --------------------------------
// 2 VARIANT: delete file from folder
//  removeTaskFromDB("C:/Users/xicey/Desktop/2/")
//  .then((result) => console.log("deleted:", result))
//  .catch((err) => console.error(err));

// get_sync_mode_fromDB check
// 1 variant
// console.log(get_sync_mode_fromDB('C:/Users/xicey/Desktop/2/.purrup-task.json'))
// --------------------------------
// 2 variant
// console.log(get_sync_mode_fromDB('C:/Users/xicey/Desktop/2'))

// get_delete_file_method_fromDB check
// 1 variant
// console.log(get_delete_file_method_fromDB('C:/Users/xicey/Desktop/2/.purrup-task.json'))
// --------------------------------
// 2 variant
// console.log(get_delete_file_method_fromDB('C:/Users/xicey/Desktop/2'))

// get_filter_settings_fromDB check
// 1 variant
// console.log(get_filter_settings_fromDB('C:/Users/xicey/Desktop/2/.purrup-task.json'))
// --------------------------------
// 2 variant
// console.log(get_filter_settings_fromDB('C:/Users/xicey/Desktop/2'))