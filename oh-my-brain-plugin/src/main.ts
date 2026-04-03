import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  Modal,
  Notice,
  TFolder,
  normalizePath,
  setIcon,
  WorkspaceLeaf,
  debounce,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";

// ── Types ────────────────────────────────────────────────────────────

interface ExternalAgent {
  id: string;
  alias: string;
  repoPath: string;
}

interface FolderColor {
  path: string;
  color: string;
  cascade: boolean;
}

interface OhMyBrainSettings {
  agents: ExternalAgent[];
  agentsRootFolder: string;
  useSharedColors: boolean;
  folderColors: FolderColor[]; // user overrides only
}

const DEFAULT_SETTINGS: OhMyBrainSettings = {
  agents: [],
  agentsRootFolder: "Agents",
  useSharedColors: true,
  folderColors: [],
};

// ── Preset Colors ────────────────────────────────────────────────────

const PRESET_COLORS: { label: string; value: string }[] = [
  // Reds
  { label: "Red", value: "#e03e3e" },
  { label: "Coral", value: "#ff6b6b" },
  { label: "Rose", value: "#e8457c" },
  // Oranges
  { label: "Orange", value: "#d9730d" },
  { label: "Tangerine", value: "#f08c00" },
  { label: "Peach", value: "#ff922b" },
  // Yellows
  { label: "Yellow", value: "#dfab01" },
  { label: "Gold", value: "#f59f00" },
  { label: "Amber", value: "#fab005" },
  // Greens
  { label: "Green", value: "#0f7b6c" },
  { label: "Emerald", value: "#2b8a3e" },
  { label: "Lime", value: "#5c940d" },
  { label: "Mint", value: "#20c997" },
  // Blues
  { label: "Blue", value: "#2672c0" },
  { label: "Sky", value: "#1c7ed6" },
  { label: "Cyan", value: "#0ca678" },
  { label: "Navy", value: "#364fc7" },
  // Purples
  { label: "Purple", value: "#9065b0" },
  { label: "Violet", value: "#7048e8" },
  { label: "Indigo", value: "#5f3dc4" },
  { label: "Lavender", value: "#ae3ec9" },
  // Pinks
  { label: "Pink", value: "#c14c8a" },
  { label: "Magenta", value: "#d6336c" },
  { label: "Fuchsia", value: "#e64980" },
  // Neutrals
  { label: "Gray", value: "#787774" },
  { label: "Slate", value: "#495057" },
  { label: "Brown", value: "#8b6508" },
];

// ── Utility ──────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getVaultAbsolutePath(app: App): string {
  return (app.vault.adapter as any).basePath as string;
}

const SHARED_COLORS_FILE = "oh-my-brain-plugin/folder-colors.json";

// ── Main Plugin ──────────────────────────────────────────────────────

export default class OhMyBrainPlugin extends Plugin {
  settings: OhMyBrainSettings = DEFAULT_SETTINGS;
  private debouncedApplyColors = debounce(() => this.applyColorStyles(), 50, true);

