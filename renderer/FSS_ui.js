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

function setDefaultSettingsInUI() {
    console.log("set defaults");

    // FILTER
    const include = document.getElementById("filter-include");
    if (include) include.value = "*";

    const exclude = document.getElementById("filter-exclude");
    if (exclude) {
        exclude.value =
            `\\System Volume Information\\
            \\$Recycle.Bin\\
            \\RECYCLE?\\
            \\Recovery\\
            *thumbs.db`;
    }

    const sizeMin = document.getElementById("size-min");
    if (sizeMin) sizeMin.value = 0;

    const sizeMax = document.getElementById("size-max");
    if (sizeMax) sizeMax.value = 0;

    // SYNC MODE
    const syncMode = document.querySelector('input[name="sync"][value="two-way"]');
    if (syncMode) syncMode.checked = true;

    const syncDescription = document.getElementById("sync-description");
    if (syncDescription) {
        syncDescription.textContent = "Two way sync description placeholder.";
    }

    // DELETE MODE
    const deleteMode = document.querySelector('input[name="delete"][value="recycle"]');
    if (deleteMode) deleteMode.checked = true;

    const deleteDescription = document.getElementById("delete-description");
    if (deleteDescription) {
        deleteDescription.textContent = "Recycle bin description placeholder.";
    }

    const versionPath = document.getElementById("version-folder-path");
    if (versionPath) versionPath.value = "";

    const versionContainer = document.getElementById("versioning-path-container");
    if (versionContainer) versionContainer.classList.add("hidden");

    // SCHEDULE
    const scheduleEnabled = document.getElementById("schedule-enabled");
    if (scheduleEnabled) scheduleEnabled.checked = false;

    const runEveryValue = document.getElementById("run-every-value");
    if (runEveryValue) runEveryValue.value = 1;

    const runEveryUnit = document.getElementById("run-every-unit");
    if (runEveryUnit) runEveryUnit.value = "hours";

    const startTime = document.getElementById("start-time");
    if (startTime) startTime.value = "";

    const ignoreSpanEnabled = document.getElementById("ignore-span-enabled");
    if (ignoreSpanEnabled) ignoreSpanEnabled.checked = false;

    const ignoreFrom = document.getElementById("ignore-from");
    if (ignoreFrom) ignoreFrom.value = "";

    const ignoreTo = document.getElementById("ignore-to");
    if (ignoreTo) ignoreTo.value = "";
}

window.addEventListener("DOMContentLoaded", () => {
    setDefaultSettingsInUI();

    const cancelBtn = document.getElementById("filter-cancel-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", setDefaultSettingsInUI);
    }

    const defaultBtn = document.getElementById("filter-default-btn");
    if (defaultBtn) {
        defaultBtn.addEventListener("click", setDefaultSettingsInUI);
    }
});

