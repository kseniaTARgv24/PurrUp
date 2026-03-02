const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const SUPPORTED_VARIANTS = new Set(["mirror", "update", "twoWay", "custom"]);
const SUPPORTED_COMPARE_MODES = new Set(["timeAndSize", "content"]);
const SUPPORTED_DELETE_MODES = new Set(["permanent", "versioning", "recycleBin"]);
const SUPPORTED_CONFLICT_RESOLUTION = new Set(["newer", "preferLeft", "preferRight", "skip"]);

const CUSTOM_ACTIONS = new Set([
    "copyLeftToRight",
    "copyRightToLeft",
    "deleteLeft",
    "deleteRight",
    "skip"
]);

async function previewBackup(userConfig) {
    const config = normalizeConfig(userConfig);
    const build = await buildPlan(config);
    return {
        ...build,
        dryRun: true
    };
}

async function runBackup(userConfig) {
    const config = normalizeConfig(userConfig);
    const build = await buildPlan(config);
    const execution = await executePlan(build.operations, config);

    const result = {
        ...build,
        dryRun: false,
        execution
    };

    if (config.variant === "twoWay" && execution.errors.length === 0) {
        const matcher = createMatcher(config.filters.include, config.filters.exclude);
        const [leftScan, rightScan] = await Promise.all([
            scanSide(config.leftDir, matcher),
            scanSide(config.rightDir, matcher)
        ]);
        const nextState = createTwoWayStateFromScans(leftScan, rightScan);
        const nextStateFile = resolveTwoWayStateFile(config);
        await saveTwoWayState(nextStateFile, nextState);
        result.stateFile = nextStateFile;
    }

    return result;
}

function normalizeConfig(userConfig = {}) {
    if (!userConfig || typeof userConfig !== "object") {
        throw new Error("Backup config must be an object.");
    }

    const leftDir = mustResolveDir(userConfig.leftDir, "leftDir");
    const rightDir = mustResolveDir(userConfig.rightDir, "rightDir");

    const variant = userConfig.variant ?? "mirror";
    if (!SUPPORTED_VARIANTS.has(variant)) {
        throw new Error(`Unsupported variant: "${variant}".`);
    }

    const compareMode = userConfig.compare?.mode ?? "timeAndSize";
    if (!SUPPORTED_COMPARE_MODES.has(compareMode)) {
        throw new Error(`Unsupported compare.mode: "${compareMode}".`);
    }

    const deleteMode = userConfig.delete?.mode ?? "permanent";
    if (!SUPPORTED_DELETE_MODES.has(deleteMode)) {
        throw new Error(`Unsupported delete.mode: "${deleteMode}".`);
    }

    const include = normalizePatternList(userConfig.filters?.include ?? ["**"]);
    const exclude = normalizePatternList(userConfig.filters?.exclude ?? []);

    const compare = {
        mode: compareMode,
        timeToleranceMs: numberOrDefault(userConfig.compare?.timeToleranceMs, 2000)
    };

    const deleteConfig = {
        mode: deleteMode,
        versioningDir: userConfig.delete?.versioningDir ?? null,
        recycleBinAdapter: typeof userConfig.delete?.recycleBinAdapter === "function"
            ? userConfig.delete.recycleBinAdapter
            : null
    };

    const safety = {
        maxDeleteCount: numberOrDefault(userConfig.safety?.maxDeleteCount, Number.POSITIVE_INFINITY)
    };

    const twoWay = {
        stateFile: userConfig.twoWay?.stateFile ?? null,
        conflictResolution: userConfig.twoWay?.conflictResolution ?? "newer"
    };

    if (!SUPPORTED_CONFLICT_RESOLUTION.has(twoWay.conflictResolution)) {
        throw new Error(`Unsupported twoWay.conflictResolution: "${twoWay.conflictResolution}".`);
    }

    const custom = normalizeCustomRules(userConfig.custom);

    return {
        leftDir,
        rightDir,
        variant,
        compare,
        delete: deleteConfig,
        filters: { include, exclude },
        safety,
        twoWay,
        custom
    };
}

