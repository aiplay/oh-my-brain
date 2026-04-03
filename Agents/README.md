# Agents

External code repositories managed via the Oh My Brain plugin.

Each subdirectory represents an independent agent workspace:

```
Agents/
└── <alias>/
    └── CLAUDE.md  → symlink to external repo's CLAUDE.md
```

- Subdirectory name = agent alias
- Symlinks are created automatically by the plugin (symlink preferred; falls back to copy)
- Plugin configuration is stored in `.obsidian/plugins/oh-my-brain/data.json`

> **Note:** Contents of this directory are gitignored — each agent workspace is linked to an external repository and managed locally.
