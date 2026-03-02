# Backup Engine (backend only)

## API

Backend methods are exposed in main process:

- `backup:preview` - builds a sync plan only (no file changes)
- `backup:run` - executes the sync plan

You can call these through preload:

- `window.purrupBackup.preview(config)`
- `window.purrupBackup.run(config)`

## Config format

```js
{
  leftDir: "C:/data/source",
  rightDir: "D:/data/backup",
  variant: "mirror", // mirror | update | twoWay | custom

  compare: {
    mode: "timeAndSize", // timeAndSize | content
    timeToleranceMs: 2000
  },

  filters: {
    include: ["**"], // glob-like patterns
    exclude: ["**/node_modules/**", "**/*.tmp"]
  },

  delete: {
    mode: "permanent", // permanent | versioning | recycleBin
    versioningDir: ".purrup-versioning" // optional for versioning mode
  },

  safety: {
    maxDeleteCount: 1000 // safety stop
  },

  twoWay: {
    stateFile: "D:/data/backup/.purrup-two-way-state.json", // optional
    conflictResolution: "newer" // newer | preferLeft | preferRight | skip
  },

  custom: {
    onlyLeft: "copyLeftToRight",
    onlyRight: "copyRightToLeft",
    leftNewer: "copyLeftToRight",
    rightNewer: "copyRightToLeft",
    different: "skip",
    equal: "skip"
  }
}
```

## FreeFileSync-like variants

- `mirror`: make right side exactly like left side (left -> right, extra files on right are removed)
- `update`: copy only new/updated files from left to right (no extra delete on right)
- `twoWay`: propagate changes from both sides using a state file from last sync
- `custom`: per-case action mapping

## Notes

- Symlinks are skipped with warnings.
- `recycleBin` uses Electron `shell.trashItem` when available; otherwise it falls back to permanent delete.
- In `twoWay`, first run without a state file behaves as initial merge and then creates state.
