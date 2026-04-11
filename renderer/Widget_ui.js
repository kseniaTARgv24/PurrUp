var api = window.api;

window.addEventListener("DOMContentLoaded", async () => {

    await refreshTaskListWidget()

    const newTaskBtn = document.getElementById("new-task-btn");

    if (newTaskBtn) {
        newTaskBtn.addEventListener("click", async () => {
            await window.api.startNewTask();
        });
    }

});

window.api.onRefreshTaskList(refreshTaskListWidget);

function createTaskItem(taskId, taskName, enabled) {
    const wrapper = document.createElement("div");

    wrapper.dataset.taskId = taskId;

    wrapper.className =
        "task-item flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-roseSoft bg-white/70 backdrop-blur";

    wrapper.innerHTML = `
        <div class="flex items-center justify-between gap-3 w-full">
            <div class="task-name flex-1 text-sm">${taskName}</div>

            <button class="task-start w-[36px] h-[36px] rounded-full border border-roseSoft"></button>

            <label class="task-toggle relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only peer">
                <div class="w-[64px] h-[32px] bg-gray-300 peer-checked:bg-green-500 rounded-full transition"></div>
                <div class="absolute left-1 top-1 w-[24px] h-[24px] bg-white rounded-full transition peer-checked:translate-x-[32px]"></div>
            </label>
        </div>
    `;

    const checkbox = wrapper.querySelector(".task-toggle input");

    // установить состояние сразу
    checkbox.checked = enabled;

    wrapper.addEventListener("click", async (e) => {
        if ( e.target.closest(".task-start") || e.target.closest(".task-toggle") ) return;
        await window.api.openTaskSettings(taskId); });

    wrapper.querySelector(".task-start")
        .addEventListener("click", async (e) => {
            e.stopPropagation();
            await window.api.runTaskNow(taskId);
        });

    checkbox.addEventListener("change", async (e) => {
        const newState = e.target.checked;
        await window.api.toggleSchedule(newState, taskId);
    });

    return wrapper;
}

async function syncTaskListUI(taskList) {
    const container = document.getElementById("task-list-widget");
    if (!container) return;

    container.innerHTML = "";

    for (const task of taskList) {
        const enabled = await window.api.isScheduleEnabled(task.id);

        const taskEl = createTaskItem(task.id, task.name, enabled);

        container.appendChild(taskEl);
    }
}

async function refreshTaskListWidget() {
    const taskList = await window.api.getTaskList();
    await syncTaskListUI(taskList);
}