  async onload() {
    await this.loadSettings();
    this.migrateAgentColors();
    this.hidePluginSourceFolder();

    this.app.workspace.onLayoutReady(() => this.applyColorStyles());

    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.debouncedApplyColors())
    );

    // ── Commands ──
    this.addCommand({
      id: "add-external-agent",
      name: "Add External Agent",
      callback: () => new AddAgentModal(this.app, this, null).open(),
    });

    this.addCommand({
      id: "sync-all-agents",
      name: "Sync all agent CLAUDE.md files",
      callback: () => this.syncAllAgents(),
    });

    this.addSettingTab(new OhMyBrainSettingTab(this.app, this));

    // ── Right-click menu on ANY folder ──
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFolder)) return;

        const folderPath = file.path;

        menu.addItem((item) => {
          item
            .setTitle("Set folder color")
            .setIcon("palette")
            .onClick(() => new FolderColorModal(this.app, this, folderPath).open());
        });

        const hasUserOverride = this.settings.folderColors.find(
          (fc) => fc.path === folderPath
        );
        if (hasUserOverride) {
          menu.addItem((item) => {
            item
              .setTitle("Reset folder color")
              .setIcon("x")
              .onClick(async () => {
                await this.removeFolderColor(folderPath);
                new Notice(`Color override removed from "${file.name}".`);
              });
          });
        }

        const agent = this.findAgentByFolder(folderPath);
        if (agent) {
          menu.addItem((item) => {
            item
              .setTitle("Sync CLAUDE.md")
              .setIcon("refresh-cw")
              .onClick(() => this.syncAgent(agent));
          });
        }
      })
    );
  }

  onunload() {
    this.clearAllInlineStyles();
  }

  /** Auto-hide oh-my-brain-plugin folder from Obsidian file explorer via CSS */
  hidePluginSourceFolder() {
    const styleId = "omb-hide-plugin-source";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        [data-path="oh-my-brain-plugin"], [data-path^="oh-my-brain-plugin/"],
        [data-path="assets"], [data-path^="assets/"]
        { display: none !important; }
      `;
      document.head.appendChild(style);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (!Array.isArray(this.settings.folderColors)) {
      this.settings.folderColors = [];
    }
    if (typeof this.settings.useSharedColors !== "boolean") {
      this.settings.useSharedColors = true;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applyColorStyles();
  }

  /** Load shared colors from oh-my-brain-plugin/folder-colors.json */
  async loadSharedColors(): Promise<FolderColor[]> {
    try {
      const content = await this.app.vault.adapter.read(SHARED_COLORS_FILE);
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (fc: any) => fc.path && fc.color && typeof fc.cascade === "boolean"
        );
      }
    } catch {
      // File doesn't exist or invalid JSON
    }
    return [];
  }

  /** Save shared colors to oh-my-brain-plugin/folder-colors.json */
  async saveSharedColors(colors: FolderColor[]) {
    const content = JSON.stringify(colors, null, 2) + "\n";
    await this.app.vault.adapter.write(SHARED_COLORS_FILE, content);
  }

  /**
   * Merge shared + user override colors.
   * User overrides win per-path. If useSharedColors is false, only user colors.
   */
  async getMergedFolderColors(): Promise<FolderColor[]> {
    const userColors = this.settings.folderColors;

    if (!this.settings.useSharedColors) {
      return [...userColors];
    }

    const shared = await this.loadSharedColors();
    const userPaths = new Set(userColors.map((fc) => fc.path));

    // Shared entries not overridden by user
    const fromShared = shared.filter((fc) => !userPaths.has(fc.path));

    return [...fromShared, ...userColors];
  }

  /**
   * Check if a folder's color comes from shared config or user override.
   * Returns "shared" | "user" | null
   */
  getColorSource(folderPath: string, sharedColors: FolderColor[]): "shared" | "user" | null {
    const inUser = this.settings.folderColors.some((fc) => fc.path === folderPath);
    if (inUser) return "user";
    const inShared = sharedColors.some((fc) => fc.path === folderPath);
    if (inShared) return "shared";
    return null;
  }

  /** Migrate old agent.color fields → folderColors */
  migrateAgentColors() {
    let changed = false;
    for (const agent of this.settings.agents) {
      const agentAny = agent as any;
      if (agentAny.color) {
        const fp = normalizePath(`${this.settings.agentsRootFolder}/${agent.alias}`);
        if (!this.settings.folderColors.find((fc) => fc.path === fp)) {
          this.settings.folderColors.push({ path: fp, color: agentAny.color, cascade: true });
        }
        delete agentAny.color;
        changed = true;
      }
    }
    if (changed) this.saveData(this.settings);
  }

  // ── Folder Color System ───────────────────────────────────────────

  applyColorStyles() {
    // Use async merged colors
    this.getMergedFolderColors().then((mergedColors) => {
      const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");

      const directColors = new Map<string, FolderColor>();
      const cascadeColors: FolderColor[] = [];
      for (const fc of mergedColors) {
        directColors.set(fc.path, fc);
        if (fc.cascade) cascadeColors.push(fc);
      }

    fileExplorers.forEach((leaf: WorkspaceLeaf) => {
      const fileItems = (leaf.view as any).fileItems as
        | Record<string, { el: HTMLElement }>
        | undefined;
      if (!fileItems) return;

      Object.entries(fileItems).forEach(([itemPath, fileItem]) => {
        const el = fileItem.el;

        let matched: FolderColor | undefined = directColors.get(itemPath);
        if (!matched) {
          for (const fc of cascadeColors) {
            if (itemPath.startsWith(fc.path + "/")) {
              matched = fc;
              break;
            }
          }
        }

        const titleEl = (
          el.querySelector(":scope > .nav-folder-title") ??
          el.querySelector(":scope > .nav-file-title")
        ) as HTMLElement | null;
        if (!titleEl) return;

        if (matched) {
          const c = matched.color;
          const r = parseInt(c.slice(1, 3), 16);
          const g = parseInt(c.slice(3, 5), 16);
          const b = parseInt(c.slice(5, 7), 16);

          titleEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
          titleEl.style.borderRadius = "4px";

          const contentEl = titleEl.querySelector(
            ".nav-folder-title-content, .nav-file-title-content"
          ) as HTMLElement | null;
          if (contentEl) contentEl.style.color = c;

          const icon = titleEl.querySelector(
            ".nav-folder-collapse-indicator svg"
          ) as HTMLElement | null;
          if (icon) icon.style.color = c;
        } else {
          titleEl.style.backgroundColor = "";
          titleEl.style.borderRadius = "";
          const contentEl = titleEl.querySelector(
            ".nav-folder-title-content, .nav-file-title-content"
          ) as HTMLElement | null;
          if (contentEl) contentEl.style.color = "";
          const icon = titleEl.querySelector(
            ".nav-folder-collapse-indicator svg"
          ) as HTMLElement | null;
          if (icon) icon.style.color = "";
        }
      });
    });
    }); // end getMergedFolderColors().then
  }

  clearAllInlineStyles() {
    const fileExplorers = this.app.workspace.getLeavesOfType("file-explorer");
    fileExplorers.forEach((leaf: WorkspaceLeaf) => {
      const fileItems = (leaf.view as any).fileItems as
        | Record<string, { el: HTMLElement }>
        | undefined;
      if (!fileItems) return;
      Object.values(fileItems).forEach((fileItem) => {
        const el = fileItem.el;
        const titleEl = (
          el.querySelector(":scope > .nav-folder-title") ??
          el.querySelector(":scope > .nav-file-title")
        ) as HTMLElement | null;
        if (!titleEl) return;
        titleEl.style.backgroundColor = "";
        titleEl.style.borderRadius = "";
        const contentEl = titleEl.querySelector(
          ".nav-folder-title-content, .nav-file-title-content"
        ) as HTMLElement | null;
        if (contentEl) contentEl.style.color = "";
        const icon = titleEl.querySelector(
          ".nav-folder-collapse-indicator svg"
        ) as HTMLElement | null;
        if (icon) icon.style.color = "";
      });
    });
  }

  // ── Folder Color CRUD ─────────────────────────────────────────────

  /** Get effective color (user override or shared). Async because shared is on disk. */
  async getEffectiveFolderColor(folderPath: string): Promise<FolderColor | undefined> {
    const user = this.settings.folderColors.find((fc) => fc.path === folderPath);
    if (user) return user;
    if (this.settings.useSharedColors) {
      const shared = await this.loadSharedColors();
      return shared.find((fc) => fc.path === folderPath);
    }
    return undefined;
  }

  async setFolderColor(folderPath: string, color: string, cascade: boolean) {
    const existing = this.settings.folderColors.find((fc) => fc.path === folderPath);
    if (existing) {
      existing.color = color;
      existing.cascade = cascade;
    } else {
      this.settings.folderColors.push({ path: folderPath, color, cascade });
    }
    await this.saveSettings();
  }

  async removeFolderColor(folderPath: string) {
    this.settings.folderColors = this.settings.folderColors.filter(
      (fc) => fc.path !== folderPath
    );
    await this.saveSettings();
  }

  // ── Agent Operations ─────────────────────────────────────────────

  findAgentByFolder(folderPath: string): ExternalAgent | undefined {
    return this.settings.agents.find((a) => {
      const expected = normalizePath(`${this.settings.agentsRootFolder}/${a.alias}`);
      return folderPath === expected;
    });
  }

  async addAgent(alias: string, repoPath: string, color: string) {
    const agent: ExternalAgent = { id: generateId(), alias, repoPath };

    const folderPath = normalizePath(`${this.settings.agentsRootFolder}/${alias}`);
    if (!this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }

    await this.linkClaudeMd(agent);
    this.settings.agents.push(agent);

    if (color) {
      this.settings.folderColors.push({ path: folderPath, color, cascade: true });
    }

    await this.saveSettings();
    new Notice(`External agent "${alias}" added successfully.`);
  }

  async removeAgent(agentId: string) {
    const agent = this.settings.agents.find((a) => a.id === agentId);
    if (!agent) return;
    this.settings.agents = this.settings.agents.filter((a) => a.id !== agentId);
    await this.saveSettings();
    new Notice(`External agent "${agent.alias}" removed from settings.`);
  }

  async linkClaudeMd(agent: ExternalAgent) {
    const claudeMdSource = path.join(agent.repoPath, "CLAUDE.md");
    const vaultBasePath = getVaultAbsolutePath(this.app);
    const agentFolder = normalizePath(`${this.settings.agentsRootFolder}/${agent.alias}`);
    const targetRelPath = normalizePath(`${agentFolder}/CLAUDE.md`);
    const targetAbsPath = path.join(vaultBasePath, targetRelPath);

    if (!fs.existsSync(claudeMdSource)) {
      new Notice(`Warning: CLAUDE.md not found at ${claudeMdSource}. Created empty placeholder.`);
      if (!this.app.vault.getAbstractFileByPath(targetRelPath)) {
        await this.app.vault.create(
          targetRelPath,
          `> [!warning] CLAUDE.md not found\n> No CLAUDE.md found at \`${agent.repoPath}\`.\n> Place a CLAUDE.md in that repo and use "Sync CLAUDE.md" to update.`
        );
      }
      return;
    }

    try {
      if (fs.existsSync(targetAbsPath)) fs.unlinkSync(targetAbsPath);
      fs.symlinkSync(claudeMdSource, targetAbsPath, "file");
      new Notice(`Symlinked CLAUDE.md from ${agent.repoPath}`);
    } catch {
      try {
        const content = fs.readFileSync(claudeMdSource, "utf-8");
        if (this.app.vault.getAbstractFileByPath(targetRelPath)) {
          await this.app.vault.adapter.write(targetRelPath, content);
        } else {
          await this.app.vault.create(targetRelPath, content);
        }
        new Notice(`Copied CLAUDE.md from ${agent.repoPath} (symlink not available — use "Sync" to update)`);
      } catch (err) {
        new Notice(`Failed to link CLAUDE.md: ${err}`);
      }
    }
  }

  async syncAgent(agent: ExternalAgent) {
    const claudeMdSource = path.join(agent.repoPath, "CLAUDE.md");
    if (!fs.existsSync(claudeMdSource)) {
      new Notice(`CLAUDE.md not found at ${agent.repoPath}`);
      return;
    }
    const targetRelPath = normalizePath(
      `${this.settings.agentsRootFolder}/${agent.alias}/CLAUDE.md`
    );
    const vaultBasePath = getVaultAbsolutePath(this.app);
    const targetAbsPath = path.join(vaultBasePath, targetRelPath);
    try {
      if (fs.lstatSync(targetAbsPath).isSymbolicLink()) {
        new Notice(`CLAUDE.md is already symlinked — no sync needed.`);
        return;
      }
    } catch { /* file doesn't exist */ }
    const content = fs.readFileSync(claudeMdSource, "utf-8");
    if (this.app.vault.getAbstractFileByPath(targetRelPath)) {
      await this.app.vault.adapter.write(targetRelPath, content);
    } else {
      await this.app.vault.create(targetRelPath, content);
    }
    new Notice(`Synced CLAUDE.md for "${agent.alias}".`);
  }

  async syncAllAgents() {
    for (const agent of this.settings.agents) await this.syncAgent(agent);
    new Notice("All agents synced.");
  }
}