function normalizeCustomRules(custom) {
    if (!custom) {
        return {
            onlyLeft: "copyLeftToRight",
            onlyRight: "copyRightToLeft",
            leftNewer: "copyLeftToRight",
            rightNewer: "copyRightToLeft",
            different: "skip",
            equal: "skip"
        };
    }

    const defaults = {
        onlyLeft: "copyLeftToRight",
        onlyRight: "copyRightToLeft",
        leftNewer: "copyLeftToRight",
        rightNewer: "copyRightToLeft",
        different: "skip",
        equal: "skip"
    };

    const output = { ...defaults };
    for (const key of Object.keys(defaults)) {
        const value = custom[key];
        if (value == null) {
            continue;
        }
        if (!CUSTOM_ACTIONS.has(value)) {
            throw new Error(`Invalid custom rule "${key}": "${value}".`);
        }
        output[key] = value;
    }
    return output;
}

function mustResolveDir(rawValue, key) {
    if (!rawValue || typeof rawValue !== "string") {
        throw new Error(`"${key}" must be a non-empty string.`);
    }
    return path.resolve(rawValue);
}

function numberOrDefault(value, fallback) {
    if (value == null) {
        return fallback;
    }
    const asNumber = Number(value);
    if (!Number.isFinite(asNumber) || asNumber < 0) {
        throw new Error(`Invalid numeric option: ${value}`);
    }
    return asNumber;
}

function normalizePatternList(input) {
    if (!Array.isArray(input)) {
        throw new Error("filters.include and filters.exclude must be arrays.");
    }
    return input
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => normalizePattern(entry));
}

function normalizePattern(pattern) {
    let out = pattern.replace(/\\/g, "/");
    if (out.startsWith("./")) {
        out = out.slice(2);
    }
    if (out.startsWith("/")) {
        out = out.slice(1);
    }
    if (!out.includes("/") && out !== "**") {
        out = `**/${out}`;
    }
    return out;
}

async function buildPlan(config) {
    await assertDirectory(config.leftDir, "leftDir");
    await assertDirectory(config.rightDir, "rightDir");

    const matcher = createMatcher(config.filters.include, config.filters.exclude);
    const [leftScan, rightScan] = await Promise.all([
        scanSide(config.leftDir, matcher),
        scanSide(config.rightDir, matcher)
    ]);

    const warnings = [...leftScan.warnings, ...rightScan.warnings];
    const state = await loadTwoWayStateIfNeeded(config);

    const context = {
        config,
        matcher,
        leftScan,
        rightScan,
        previousState: state?.map ?? new Map(),
        previousStateFile: state?.stateFile ?? resolveTwoWayStateFile(config)
    };

    const operations = await planOperations(context);
    const summary = summarizeOperations(operations);

    if (summary.deleteCount > config.safety.maxDeleteCount) {
        throw new Error(
            `Safety stop: planned delete count (${summary.deleteCount}) exceeds maxDeleteCount (${config.safety.maxDeleteCount}).`
        );
    }

    return {
        config: serializeConfigForResult(config),
        summary,
        warnings,
        operations,
        nextStateFile: config.variant === "twoWay" ? context.previousStateFile : null
    };
}

async function assertDirectory(absPath, key) {
    let stat;
    try {
        stat = await fsp.stat(absPath);
    } catch (error) {
        throw new Error(`"${key}" does not exist: ${absPath}`);
    }
    if (!stat.isDirectory()) {
        throw new Error(`"${key}" is not a directory: ${absPath}`);
    }
}

function serializeConfigForResult(config) {
    return {
        leftDir: config.leftDir,
        rightDir: config.rightDir,
        variant: config.variant,
        compare: {
            mode: config.compare.mode,
            timeToleranceMs: config.compare.timeToleranceMs
        },
        delete: {
            mode: config.delete.mode,
            versioningDir: config.delete.versioningDir
        },
        filters: {
            include: [...config.filters.include],
            exclude: [...config.filters.exclude]
        },
        safety: {
            maxDeleteCount: config.safety.maxDeleteCount
        },
        twoWay: {
            stateFile: config.twoWay.stateFile,
            conflictResolution: config.twoWay.conflictResolution
        },
        custom: { ...config.custom }
    };
}

