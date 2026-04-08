window.collectTaskDataFromUI = function() {
    console.log("aaaaaaaaaaaa")
    // 1️⃣ Имя задачи
    const taskName = document.querySelector(".task-name").value.trim();

    // 2️⃣ Папки
    const pathInputs = document.querySelectorAll(".path-block .path-input");
    const folders = Array.from(pathInputs).map(input => input.value.trim());

    // 3️⃣ Delete file method
    const deleteInput = document.querySelector('input[name="delete"]:checked');
    const delete_file_method = deleteInput ? deleteInput.value : "recycle";

    // 4️⃣ Versioning folder (если включена)
    const versioning_folder_container = document.getElementById("versioning-path-container");
    let versioning_folder = "";

    if (versioning_folder_container) {
        versioning_folder = !versioning_folder_container.classList.contains("hidden")
            ? (document.getElementById("version-folder-path")?.value || "").trim()
            : "";
    }

    // 5️⃣ Sync mode
    const syncInput = document.querySelector('input[name="sync"]:checked');
    const sync_mode = syncInput ? syncInput.value : "two-way";

    // 6️⃣ Filters
    const include = document.getElementById("filter-include")?.value
        .split("\n").map(s => s.trim()).filter(Boolean) || [];
    const exclude = document.getElementById("filter-exclude").value
        .split("\n").map(s => s.trim()).filter(Boolean);
    const size_min = Number(document.getElementById("size-min").value) || 0;
    const size_max = Number(document.getElementById("size-max").value) || 0;
    const filters = { include, exclude, size_min, size_max };

    // 7️⃣ Schedule
    const schedule_enabled = document.getElementById("schedule-enabled").checked;
    const run_every_value = document.getElementById("run-every-value").value;
    const run_every_unit = document.getElementById("run-every-unit").value;
    const run_every = `${run_every_value}${run_every_unit[0]}`; // "1h", "30m", "1d"

    const delay = document.getElementById("start-time").value || null;

    const ignore_time_span = document.getElementById("ignore-span-enabled").checked;
    const time_from = document.getElementById("ignore-from").value || null;
    const time_to = document.getElementById("ignore-to").value || null;
    const time_span = (time_from && time_to) ? [time_from, time_to] : [];

    const schedule = {
        enabled: schedule_enabled,
        run_every,
        delay,
        ignore_time_span,
        time_span
    };

    // ✅ Собираем объект
    return {
        taskName,
        folders,
        delete_file_method,
        versioning_folder,
        sync_mode,
        filters,
        schedule
    };
}