// ── Folder Color Modal (for any folder) ──────────────────────────────

class FolderColorModal extends Modal {
  plugin: OhMyBrainPlugin;
  folderPath: string;
  color: string;
  cascade: boolean;

  constructor(app: App, plugin: OhMyBrainPlugin, folderPath: string) {
    super(app);
    this.plugin = plugin;
    this.folderPath = folderPath;
    this.color = PRESET_COLORS[0].value;
    this.cascade = true;
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.addClass("omb-modal");

    // Load effective color (shared + user merge) before rendering
    const existing = await this.plugin.getEffectiveFolderColor(this.folderPath);
    if (existing) {
      this.color = existing.color;
      this.cascade = existing.cascade;
    }

    const folderName = this.folderPath.split("/").pop() || this.folderPath;
    contentEl.createEl("h2", { text: `Set color: ${folderName}` });
    contentEl.createEl("p", { text: this.folderPath, cls: "setting-item-description" });

    // Color grid
    const gridEl = contentEl.createDiv({ cls: "omb-color-grid" });
    for (const preset of PRESET_COLORS) {
      const btn = gridEl.createEl("button", {
        cls: "omb-color-btn",
        attr: { title: preset.label },
      });
      btn.style.backgroundColor = preset.value;
      if (this.color === preset.value) btn.addClass("omb-color-btn-active");
      btn.addEventListener("click", () => {
        this.color = preset.value;
        gridEl.querySelectorAll(".omb-color-btn").forEach((el) => el.removeClass("omb-color-btn-active"));
        btn.addClass("omb-color-btn-active");
        updatePreview();
      });
    }

    // Custom picker
    new Setting(contentEl).setName("Custom color").addColorPicker((picker) => {
      picker.setValue(this.color).onChange((value) => {
        this.color = value;
        gridEl.querySelectorAll(".omb-color-btn").forEach((el) => el.removeClass("omb-color-btn-active"));
        updatePreview();
      });
    });

    // Cascade toggle
    new Setting(contentEl)
      .setName("Apply to children")
      .setDesc("Color child files and subfolders too")
      .addToggle((toggle) => toggle.setValue(this.cascade).onChange((v) => (this.cascade = v)));

    // Preview
    const previewEl = contentEl.createDiv({ cls: "omb-preview" });
    const previewIcon = previewEl.createSpan({ cls: "omb-preview-icon" });
    setIcon(previewIcon, "folder");
    const previewText = previewEl.createSpan({ text: folderName, cls: "omb-preview-text" });

    const updatePreview = () => {
      const r = parseInt(this.color.slice(1, 3), 16);
      const g = parseInt(this.color.slice(3, 5), 16);
      const b = parseInt(this.color.slice(5, 7), 16);
      previewEl.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
      previewIcon.style.color = this.color;
      previewText.style.color = this.color;
    };
    updatePreview();

    // Buttons
    const btnContainer = contentEl.createDiv({ cls: "omb-btn-container" });

    const hasUserOverride = this.plugin.settings.folderColors.find(
      (fc) => fc.path === this.folderPath
    );
    if (hasUserOverride) {
      const removeBtn = btnContainer.createEl("button", { text: "Reset to shared" });
      removeBtn.style.marginRight = "auto";
      removeBtn.addEventListener("click", async () => {
        await this.plugin.removeFolderColor(this.folderPath);
        new Notice(`User override removed for "${folderName}".`);
        this.close();
      });
    } else if (existing) {
      const removeBtn = btnContainer.createEl("button", { text: "Remove color" });
      removeBtn.style.marginRight = "auto";
      removeBtn.addEventListener("click", async () => {
        await this.plugin.removeFolderColor(this.folderPath);
        new Notice(`Color removed from "${folderName}".`);
        this.close();
      });
    }

    btnContainer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());

