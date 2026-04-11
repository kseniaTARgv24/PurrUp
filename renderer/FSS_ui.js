var api = window.api;

document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {

        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

        tab.classList.add("active");
        document.getElementById(tab.dataset.tab).classList.add("active");
    });
});

const syncDescriptions = {
    "two-way": "Two way description placeholder.",
    "mirror": "Mirror description placeholder.",
    "update": "Update description placeholder."
};

const deleteDescriptions = {
    "recycle": "Recycle bin description placeholder.",
    "permanent": "Permanent delete description placeholder.",
    "versioning": "Versioning description placeholder."
};

// SYNC DESCRIPTION
document.querySelectorAll('input[name="sync"]').forEach(radio => {
    radio.addEventListener("change", () => {
        document.getElementById("sync-description").textContent =
            syncDescriptions[radio.value];
    });
});

// DELETE DESCRIPTION + VERSION FOLDER INPUT
document.querySelectorAll('input[name="delete"]').forEach(radio => {
    radio.addEventListener("change", () => {
        document.getElementById("delete-description").textContent =
            deleteDescriptions[radio.value];

        const pathBlock = document.getElementById("versioning-path-container");

        if (radio.value === "versioning") {
            pathBlock.classList.remove("hidden");
        } else {
            pathBlock.classList.add("hidden");
        }
    });
});

window.addEventListener("DOMContentLoaded", async () => {

    const currentDraft = await window.api.getCurrentTaskDraft()

    const cancelBtn = document.getElementById("filter-cancel-btn");
    const defaultBtn = document.getElementById("filter-default-btn");
    const okBtn = document.getElementById("filter-ok-btn");

    if (cancelBtn) {
        cancelBtn.addEventListener("click", async () => {
            const currentDraft = await window.api.getCurrentTaskDraft();
            fillFSSUI(currentDraft);
            window.api.hideWindow("Comp_Filter_Synch_Sched");
        });
    }

    if (defaultBtn) {
        defaultBtn.addEventListener("click", async () => {
            const freshDraft = await window.api.getDefaultTaskDraft();
            fillFSSUI(freshDraft);
        });
    }

    if (okBtn) {
        okBtn.addEventListener("click", async () => {

            const updatedDraft = collectTaskDataFromUI("fss");

            await window.api.updateTaskDraft(updatedDraft);

            window.api.hideWindow("Comp_Filter_Synch_Sched");
        });
    }
});

window.api.onRefreshDraftUI(async () => {
    const draft = await window.api.getCurrentTaskDraft();
    fillFSSUI(draft);
});

function fillFSSUI(currentTaskDraft) {

    // =========================
    // DELETE METHOD
    // =========================
    const deleteRadio = document.querySelector(
        `input[name="delete"][value="${currentTaskDraft.delete_file_method || "recycle"}"]`
    );

    if (deleteRadio) {
        deleteRadio.checked = true;
    }

    // =========================
    // SYNC MODE
    // =========================
    const syncRadio = document.querySelector(
        `input[name="sync"][value="${currentTaskDraft.sync_mode || "two-way"}"]`
    );

    if (syncRadio) {
        syncRadio.checked = true;
    }

    // =========================
    // VERSIONING FOLDER
    // =========================
    const versionInput = document.getElementById("version-folder-path");
    if (versionInput) {
        versionInput.value = currentTaskDraft.versioning_folder || "";
    }

    // =========================
    // FILTERS
    // =========================
    const filters = currentTaskDraft.filter_settings || {};

    const includeInput = document.getElementById("filter-include");
    if (includeInput) {
        includeInput.value = toLines(filters.include);
    }

    const excludeInput = document.getElementById("filter-exclude");
    if (excludeInput) {
        excludeInput.value = toLines(filters.exclude);
    }

    const sizeMin = document.getElementById("size-min");
    if (sizeMin) {
        sizeMin.value = filters.size_min || 0;
    }

    const sizeMax = document.getElementById("size-max");
    if (sizeMax) {
        sizeMax.value = filters.size_max || 0;
    }

    // =========================
    // SCHEDULE
    // =========================
    const schedule = currentTaskDraft.schedule_settings || {};

    const enabled = document.getElementById("schedule-enabled");
    if (enabled) {
        enabled.checked = schedule.enabled || false;
    }

    const runValue = document.getElementById("run-every-value");
    const runUnit = document.getElementById("run-every-unit");

    if (schedule.run_every) {
        const numberPart = parseInt(schedule.run_every);
        const unitPart = schedule.run_every.slice(-1);

        if (runValue) {
            runValue.value = numberPart;
        }

        if (runUnit) {
            runUnit.value =
                unitPart === "m" ? "minutes" :
                    unitPart === "h" ? "hours" :
                        unitPart === "d" ? "days" :
                            "hours";
        }
    }

    const startTime = document.getElementById("start-time");
    if (startTime) {
        startTime.value = schedule.delay || "";
    }

    const ignoreEnabled = document.getElementById("ignore-span-enabled");
    if (ignoreEnabled) {
        ignoreEnabled.checked = schedule.ignore_time_span || false;
    }

    const fromInput = document.getElementById("ignore-from");
    const toInput = document.getElementById("ignore-to");

    if (fromInput) {
        fromInput.value = schedule.time_span?.[0] || "";
    }

    if (toInput) {
        toInput.value = schedule.time_span?.[1] || "";
    }
}

function toLines(value) {
    if (Array.isArray(value)) return value.join("\n");
    if (!value) return "";
    return String(value);
}