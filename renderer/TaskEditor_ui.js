var api = window.api;

const sourceInput = document.querySelector('.path-container .path-block:first-child .path-input');
const targetInput = document.querySelector('.path-container .path-block:last-child .path-input');
const compareBtn = document.querySelector('.compare-btn');

compareBtn.addEventListener('click', async () => {
        const dir1 = sourceInput.value;
        const dir2 = targetInput.value;

        const result = await window.api.compareDirs(dir1, dir2);
        console.log(result);

        const dir1Files =  await window.api.scan_folder(dir1);
        const dir2Files =  await window.api.scan_folder(dir2);
        renderFileList(result, dir1Files, dir2Files);
});

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

function taskEditorImportantFields(){}

function getAndSetSettingsFromDBToUI(){
    //Include

    //Exclude

    // min max file size

    //Sync mode + clue note

    //Delete/overwrite + clue note

    //Enable schedule

    //run every num digit

    //start time + clue note

    //Ignore time span check

    //timespan from to
}

function scheduleImportantFields(){}

function filterImportantFields(){}

function trimAndNormilizeFilterFields(){}

window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("save-task-btn").addEventListener("click", () => {
        const taskData = collectTaskDataFromUI("taskEditor");
        window.api.updateTaskDraft(taskData);
        window.api.saveTask();
    });
});




