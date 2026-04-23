var api = window.api;

const drag_pin_imgs = ['assets/widjetUI/drag pin/toggle drag off.png', 'assets/widjetUI/drag pin/toggle drag on.png']
let current_drag_pin;

window.addEventListener("DOMContentLoaded", async () => {

    await refreshTaskListWidget()
    current_drag_pin = drag_pin_imgs[0];
    document.getElementById("widget-pin").style.backgroundImage =`url("${current_drag_pin}")`;

    const newTaskBtn = document.getElementById("new-task-btn");

    if (newTaskBtn) {
        newTaskBtn.addEventListener("click", async () => {
            await window.api.startNewTask();
        });
    }

    document.getElementById("widget-pin").addEventListener("click", async () => {
        toggle_drag(document.body)
    })


});

window.api.onRefreshTaskList(refreshTaskListWidget);

function createTaskItem(taskId, taskName, enabled) {
    const wrapper = document.createElement("div");

    wrapper.dataset.taskId = taskId;

    wrapper.className =
        "task-item flex items-center justify-between gap-3 px-4 py-3 backdrop-blur";

    wrapper.innerHTML = `
        <div class="flex items-center justify-between gap-3 w-full">
            <div class="task-name flex-1 text-sm">${taskName}</div>

            <button class="task-start transition duration-200 hover:scale-110"></button>

            <label class="task-toggle relative inline-flex items-center cursor-pointer">
                <input type="checkbox" class="sr-only toggle-input">
            
                <div class="lottie-toggle w-[64px] h-[32px]"></div>
            </label>
        </div>
    `;


    const checkbox = wrapper.querySelector(".toggle-input");
    const animContainer = wrapper.querySelector(".lottie-toggle");

    const toggleAnim = window.lottie.loadAnimation({
        container: animContainer,
        renderer: 'svg',
        loop: false,
        autoplay: false,
        path: 'assets/widjetUI/sleep_awake_anim/data.json'
    });
    toggleAnim.setSpeed(2);


    if (checkbox.checked) {
        toggleAnim.goToAndStop(1, true);
    }

    checkbox.addEventListener("change", async (e) => {
        const newState = e.target.checked;
        await window.api.toggleSchedule(newState, taskId);
        await refresh_cat_animation();

        toggleAnim.setDirection(newState ? 1 : -1);
        toggleAnim.play();

    });

    wrapper.addEventListener("click", async (e) => {
        if ( e.target.closest(".task-start") || e.target.closest(".task-toggle") ) return;
        await window.api.openTaskSettings(taskId); });

    wrapper.querySelector(".task-start")
        .addEventListener("click", async (e) => {
            e.stopPropagation();
            await window.api.runTaskNow(taskId);
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
    await refresh_cat_animation();
}


function toggle_drag(el) {
    if (!el) return;

    current_drag_pin =
        current_drag_pin === drag_pin_imgs[0]
            ? drag_pin_imgs[1]
            : drag_pin_imgs[0];

    document.getElementById("widget-pin").style.backgroundImage =
        `url("${current_drag_pin}")`;

    if (el.classList.contains("drag-enabled")) {
        el.classList.remove("drag-enabled");
        el.classList.add("no-drag");
    } else {
        el.classList.add("drag-enabled");
        el.classList.remove("no-drag");
    }
}

/* lottie */

let currentAnimation_cat = null;
let currentPath_cat = null;

function change_cat_animation(animationPath) {
    const container = document.getElementById('lottie');

    if (currentPath_cat === animationPath) {
        return;
    }

    if (currentAnimation_cat) {
        currentAnimation_cat.destroy();
    }

    currentAnimation_cat = window.lottie.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: animationPath,
    });

    currentPath_cat = animationPath;
}

async function refresh_cat_animation() {
    if (await window.api.isThereActiveTask()){
        change_cat_animation('assets/widjetUI/cat3/data.json')
    }else{
        change_cat_animation('assets/widjetUI/cat2/data.json')
    }
}