function createMatcher(includePatterns, excludePatterns) {
    const includeRegex = includePatterns.map((pattern) => compilePattern(pattern));
    const excludeRegex = excludePatterns.map((pattern) => compilePattern(pattern));

    return {
        include(relPath, isDirectory) {
            if (isDirectory) {
                return !matchesAny(excludeRegex, relPath, true);
            }
            if (matchesAny(excludeRegex, relPath, false)) {
                return false;
            }
            if (includeRegex.length === 0) {
                return true;
            }
            return matchesAny(includeRegex, relPath, false);
        }
    };
}

function compilePattern(pattern) {
    const normalized = normalizePattern(pattern);
    let regexBody = "";
    for (let i = 0; i < normalized.length; i += 1) {
        if (normalized.slice(i, i + 3) === "**/") {
            regexBody += "(?:.*/)?";
            i += 2;
            continue;
        }

        if (normalized.slice(i, i + 2) === "**") {
            regexBody += ".*";
            i += 1;
            continue;
        }

        const char = normalized[i];
        if (char === "*") {
            regexBody += "[^/]*";
            continue;
        }
        if (char === "?") {
            regexBody += "[^/]";
            continue;
        }
        if ("\\.[]{}()+-^$|".includes(char)) {
            regexBody += `\\${char}`;
        } else {
            regexBody += char;
        }
    }
    return new RegExp(`^${regexBody}$`, "i");
}

function matchesAny(regexList, relPath, isDirectory) {
    const normalized = normalizeRelPath(relPath);
    if (regexList.length === 0) {
        return false;
    }
    if (isDirectory) {
        const candidate = normalized.endsWith("/") ? normalized : `${normalized}/`;
        return regexList.some((regex) => regex.test(normalized) || regex.test(candidate));
    }
    return regexList.some((regex) => regex.test(normalized));
}

async function scanSide(rootDir, matcher) {
    const files = new Map();
    const warnings = [];

    async function walk(relativeDir) {
        const absoluteDir = path.join(rootDir, relativeDir);
        const items = await fsp.readdir(absoluteDir, { withFileTypes: true });
        for (const item of items) {
            const relPath = normalizeRelPath(path.join(relativeDir, item.name));
            const absPath = path.join(rootDir, relPath);

            if (item.isSymbolicLink()) {
                warnings.push(`Skipped symlink: ${absPath}`);
                continue;
            }

            if (item.isDirectory()) {
                if (!matcher.include(relPath, true)) {
                    continue;
                }
                await walk(relPath);
                continue;
            }

            if (!item.isFile()) {
                warnings.push(`Skipped unsupported item type: ${absPath}`);
                continue;
            }

            if (!matcher.include(relPath, false)) {
                continue;
            }

            const stat = await fsp.stat(absPath);
            files.set(relPath, {
                relPath,
                absPath,
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                hash: null
            });
        }
    }

    await walk("");
    return { rootDir, files, warnings };
}

function normalizeRelPath(input) {
    if (!input) {
        return "";
    }
    return input.split(path.sep).join("/");
}

