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
    const scheduleSettings = get_schedule_settings(); // { enabled, run_every, start_time, ignore_time_span, time_span } --> { enabled: true, run_every: '1h', start_time: 2026-03-30T12:41:54.330Z, ignore_time_span: false,  time_span: { start: '08:00', end: '20:00' }}
    if (! isSyncAllowed(scheduleSettings, is_task_active())){
        return;
    }

    // folders data and info:
    const folder_1_list = scan_folder(dir1); //{file_relative_path: size, date}
    const folder_2_list = scan_folder(dir2);
    let compare_result_list = compareDirs(dir1, dir2)  //|is in dir1 -- is in dir2 -- (if both TRUE) status (same or not)|  { file: 'b.txt', status: "in both dir's: same" }

    // user's sync settings
    const sync_mode = get_sync_mode();
    const delete_file_method = get_delete_file_method()
    const filterSettings = get_filter_settings(); // { include, exclude, size_min, size_max } --> {include: [ '*.txt', '*.docx' ], exclude: [ '*.tmp', '*.log' ], size_min: 0, size_max: 10000000 }

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

                                const dest = await getUniquePath(get_versioning_folder(), file.file);

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

                                const dest = await getUniquePath(get_versioning_folder(), file.file);

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

                            const dest = await getUniquePath(get_versioning_folder(), file.file);

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

                            const dest = await getUniquePath(get_versioning_folder(), file.file);

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

                            const dest = await getUniquePath(get_versioning_folder(), file.file);

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
}


//todo работа с бд
// 1 task = 1 db???
// "is_task_active": true,
// "filters": {
//     "include": ["*.txt", "*.md"],   // файлы, которые обязательно включать
//         "exclude": ["secret*.txt"],     // файлы, которые исключать
//         "size_min": 0,                  // минимальный размер файла
//         "size_max": 1048576             // максимальный размер файла
// },
// "schedule": {
//     "enabled": true,                // включён ли синк
//         "run_every": 60m/60s/60h,        // запуск каждые
//         "start_time": "2026-03-30T08:00:00", // время старта
//         "ignore_span": {
//         "enabled": true,
//             "from": "23:00",
//             "to": "06:00"
//     }
//   "folders": {
//     "versioning_folder": "C:/Users/Seagulltoon/Desktop/dir2_version",
//     "trash_folder": "C:/Users/Seagulltoon/Desktop/Recycle Bin"
//   }

// ТУТ


//////////// Helper funcs ///////////////

// Getting settings info :
function get_sync_mode(sync_mode = ""){
    // from db
    sync_mode = SYNC_MODES[2] //REF
    return sync_mode
}

function get_delete_file_method(delete_file_method = ""){
    // from db
    delete_file_method = DELETE_OVERWRITE_METHODS[1] //REF
    return delete_file_method
}

function get_filter_settings() {
    // Заглушка — позже будет из БД
    const include = ["*.txt", "*.docx"];
    const exclude = ["*.tmp", "*.log"];
    const size_min = 0;                        // (байты)
    const size_max = 10_000_000;               // (байты)

    return { include, exclude, size_min, size_max };
}

function get_schedule_settings() {
    // Заглушка — позже будет из БД
    const enabled = true;
    const run_every = "1h";                     // "30m", "1h", "1d"
    const start_time = new Date();              // NOW — текущее время
    const ignore_time_span = false;
    const time_span = { start: "08:00", end: "20:00" };

    return { enabled, run_every, start_time, ignore_time_span, time_span };
}

function isSyncAllowed(scheduleSettings, is_task_active) {
    //todo schedule + is_task_active
    //{ enabled, run_every, start_time, ignore_time_span, time_span } --> { enabled: true, run_every: '1h', start_time: 2026-03-30T12:41:54.330Z, ignore_time_span: false,  time_span: { start: '08:00', end: '20:00' }}

}

function is_task_active(){
    const is_task_active = true;
    return is_task_active;
}

function get_versioning_folder(){
    // getting it from BD
    const versioning_folder = "C:/Users/Seagulltoon/Desktop/dir2_version"
    return versioning_folder;
}

function get_trash_folder(){
    // getting it from USER PC
    const trash_folder = "C:/Users/Seagulltoon/Desktop/Recycle Bin"
    return trash_folder;
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
    sync_files
};


/////////////////////////////// funcs tests ///////////////////////////

const dir_1 = "C:/Users/Seagulltoon/Desktop/1"
const dir_2 = "C:/Users/Seagulltoon/Desktop/2"
const dir_3 = "C:/Users/Seagulltoon/Desktop/3"
const dir_4 = "C:/Users/Seagulltoon/Desktop/4"
const dir_5 = "C:/Users/Seagulltoon/Desktop/5"
const dir_6 = "C:/Users/Seagulltoon/Desktop/6"

// await sync_files(dir_1, dir_2, compareDirs(dir_1, dir_2), SYNC_MODES[2], DELETE_OVERWRITE_METHODS[1])
// await sync_files(dir_3, dir_4, compareDirs(dir_3, dir_4), SYNC_MODES[1], delete_file_method)
// await sync_files(dir_5, dir_6, compareDirs(dir_5, dir_6), SYNC_MODES[2], delete_file_method)
// ---> takes info from BD not from UI!!!!

// const a = compareDirs(dir_1, dir_2)
// console.log(a);
// console.log(detectMoved(scan_folder(dir_1), scan_folder(dir_2), a))
// console.log(a);

// console.log(scan_folder(dir_5))
// console.log(compareDirs(dir_5, dir_6))


//todo DB -- ui to db -- sync to ui/db