    const saveBtn = btnContainer.createEl("button", { text: "Save", cls: "mod-cta" });
    saveBtn.addEventListener("click", async () => {
      await this.plugin.setFolderColor(this.folderPath, this.color, this.cascade);
      new Notice(`Color set for "${folderName}".`);
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Add Agent Modal ──────────────────────────────────────────────────

class AddAgentModal extends Modal {
  plugin: OhMyBrainPlugin;
  editAgent: ExternalAgent | null;
  alias: string = "";
  repoPath: string = "";
  color: string = PRESET_COLORS[9].value; // Default Green

  constructor(app: App, plugin: OhMyBrainPlugin, editAgent: ExternalAgent | null) {
    super(app);
    this.plugin = plugin;
    this.editAgent = editAgent;
    if (editAgent) {
      this.alias = editAgent.alias;
      this.repoPath = editAgent.repoPath;
    }
  }

  async onOpen() {
    // Load color asynchronously for edit mode
    if (this.editAgent) {
      const fp = normalizePath(`${this.plugin.settings.agentsRootFolder}/${this.editAgent.alias}`);
      const fc = await this.plugin.getEffectiveFolderColor(fp);
      if (fc) this.color = fc.color;
    }

    const { contentEl } = this;
    contentEl.addClass("omb-modal");
    contentEl.createEl("h2", { text: this.editAgent ? "Edit External Agent" : "Add External Agent" });

    // Repository path
    let repoPathInput: HTMLInputElement;
    new Setting(contentEl)
      .setName("Repository path")
      .setDesc("Absolute path to the repository on your PC")
      .addText((text) => {
        text.setPlaceholder("C:\\Projects\\my-repo").setValue(this.repoPath).onChange((v) => (this.repoPath = v));
        text.inputEl.style.width = "100%";
        repoPathInput = text.inputEl;
      })
      .addButton((btn) => {
        btn.setButtonText("Browse").onClick(async () => {
          const electron = require("electron");
          const dialog = electron.remote ? electron.remote.dialog : electron.dialog;
          const result = await dialog.showOpenDialog({ properties: ["openDirectory"], title: "Select repository folder" });
          if (result && !result.canceled && result.filePaths.length > 0) {
            this.repoPath = result.filePaths[0];
            repoPathInput.value = this.repoPath;
            repoPathInput.dispatchEvent(new Event("input"));
          }
        });
      });

    // Alias
    const aliasSetting = new Setting(contentEl)
      .setName("Alias")
      .setDesc("Display name for this agent (used as folder name in vault)");
    if (!this.editAgent) {
      aliasSetting.addText((text) => text.setPlaceholder("my-agent").setValue(this.alias).onChange((v) => (this.alias = v)));
    } else {
      aliasSetting.setDesc(`Folder name: ${this.alias} (cannot change after creation)`);
    }

    // Color grid
    const colorSetting = new Setting(contentEl).setName("Folder color").setDesc("Color for this agent's folder");
    const gridEl = colorSetting.controlEl.createDiv({ cls: "omb-color-grid-inline" });
    for (const preset of PRESET_COLORS) {
      const btn = gridEl.createEl("button", { cls: "omb-color-btn", attr: { title: preset.label } });
      btn.style.backgroundColor = preset.value;
      if (this.color === preset.value) btn.addClass("omb-color-btn-active");
      btn.addEventListener("click", () => {
        this.color = preset.value;
        gridEl.querySelectorAll(".omb-color-btn").forEach((el) => el.removeClass("omb-color-btn-active"));
        btn.addClass("omb-color-btn-active");
      });
    }
    colorSetting.addColorPicker((picker) => {
      picker.setValue(this.color).onChange((v) => {
        this.color = v;
        gridEl.querySelectorAll(".omb-color-btn").forEach((el) => el.removeClass("omb-color-btn-active"));
      });
    });

    // Buttons
    const btnContainer = contentEl.createDiv({ cls: "omb-btn-container" });
    btnContainer.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    btnContainer.createEl("button", { text: this.editAgent ? "Save" : "Add Agent", cls: "mod-cta" }).addEventListener("click", async () => {
      if (!this.repoPath.trim()) { new Notice("Please specify a repository path."); return; }
      if (!this.alias.trim()) { new Notice("Please specify an alias."); return; }
      if (/[<>:"/\\|?*]/.test(this.alias)) { new Notice('Alias cannot contain special characters: < > : " / \\ | ? *'); return; }

      if (this.editAgent) {
        const agent = this.plugin.settings.agents.find((a) => a.id === this.editAgent!.id);
        if (agent) {
          agent.repoPath = this.repoPath;
          const fp = normalizePath(`${this.plugin.settings.agentsRootFolder}/${agent.alias}`);
          await this.plugin.setFolderColor(fp, this.color, true);
          new Notice(`Agent "${agent.alias}" updated.`);
        }
      } else {
        const existing = this.plugin.settings.agents.find((a) => a.alias === this.alias);
        if (existing) {
          const fp = normalizePath(`${this.plugin.settings.agentsRootFolder}/${this.alias}`);
          if (!this.app.vault.getAbstractFileByPath(fp)) {
            this.plugin.settings.agents = this.plugin.settings.agents.filter((a) => a.id !== existing.id);
            await this.plugin.saveSettings();
          } else {
            new Notice(`An agent with alias "${this.alias}" already exists.`);
            return;
          }
        }
        await this.plugin.addAgent(this.alias, this.repoPath, this.color);
      }
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

// ── Settings Tab ─────────────────────────────────────────────────────

class OhMyBrainSettingTab extends PluginSettingTab {
  plugin: OhMyBrainPlugin;

  constructor(app: App, plugin: OhMyBrainPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Folder Colors ──
    containerEl.createEl("h2", { text: "Folder Colors" });

    // Shared colors toggle
    new Setting(containerEl)
      .setName("Use shared colors")
      .setDesc("Load colors from oh-my-brain-plugin/folder-colors.json (git-tracked, shared across clones)")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useSharedColors).onChange(async (v) => {
          this.plugin.settings.useSharedColors = v;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    // Load colors async then render
    this.renderColorList(containerEl);

    // ── External Agents ──
    containerEl.createEl("h2", { text: "External Agents" });

    new Setting(containerEl)
      .setName("Agents root folder")
      .setDesc("Vault folder where agent directories are created")
      .addText((text) =>
        text.setPlaceholder("Agents").setValue(this.plugin.settings.agentsRootFolder).onChange(async (v) => {
          this.plugin.settings.agentsRootFolder = v || "Agents";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Add external agent")
      .addButton((btn) => btn.setButtonText("+ Add Agent").setCta().onClick(() => new AddAgentModal(this.app, this.plugin, null).open()));

    if (this.plugin.settings.agents.length > 0) {
      new Setting(containerEl).setName("Sync all CLAUDE.md").addButton((btn) =>
        btn.setButtonText("Sync All").onClick(async () => await this.plugin.syncAllAgents())
      );
      containerEl.createEl("h3", { text: "Registered Agents" });
      for (const agent of this.plugin.settings.agents) {
        const s = new Setting(containerEl).setName(agent.alias).setDesc(agent.repoPath);
        s.addButton((btn) => btn.setIcon("pencil").setTooltip("Edit").onClick(() => new AddAgentModal(this.app, this.plugin, agent).open()));
        s.addButton((btn) => btn.setIcon("refresh-cw").setTooltip("Sync").onClick(async () => await this.plugin.syncAgent(agent)));
        s.addButton((btn) => btn.setIcon("trash-2").setTooltip("Remove").onClick(async () => { await this.plugin.removeAgent(agent.id); this.display(); }));
      }
    }
  }

  private async renderColorList(containerEl: HTMLElement) {
    const colorListEl = containerEl.createDiv();
    const sharedColors = await this.plugin.loadSharedColors();
    const mergedColors = await this.plugin.getMergedFolderColors();
    const userPaths = new Set(this.plugin.settings.folderColors.map((fc) => fc.path));

    if (mergedColors.length === 0) {
      colorListEl.createEl("p", {
        text: "No folder colors set. Right-click any folder to set a color.",
        cls: "setting-item-description",
      });
      return;
    }

    for (const fc of mergedColors) {
      const name = fc.path.split("/").pop() || fc.path;
      const source = this.plugin.getColorSource(fc.path, sharedColors);
      const badge = source === "user" ? " [user override]" : source === "shared" ? " [shared]" : "";
      const s = new Setting(colorListEl)
        .setName(name)
        .setDesc(fc.path + (fc.cascade ? " (cascade)" : "") + badge);

      const dot = s.nameEl.createSpan({ cls: "omb-color-dot" });
      dot.style.backgroundColor = fc.color;
      s.nameEl.prepend(dot);

      s.addButton((btn) =>
        btn.setIcon("pencil").setTooltip("Edit (saves as user override)").onClick(() => {
          new FolderColorModal(this.app, this.plugin, fc.path).open();
        })
      );

      if (userPaths.has(fc.path)) {
        // User override — show reset button
        const sharedVersion = sharedColors.find((sc) => sc.path === fc.path);
        if (sharedVersion) {
          s.addButton((btn) =>
            btn.setIcon("rotate-ccw").setTooltip("Reset to shared").onClick(async () => {
              await this.plugin.removeFolderColor(fc.path);
              this.display();
            })
          );
        }
        s.addButton((btn) =>
          btn.setIcon("x").setTooltip("Remove override").onClick(async () => {
            await this.plugin.removeFolderColor(fc.path);
            this.display();
          })
        );
      }
    }
  }
}
