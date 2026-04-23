window.addEventListener("DOMContentLoaded", () => {
    window.collectTaskDataFromUI = function (source) {
        const data = {};

        // =========================
        // TASK EDITOR ONLY
        // =========================
        if (source === "taskEditor") {
            data.taskName =
                document.querySelector(".task-name")?.value?.trim() || "";

            const pathInputs =
                document.querySelectorAll(".path-block .path-input");

            data.dir1 = pathInputs[0]?.value?.trim() || "";
            data.dir2 = pathInputs[1]?.value?.trim() || "";

            return data;
        }

        // =========================
        // FSS ONLY
        // =========================
        if (source === "fss") {
            data.delete_file_method =
                document.querySelector('input[name="delete"]:checked')?.value
                || "recycle";

            data.sync_mode =
                document.querySelector('input[name="sync"]:checked')?.value
                || "two-way";

            data.versioning_folder =
                document.getElementById("version-folder-path")?.value?.trim() || "";

            data.filter_settings = {
                include: (
                    document.getElementById("filter-include")?.value || ""
                )
                    .split("\n")
                    .map(s => s.trim())
                    .filter(Boolean),

                exclude: (
                    document.getElementById("filter-exclude")?.value || ""
                )
                    .split("\n")
                    .map(s => s.trim())
                    .filter(Boolean),

                size_min:
                    Number(document.getElementById("size-min")?.value) || 0,

                size_max:
                    Number(document.getElementById("size-max")?.value) || 0
            };

            data.schedule_settings = {
                enabled:
                    document.getElementById("schedule-enabled")?.checked || false,

                run_every:
                    `${document.getElementById("run-every-value")?.value || 1}${(document.getElementById("run-every-unit")?.value || "hours")[0]}`,

                delay:
                    document.getElementById("start-time")?.value || null,

                ignore_time_span:
                    document.getElementById("ignore-span-enabled")?.checked || false,

                time_span: [
                    document.getElementById("ignore-from")?.value || "",
                    document.getElementById("ignore-to")?.value || ""
                ].filter(Boolean)
            };

            return data;
        }

        return {};
    };
});