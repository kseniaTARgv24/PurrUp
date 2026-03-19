const path = require("path");
const { join, resolve, basename } = require('path');
const fs = require("fs");
const fsp = require("fs/promises");

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
                    scan_folder(fullPath, file_list, root = dir);
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
    let dir1_file_list = scan_folder(dir1);
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


    }
    return compare_result;
}

////////////////////////////
const SYNC_MODES = ['Two way', 'Mirror', 'Update', 'Custom']
const DELETE_OVERWRITE_METHODS = ["Recycle bin", "Permanent delete", "Versioning"]

async function sync_files(dir1, dir2, compare_result_list, sync_mode, delete_file_method){

    const folder_1_list = scan_folder(dir1);
    const folder_2_list = scan_folder(dir2);

    console.log("before: ", compareDirs(dir1, dir2));

    switch(sync_mode){
        case "Two way":
            for (let file of compare_result_list){

                if (file.status === "only in dir1"){
                    // copy file to dir2
                    await fs.copyFile(`${dir1}/${file.file}`, `${dir2}/${file.file}`);
                }
                else if (file.status === "only in dir2"){
                    // copy file to dir1
                    await fs.copyFile(`${dir2}/${file.file}`, `${dir1}/${file.file}`);
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
                            case "Recycle bin":
                                //move to trash
                                await fs.copyFile(`${dir2}/${file.file}`, `${get_trash_folder()}/${file.file}`);
                                break;
                            case "Permanent delete":
                                // making sure the older file is deleted permanently
                                await fs.unlink(`${dir2}/${file.file}`);
                                break;
                            case "Versioning":

                                await fs.copyFile(`${dir2}/${file.file}`, await getUniquePath(get_versioning_folder(), file.file));
                                break;
                        }
                        // then copy
                        await fsp.copyFile(`${dir1}/${file.file}`, `${dir2}/${file.file}`)
                    }
                    else if (f1.mtime < f2.mtime){
                        // 2 is newer
                        // delete with switch
                        switch(delete_file_method){
                            case "Recycle bin":
                                //move to trash
                                await fsp.copyFile(`${dir1}/${file.file}`,`${get_trash_folder()}/${file.file}`);
                                break;
                            case "Permanent delete":
                                // making sure the older file is deleted permanently
                                await fsp.unlink(`${dir1}/${file.file}`);
                                break;
                            case "Versioning":

                                await fsp.copyFile(`${dir1}/${file.file}`, await getUniquePath(get_versioning_folder(), file.file));
                                break;
                        }
                        // then copy
                        await fsp.copyFile(`${dir2}/${file.file}`, `${dir1}/${file.file}`)
                    }
                    else{console.error("error when comparing time...")}

                    console.log("in both dir's: different method!")

                }
                else{ console.error("wrong status?")}
            }
            console.log("after: ", compareDirs(dir1, dir2));

            break;
        case "Mirror":
            break;
        case "Update":
            break;
        case "Custom":
            break;
    }
}

function get_versioning_folder(){
    // getting it from ui
    const versioning_folder = "C:/Users/Seagulltoon/Desktop/dir2_version"
    return versioning_folder;
}

function get_trash_folder(){
    // getting it from ui??
    const trash_folder = "C:/Users/Seagulltoon/Desktop/Recycle Bin"
    return trash_folder;
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


////////////////////////////// exporting ////////////////////////////
module.exports = {
    compareDirs,
    scan_folder,
    sync_files
};

/////////////////////////////// funcs tests ///////////////////////////

const dir_1 = "C:/Users/Seagulltoon/Desktop/1"
const dir_2 = "C:/Users/Seagulltoon/Desktop/2"
sync_mode = SYNC_MODES[0];
delete_file_method = SYNC_MODES[0];
sync_files(dir_1, dir_2, compareDirs(dir_1, dir_2), sync_mode, delete_file_method)

// console.log(scan_folder(dir_1));