function allFilePaths(leftScan, rightScan, previousState) {
    const set = new Set();
    for (const key of leftScan.files.keys()) {
        set.add(key);
    }
    for (const key of rightScan.files.keys()) {
        set.add(key);
    }
    for (const key of previousState.keys()) {
        set.add(key);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

async function planOperations(context) {
    const { config, leftScan, rightScan } = context;
    const paths = allFilePaths(leftScan, rightScan, context.previousState);
    const operations = [];

    for (const relPath of paths) {
        const left = leftScan.files.get(relPath) ?? null;
        const right = rightScan.files.get(relPath) ?? null;
        const fileDiff = await describeDifference(left, right, config.compare);

        if (config.variant === "mirror") {
            pushMirrorOps(operations, relPath, fileDiff);
            continue;
        }

        if (config.variant === "update") {
            pushUpdateOps(operations, relPath, fileDiff);
            continue;
        }

        if (config.variant === "custom") {
            pushCustomOps(operations, relPath, fileDiff, config.custom);
            continue;
        }

        if (config.variant === "twoWay") {
            pushTwoWayOps(operations, relPath, fileDiff, context.previousState, config.twoWay.conflictResolution);
        }
    }

    return compactOperations(operations);
}

async function describeDifference(left, right, compareConfig) {
    if (!left && !right) {
        return { kind: "missingBoth", left, right };
    }

    if (left && !right) {
        return { kind: "onlyLeft", left, right };
    }

    if (!left && right) {
        return { kind: "onlyRight", left, right };
    }

    const equal = await areFilesEqual(left, right, compareConfig);
    if (equal) {
        return { kind: "equal", left, right };
    }

    const tolerance = compareConfig.timeToleranceMs;
    if (left.mtimeMs > right.mtimeMs + tolerance) {
        return { kind: "leftNewer", left, right };
    }
    if (right.mtimeMs > left.mtimeMs + tolerance) {
        return { kind: "rightNewer", left, right };
    }
    return { kind: "different", left, right };
}

async function areFilesEqual(left, right, compareConfig) {
    if (!left || !right) {
        return false;
    }
    if (left.size !== right.size) {
        return false;
    }
    if (compareConfig.mode === "timeAndSize") {
        return Math.abs(left.mtimeMs - right.mtimeMs) <= compareConfig.timeToleranceMs;
    }
    const [leftHash, rightHash] = await Promise.all([hashFile(left), hashFile(right)]);
    return leftHash === rightHash;
}

async function hashFile(fileEntry) {
    if (fileEntry.hash) {
        return fileEntry.hash;
    }
    fileEntry.hash = await new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(fileEntry.absPath);
        stream.on("error", reject);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
    });
    return fileEntry.hash;
}

function pushMirrorOps(operations, relPath, diff) {
    if (diff.kind === "onlyLeft") {
        operations.push(copyOp(relPath, "leftToRight", "only-in-left"));
        return;
    }
    if (diff.kind === "onlyRight") {
        operations.push(deleteOp(relPath, "right", "mirror-remove-extra-right"));
        return;
    }
    if (diff.kind === "leftNewer" || diff.kind === "rightNewer" || diff.kind === "different") {
        operations.push(copyOp(relPath, "leftToRight", "mirror-overwrite-right"));
    }
}

function pushUpdateOps(operations, relPath, diff) {
    if (diff.kind === "onlyLeft") {
        operations.push(copyOp(relPath, "leftToRight", "new-on-left"));
        return;
    }
    if (diff.kind === "leftNewer" || diff.kind === "different") {
        operations.push(copyOp(relPath, "leftToRight", "left-is-newer"));
    }
}

function pushCustomOps(operations, relPath, diff, rules) {
    const rule = ({
        onlyLeft: rules.onlyLeft,
        onlyRight: rules.onlyRight,
        leftNewer: rules.leftNewer,
        rightNewer: rules.rightNewer,
        different: rules.different,
        equal: rules.equal,
        missingBoth: "skip"
    })[diff.kind] ?? "skip";

    if (rule === "skip") {
        operations.push(skipOp(relPath, `custom-skip-${diff.kind}`));
        return;
    }
    if (rule === "copyLeftToRight") {
        operations.push(copyOp(relPath, "leftToRight", `custom-${diff.kind}`));
        return;
    }
    if (rule === "copyRightToLeft") {
        operations.push(copyOp(relPath, "rightToLeft", `custom-${diff.kind}`));
        return;
    }
    if (rule === "deleteLeft") {
        operations.push(deleteOp(relPath, "left", `custom-${diff.kind}`));
        return;
    }
    if (rule === "deleteRight") {
        operations.push(deleteOp(relPath, "right", `custom-${diff.kind}`));
    }
}

