var api = window.api;

const sourceInput = document.querySelector('.path-container .path-block:first-child .path-input');
const targetInput = document.querySelector('.path-container .path-block:last-child .path-input');
const compareBtn = document.querySelector('.compare-btn');
const FSSBtn = document.getElementById('settings-btn');
const taskName = document.getElementById("task-name");
const paths = document.querySelectorAll(".path-block .path-input");
const dir1 = paths[0];
const dir2 = paths[1];
const deleteBtn = document.getElementById('delete-task-btn');
const delYesBtn = document.getElementById('yes-delete-btn');
const delNoBtn = document.getElementById('no-delete-btn');

window.addEventListener("DOMContentLoaded", async () => {

    compareBtn.addEventListener('click', async () => {
        const dir1 = sourceInput.value;
        const dir2 = targetInput.value;

        const result = await window.api.compareDirs(dir1, dir2);
        console.log(result);

        const dir1Files =  await window.api.scan_folder(dir1);
        const dir2Files =  await window.api.scan_folder(dir2);
        renderFileList(result, dir1Files, dir2Files);
    });

    document.getElementById("save-task-btn").addEventListener("click", async () => {

        if (await fieldValidation_TaskEditor()) {
            const taskData = collectTaskDataFromUI("taskEditor");

            await window.api.updateTaskDraft(taskData);
            await window.api.saveTask();
            window.api.hideWindow("taskEditor");
        }
    });

    FSSBtn.addEventListener("click", async () => {
        const updatedDraft = collectTaskDataFromUI("taskEditor");
        await window.api.updateTaskDraft(updatedDraft);
        window.api.openWindow('Comp_Filter_Synch_Sched')
    })

    deleteBtn.addEventListener("click", async () => {
        addHidden(document.getElementById("delete-container"))
        removeHidden(document.getElementById("delete-confirm-container"))
    })

    delYesBtn.addEventListener("click", async () => {
        const currentDraft = await window.api.getCurrentTaskDraft()
        const taskId = currentDraft.taskId;
        await window.api.deleteTask(taskId)
    })

    delNoBtn.addEventListener("click", async () => {
        addHidden(document.getElementById("delete-confirm-container"))
        removeHidden(document.getElementById("delete-container"))
    })

});

window.api.onRefreshDraftUI(async () => {
    const draft = await window.api.getCurrentTaskDraft();
    fillTaskEditorUI(draft);
});

window.api.onResetUI(async () => {
    markValid(taskName)
    markValid(dir1)
    markValid(dir2)
    const currentDraft = await window.api.getCurrentTaskDraft()
    if (!currentDraft.taskId){
        addHidden(document.getElementById("delete-container"))
        addHidden(document.getElementById("delete-confirm-container"))
    }else {
        addHidden(document.getElementById("delete-confirm-container"))
        removeHidden(document.getElementById("delete-container"))
    }
    clearFileList()
})

function renderFileList(results, dir1Files, dir2Files) {
    const leftList = document.querySelector('.file-panel:first-child .file-list');
    const rightList = document.querySelector('.file-panel:last-child .file-list');

    leftList.innerHTML = '';
    rightList.innerHTML = '';

    results.forEach(fileData => {

        const createFileInfo = (fileName, fileList) => {
            if (!fileName) return null;
            const stats = fileList[fileName];
            if (!stats) return null;

            const row = document.createElement('div');
            row.classList.add('px-2', 'py-1', 'text-sm', 'border-b', 'border-roseSoft');

            const nameEl = document.createElement('div');
            nameEl.textContent = fileName;

            const sizeEl = document.createElement('div');
            sizeEl.textContent = `${stats.size} bytes`;

            const dateEl = document.createElement('div');
            dateEl.textContent = new Date(stats.mtime).toLocaleString();

            row.appendChild(nameEl);
            row.appendChild(sizeEl);
            row.appendChild(dateEl);

            return row;
        };

        let leftRow = document.createElement('div');
        let rightRow = document.createElement('div');

        // создаём строки отдельно
        if (fileData.status === "in both dir's: same" || fileData.status === "in both dir's: different") {
            leftRow = createFileInfo(fileData.file, dir1Files);
            rightRow = createFileInfo(fileData.file, dir2Files);
        } else if (fileData.status === "only in dir1") {
            leftRow = createFileInfo(fileData.file, dir1Files);
            rightRow = createEmptyRow()
        } else if (fileData.status === "only in dir2") {
            leftRow = createEmptyRow()
            rightRow = createFileInfo(fileData.file, dir2Files);
        }

        // подсветка
        const color =
            fileData.status === "in both dir's: same" ? "#d4edda" :
                fileData.status === "in both dir's: different" ? "#fff3cd" :
                    "#f8d7da";

        leftRow.style.backgroundColor = color;
        rightRow.style.backgroundColor = color;

        leftList.appendChild(leftRow);
        rightList.appendChild(rightRow);
    });

    console.log("renderFileList done")
}

