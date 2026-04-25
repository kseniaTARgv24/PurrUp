# PurrUp

PurrUp is a desktop backup application built with Electron and JavaScript.  
It is designed to provide a simple but visually appealing way to compare folders, create backup tasks, configure synchronization settings, and run backups manually or on a schedule.

## Main features

- Folder comparison between source and target directories
- Three backup modes:
  - Two way
  - Mirror
  - Update
- Three file deletion methods:
  - Recycle bin
  - Permanent delete
  - Versioning
- Task-based configuration
- Include / exclude filters
- Minimum and maximum file size filters
- Backup scheduling
- JSON-based task settings storage
- Desktop widget for quick task access

## Tech stack

- Electron
- JavaScript
- HTML / CSS
- Tailwind CSS
- JSON for task settings storage

## Project structure

```text
PurrUp/
├── data/
├── renderer/
│   ├── assets/ widjetUI/
│   ├── js/
│   └── styles/
├── .gitignore
├── BackUp_engine.js
├── README.md
├── main.js
├── package-lock.json
├── package.json
├── preload.js
├── styles.css
└── tailwind.config.js