function pushTwoWayOps(operations, relPath, diff, previousStateMap, conflictResolution) {
    const previous = previousStateMap.get(relPath) ?? { left: null, right: null };
    const current = {
        left: signatureFromFile(diff.left),
        right: signatureFromFile(diff.right)
    };

    const leftChanged = signatureChanged(previous.left, current.left);
    const rightChanged = signatureChanged(previous.right, current.right);

    if (!leftChanged && !rightChanged) {
        return;
    }

    if (leftChanged && !rightChanged) {
        applyTwoWayPropagation(operations, relPath, "leftToRight", diff, "left-only-change");
        return;
    }

    if (!leftChanged && rightChanged) {
        applyTwoWayPropagation(operations, relPath, "rightToLeft", diff, "right-only-change");
        return;
    }

    if (diff.kind === "equal" || (diff.kind === "missingBoth")) {
        return;
    }

    if (conflictResolution === "preferLeft") {
        applyTwoWayPropagation(operations, relPath, "leftToRight", diff, "conflict-prefer-left");
        return;
    }

    if (conflictResolution === "preferRight") {
        applyTwoWayPropagation(operations, relPath, "rightToLeft", diff, "conflict-prefer-right");
        return;
    }

    if (conflictResolution === "newer") {
        if (diff.kind === "leftNewer") {
            applyTwoWayPropagation(operations, relPath, "leftToRight", diff, "conflict-newer-left");
            return;
        }
        if (diff.kind === "rightNewer") {
            applyTwoWayPropagation(operations, relPath, "rightToLeft", diff, "conflict-newer-right");
            return;
        }
    }

    operations.push(conflictOp(relPath, `two-way-conflict:${diff.kind}`));
}

function applyTwoWayPropagation(operations, relPath, direction, diff, reason) {
    const sourceExists = direction === "leftToRight" ? !!diff.left : !!diff.right;
    if (sourceExists) {
        operations.push(copyOp(relPath, direction, reason));
    } else {
        const side = direction === "leftToRight" ? "right" : "left";
        operations.push(deleteOp(relPath, side, `${reason}-propagate-delete`));
    }
}

function compactOperations(operations) {
    const output = [];
    for (const op of operations) {
        if (op.type === "skip") {
            continue;
        }
        output.push(op);
    }
    return output;
}

function copyOp(relPath, direction, reason) {
    return {
        type: "copy",
        relPath,
        direction,
        reason
    };
}

function deleteOp(relPath, side, reason) {
    return {
        type: "delete",
        relPath,
        side,
        reason
    };
}

function skipOp(relPath, reason) {
    return {
        type: "skip",
        relPath,
        reason
    };
}

function conflictOp(relPath, reason) {
    return {
        type: "conflict",
        relPath,
        reason
    };
}

function summarizeOperations(operations) {
    const summary = {
        total: operations.length,
        copyLeftToRight: 0,
        copyRightToLeft: 0,
        deleteLeft: 0,
        deleteRight: 0,
        conflicts: 0,
        deleteCount: 0
    };

    for (const op of operations) {
        if (op.type === "copy" && op.direction === "leftToRight") {
            summary.copyLeftToRight += 1;
        } else if (op.type === "copy" && op.direction === "rightToLeft") {
            summary.copyRightToLeft += 1;
        } else if (op.type === "delete" && op.side === "left") {
            summary.deleteLeft += 1;
            summary.deleteCount += 1;
        } else if (op.type === "delete" && op.side === "right") {
            summary.deleteRight += 1;
            summary.deleteCount += 1;
        } else if (op.type === "conflict") {
            summary.conflicts += 1;
        }
    }

    return summary;
}