function clearFileList() {
    const leftList = document.querySelector(
        '.file-panel:first-child .file-list'
    );

    const rightList = document.querySelector(
        '.file-panel:last-child .file-list'
    );

    if (leftList) {
        leftList.innerHTML = "";
    }

    if (rightList) {
        rightList.innerHTML = "";
    }
}

function createEmptyRow() {
    const row = document.createElement('div');
    row.classList.add('px-2', 'py-1', 'text-sm', 'border-b', 'border-roseSoft');

    // чтобы высота совпадала
    row.innerHTML = `
        <div>&nbsp;</div>
        <div>&nbsp;</div>
        <div>&nbsp;</div>
    `;

    return row;
}

function fillTaskEditorUI(currentTaskDraft) {
    const taskNameInput = document.querySelector(".task-name");
    if (taskNameInput) {
        taskNameInput.value = currentTaskDraft.taskName || "";
    }

    const pathInputs = document.querySelectorAll(".path-block .path-input");

    if (pathInputs[0]) {
        pathInputs[0].value = currentTaskDraft.dir1 || "";
    }

    if (pathInputs[1]) {
        pathInputs[1].value = currentTaskDraft.dir2 || "";
    }
}

async function fieldValidation_TaskEditor() {

    let valid = true;
    const taskName = document.getElementById("task-name");
    const paths = document.querySelectorAll(".path-block .path-input");
    const dir1 = paths[0];
    const dir2 = paths[1];


    // ======================
    // TASK NAME
    // ======================

    if (taskName.value.trim() === "") {
        markInvalid(taskName)
        valid = false;
    } else {
        markValid(taskName)
    }


    if (dir1.value.trim() === "") {
        markInvalid(dir1);
        valid = false;
    } else {
        const exists = await window.api.checkPathExists(dir1.value);

        if (!exists) {
            markInvalid(dir1);
            valid = false;
            console.log("dir1 ", exists)
        } else {
            markValid(dir1);
        }
    }

    if (dir2.value.trim() === "") {
        markInvalid(dir2);
        valid = false;
    } else {
        const exists = await window.api.checkPathExists(dir2.value);

        if (!exists) {
            markInvalid(dir2);
            valid = false;
        } else {
            markValid(dir2);
        }
    }

    if (dir1.value.trim() === dir2.value.trim()){
        markInvalid(dir1);
        markInvalid(dir2);
        valid = false;
    }

    const currentDraft = await window.api.getCurrentTaskDraft()
    const versioningFolder = currentDraft.versioning_folder
    if (versioningFolder) {
        if (dir1.value.trim() === versioningFolder
            || dir2.value.trim() === versioningFolder){
            markInvalid(dir1);
            markInvalid(dir2);
            valid = false;
        }
        else{
            markValid(dir1);
            markValid(dir2);
        }
    }


    return valid;
}

function markInvalid(el) {
    el.classList.remove("border-roseSoft");
    el.classList.add("border-red-500");
}

function markValid(el) {
    el.classList.remove("border-red-500");
    el.classList.add("border-roseSoft");
}

function addHidden(el) {
    if (!el) return;

    if (!el.classList.contains("hidden")) {
        el.classList.add("hidden");
    }
}

function removeHidden(el) {
    if (!el) return;

    if (el.classList.contains("hidden")) {
        el.classList.remove("hidden");
    }
}