async function executePlan(operations, config) {
    const executed = [];
    const errors = [];
    const warnings = [];

    for (const op of operations) {
        if (op.type === "conflict") {
            warnings.push(`Skipped conflict: ${op.relPath} (${op.reason})`);
            continue;
        }

        try {
            if (op.type === "copy") {
                await executeCopy(op, config);
                executed.push(op);
                continue;
            }
            if (op.type === "delete") {
                await executeDelete(op, config);
                executed.push(op);
            }
        } catch (error) {
            errors.push({
                operation: op,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    return {
        executedCount: executed.length,
        errorCount: errors.length,
        warningCount: warnings.length,
        executed,
        errors,
        warnings
    };
}

async function executeCopy(op, config) {
    const sourceBase = op.direction === "leftToRight" ? config.leftDir : config.rightDir;
    const targetBase = op.direction === "leftToRight" ? config.rightDir : config.leftDir;
    const targetSide = op.direction === "leftToRight" ? "right" : "left";
    const sourcePath = path.join(sourceBase, op.relPath);
    const targetPath = path.join(targetBase, op.relPath);

    await ensureParentDirectory(path.dirname(targetPath), targetSide, config);
    await removeTargetIfNotFile(targetPath, targetSide, config, op.relPath);
    await fsp.copyFile(sourcePath, targetPath);

    const srcStat = await fsp.stat(sourcePath);
    await fsp.utimes(targetPath, srcStat.atime, srcStat.mtime);
}

async function executeDelete(op, config) {
    const base = op.side === "left" ? config.leftDir : config.rightDir;
    const targetPath = path.join(base, op.relPath);
    await deletePath(targetPath, op.side, config, op.relPath);
}

async function removeTargetIfNotFile(targetPath, side, config, relPath) {
    try {
        const stat = await fsp.lstat(targetPath);
        if (stat.isFile()) {
            return;
        }
        await deletePath(targetPath, side, config, relPath);
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return;
        }
        throw error;
    }
}

async function ensureParentDirectory(dirPath, side, config) {
    const baseDir = side === "left" ? config.leftDir : config.rightDir;
    const resolved = path.resolve(dirPath);
    const relativeToBase = path.relative(baseDir, resolved);

    if (relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
        await fsp.mkdir(resolved, { recursive: true });
        return;
    }

    let current = baseDir;
    const segments = normalizeRelPath(relativeToBase).split("/").filter(Boolean);

    for (const segment of segments) {
        current = path.join(current, segment);
        try {
            const stat = await fsp.lstat(current);
            if (!stat.isDirectory()) {
                const relPath = normalizeRelPath(path.relative(baseDir, current));
                await deletePath(current, side, config, relPath);
            } else {
                continue;
            }
        } catch (error) {
            if (!(error && error.code === "ENOENT")) {
                throw error;
            }
        }

        try {
            await fsp.mkdir(current);
        } catch (error) {
            if (!(error && error.code === "EEXIST")) {
                throw error;
            }
        }
    }
}

async function deletePath(absPath, side, config, relPath) {
    try {
        await fsp.lstat(absPath);
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return;
        }
        throw error;
    }

    if (config.delete.mode === "permanent") {
        await fsp.rm(absPath, { recursive: true, force: true });
        return;
    }

    if (config.delete.mode === "versioning") {
        const destination = await resolveVersioningDestination(absPath, relPath, side, config);
        await movePath(absPath, destination);
        return;
    }

    if (config.delete.mode === "recycleBin") {
        await recycleBinDelete(absPath, config.delete.recycleBinAdapter);
        return;
    }

    throw new Error(`Unknown delete mode: ${config.delete.mode}`);
}

async function resolveVersioningDestination(absPath, relPath, side, config) {
    const versioningRoot = resolveVersioningRoot(side, config);
    const stamp = makeTimestamp();
    const relativePart = relPath ? normalizeRelPath(relPath) : path.basename(absPath);
    const destination = path.join(versioningRoot, `${relativePart}.${stamp}.bak`);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    return destination;
}

function resolveVersioningRoot(side, config) {
    const raw = config.delete.versioningDir;
    if (!raw) {
        const base = side === "left" ? config.leftDir : config.rightDir;
        return path.join(base, ".purrup-versioning");
    }

    if (typeof raw === "string") {
        if (path.isAbsolute(raw)) {
            return raw;
        }
        const base = side === "left" ? config.leftDir : config.rightDir;
        return path.join(base, raw);
    }

    if (typeof raw === "object") {
        const pick = raw[side];
        if (!pick || typeof pick !== "string") {
            throw new Error(`delete.versioningDir.${side} must be a string when object format is used.`);
        }
        return path.isAbsolute(pick) ? pick : path.join(side === "left" ? config.leftDir : config.rightDir, pick);
    }

    throw new Error("delete.versioningDir must be string or { left, right }.");
}

function makeTimestamp() {
    const date = new Date();
    const yyyy = String(date.getFullYear());
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function movePath(source, destination) {
    try {
        await fsp.rename(source, destination);
    } catch (error) {
        if (!(error && error.code === "EXDEV")) {
            throw error;
        }
        await fsp.cp(source, destination, { recursive: true, force: true });
        await fsp.rm(source, { recursive: true, force: true });
    }
}

async function recycleBinDelete(absPath, adapter) {
    if (adapter) {
        await adapter(absPath);
        return;
    }

    try {
        const electron = require("electron");
        if (electron && electron.shell && typeof electron.shell.trashItem === "function") {
            await electron.shell.trashItem(absPath);
            return;
        }
    } catch (error) {
        // Ignore and fallback to permanent delete.
    }

    await fsp.rm(absPath, { recursive: true, force: true });
}

async function loadTwoWayStateIfNeeded(config) {
    if (config.variant !== "twoWay") {
        return null;
    }

    const stateFile = resolveTwoWayStateFile(config);
    let parsed;
    try {
        const raw = await fsp.readFile(stateFile, "utf8");
        parsed = JSON.parse(raw);
    } catch (error) {
        if (error && (error.code === "ENOENT" || error.name === "SyntaxError")) {
            return { stateFile, map: new Map() };
        }
        throw error;
    }

    const map = new Map();
    const entries = parsed && typeof parsed === "object" ? parsed.paths : null;
    if (entries && typeof entries === "object") {
        for (const [relPath, value] of Object.entries(entries)) {
            map.set(relPath, {
                left: normalizeStoredSignature(value?.left),
                right: normalizeStoredSignature(value?.right)
            });
        }
    }

    return { stateFile, map };
}

function normalizeStoredSignature(input) {
    if (!input || typeof input !== "object") {
        return null;
    }
    if (input.type !== "file") {
        return null;
    }
    return {
        type: "file",
        size: Number(input.size) || 0,
        mtimeMs: Number(input.mtimeMs) || 0
    };
}

function resolveTwoWayStateFile(config) {
    if (config.twoWay.stateFile) {
        return path.resolve(config.twoWay.stateFile);
    }
    return path.join(config.rightDir, ".purrup-two-way-state.json");
}

function createTwoWayStateFromScans(leftScan, rightScan) {
    const paths = new Set([...leftScan.files.keys(), ...rightScan.files.keys()]);
    const output = {};
    for (const relPath of [...paths].sort((a, b) => a.localeCompare(b))) {
        output[relPath] = {
            left: signatureFromFile(leftScan.files.get(relPath) ?? null),
            right: signatureFromFile(rightScan.files.get(relPath) ?? null)
        };
    }
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        paths: output
    };
}

function signatureFromFile(file) {
    if (!file) {
        return null;
    }
    return {
        type: "file",
        size: file.size,
        mtimeMs: file.mtimeMs
    };
}

function signatureChanged(previous, current) {
    if (!previous && !current) {
        return false;
    }
    if (!previous || !current) {
        return true;
    }
    return (
        previous.type !== current.type ||
        previous.size !== current.size ||
        previous.mtimeMs !== current.mtimeMs
    );
}

async function saveTwoWayState(stateFile, state) {
    await fsp.mkdir(path.dirname(stateFile), { recursive: true });
    await fsp.writeFile(stateFile, JSON.stringify(state, null, 2), "utf8");
}

module.exports = {
    previewBackup,
    runBackup
};
