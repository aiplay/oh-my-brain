#!/usr/bin/env python3
"""
setup.py - Initialize the current repository as an Obsidian vault,
build/install the oh-my-brain plugin, and optionally download remote plugins.

Usage:
    python oh-my-brain-plugin/setup.py [options]

Options:
    --force         Force reinstall even if plugins already exist
    --skip-download Skip downloading remote plugins (offline mode)
    --skip-build    Skip building local plugins
    --help          Show this help message

Plugins are organized into two categories:
    - LOCAL: built from source in this repository
    - REMOTE: downloaded from GitHub Releases (optional, interactive)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

VAULT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OBSIDIAN_DIR = os.path.join(VAULT_ROOT, ".obsidian")
PLUGINS_DIR = os.path.join(OBSIDIAN_DIR, "plugins")

# Network timeout in seconds
NETWORK_TIMEOUT = 30

# Subprocess timeout for npm / node commands (5 minutes)
BUILD_TIMEOUT = 300

# ---------------------------------------------------------------------------
# Plugin Registry
# ---------------------------------------------------------------------------

# Local plugins: built from source within this repository
# - source_dir    : path to plugin source (relative to VAULT_ROOT)
# - plugin_id     : Obsidian plugin id (folder name in .obsidian/plugins/)
# - build_cmd     : command to build the plugin
# - output_files  : files produced by build that must exist
LOCAL_PLUGINS = [
    {
        "name": "Oh My Brain",
        "plugin_id": "oh-my-brain",
        "source_dir": "oh-my-brain-plugin",
        "build_cmd": ["npm", "install", "&&", "npm", "run", "build"],
        "output_files": ["main.js", "manifest.json", "styles.css"],
        "critical_files": ["main.js", "manifest.json"],
    },
]

# Remote plugins: downloaded from GitHub Releases
# - github_repo   : "owner/repo" on GitHub
# - assets        : files to download from release
# - critical_files: must succeed for plugin to be usable
# - required      : if True, install automatically without asking (default: False)
# - pre_install   : reminder shown BEFORE installation (optional plugins only)
REMOTE_PLUGINS = [
    # ── Required remote plugins (auto-install) ──────────────────────────────
    {
        "name": "Execute Code",
        "plugin_id": "execute-code",
        "description": "Execute code snippets in code blocks (Python, JS, Shell, etc.)",
        "github_repo": "twibiral/obsidian-execute-code",
        "assets": ["main.js", "manifest.json", "styles.css"],
        "critical_files": ["main.js", "manifest.json"],
        "required": True,
    },
    # ── Optional remote plugins (interactive) ───────────────────────────────
    {
        "name": "Claudian",
        "plugin_id": "claudian",
        "description": "Claude AI assistant integration for Obsidian",
        "github_repo": "YishenTu/claudian",
        "assets": ["main.js", "manifest.json", "styles.css"],
        "critical_files": ["main.js", "manifest.json"],
        "pre_install": [
            "⚠  Before using Claudian you will need to configure it yourself:",
            "   • A valid Claude API Key (from https://console.anthropic.com/)",
            "   • Optionally adjust model, temperature, and other settings",
            "   These can be set in Obsidian → Settings → Claudian after install.",
        ],
    },
    {
        "name": "Marp Slides",
        "plugin_id": "marp-slides",
        "description": "Create presentation slides from Markdown using Marp",
        "github_repo": "samuele-cozzi/obsidian-marp-slides",
        "assets": ["main.js", "manifest.json", "styles.css"],
        "critical_files": ["main.js", "manifest.json"],
    },
    {
        "name": "Marp Slides",
        "plugin_id": "marp-slides",
        "description": "Create presentation slides from Markdown using Marp",
        "github_repo": "samuele-cozzi/obsidian-marp-slides",
        "assets": ["main.js", "manifest.json", "styles.css"],
        "critical_files": ["main.js", "manifest.json"],
    },
    {
        "name": "Excalidraw",
        "plugin_id": "obsidian-excalidraw-plugin",
        "description": "Draw diagrams, sketches, and mind maps with Excalidraw",
        "github_repo": "zsviczian/obsidian-excalidraw-plugin",
        "assets": ["main.js", "manifest.json", "styles.css"],
        "critical_files": ["main.js", "manifest.json"],
    },
    # ── Add more remote plugins here ────────────────────────────────────────
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(f"[setup] {msg}")


def log_error(msg: str) -> None:
    print(f"[setup] ❌ ERROR: {msg}", file=sys.stderr)


def log_warn(msg: str) -> None:
    print(f"[setup] ⚠  WARNING: {msg}")


def banner(title: str) -> None:
    width = 60
    print()
    print("=" * width)
    print(f"  {title}")
    print("=" * width)


def normalize_path(path: str) -> str:
    """Convert path to forward slashes for consistent display."""
    return path.replace("\\", "/")


def ensure_dir(path: str) -> None:
    if not os.path.isdir(path):
        os.makedirs(path, exist_ok=True)
        log(f"Created directory: {normalize_path(os.path.relpath(path, VAULT_ROOT))}")


def ask_yes_no(prompt: str, default: bool = True) -> bool:
    """Ask a yes/no question. Handles EOF gracefully for non-interactive mode."""
    hint = "[Y/n]" if default else "[y/N]"
    while True:
        try:
            answer = input(f"{prompt} {hint}: ").strip().lower()
        except EOFError:
            print("Y" if default else "N")
            return default
        if answer == "":
            return default
        if answer in ("y", "yes"):
            return True
        if answer in ("n", "no"):
            return False
        print("  Please answer y or n.")


def fetch_json(url: str) -> dict | None:
    """GET a URL and return parsed JSON. Returns None on any network error."""
    req = urllib.request.Request(url, headers={"User-Agent": "obsidian-vault-setup/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=NETWORK_TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            log_warn(f"GitHub API rate-limited (HTTP 403)")
        else:
            log_warn(f"HTTP error {e.code} fetching {url}")
        return None
    except urllib.error.URLError as e:
        log_warn(f"Network error: {e.reason}")
        return None
    except TimeoutError:
        log_warn(f"Request timed out: {url}")
        return None
    except Exception as e:
        log_warn(f"Unexpected error fetching {url}: {e}")
        return None


def download_file(url: str, dest: str) -> bool:
    """Download a file. Returns True on success, False on failure."""
    req = urllib.request.Request(url, headers={"User-Agent": "obsidian-vault-setup/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=NETWORK_TIMEOUT) as resp:
            data = resp.read()
        
        # Validate: file should not be empty
        if len(data) == 0:
            log_warn(f"Downloaded file is empty: {os.path.basename(dest)}")
            return False
        
        with open(dest, "wb") as f:
            f.write(data)
        
        size_kb = len(data) / 1024
        log(f"  ↓ {os.path.basename(dest)} ({size_kb:.1f} KB)")
        return True
        
    except urllib.error.HTTPError as e:
        log_warn(f"HTTP {e.code} downloading {os.path.basename(dest)}")
        return False
    except urllib.error.URLError as e:
        log_warn(f"Network error downloading {os.path.basename(dest)}: {e.reason}")
        return False
    except TimeoutError:
        log_warn(f"Timeout downloading {os.path.basename(dest)}")
        return False
    except Exception as e:
        log_warn(f"Error downloading {os.path.basename(dest)}: {e}")
        return False


def verify_file_integrity(filepath: str, min_size: int = 100) -> bool:
    """Verify a downloaded/built file exists and has reasonable size."""
    if not os.path.exists(filepath):
        return False
    size = os.path.getsize(filepath)
    if size < min_size:
        log_warn(f"File too small ({size} bytes): {os.path.basename(filepath)}")
        return False
    return True


def get_local_plugin_version(plugin_dir: str) -> str | None:
    """Read version from local manifest.json if it exists."""
    manifest_path = os.path.join(plugin_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        return None
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("version")
    except Exception:
        return None


def register_community_plugins(plugin_ids: list[str]) -> None:
    """Add multiple plugin IDs to community-plugins.json if not present."""
    path = os.path.join(OBSIDIAN_DIR, "community-plugins.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            plugins = json.load(f)
    else:
        plugins = []

    changed = False
    for plugin_id in plugin_ids:
        if plugin_id not in plugins:
            plugins.append(plugin_id)
            changed = True
            log(f"Registered '{plugin_id}' in community-plugins.json")

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(plugins, f, indent=2, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Step 1 – Initialize the Obsidian vault skeleton
# ---------------------------------------------------------------------------

def init_vault() -> None:
    banner("Step 1 · Initializing Obsidian Vault")
    log(f"Vault root: {normalize_path(VAULT_ROOT)}")

    ensure_dir(OBSIDIAN_DIR)
    ensure_dir(PLUGINS_DIR)

    _write_json_if_missing(os.path.join(OBSIDIAN_DIR, "app.json"), {
        "alwaysUpdateLinks": True,
        "newFileLocation": "current",
        "attachmentFolderPath": "assets",
    }, "app.json")

    _write_json_if_missing(os.path.join(OBSIDIAN_DIR, "appearance.json"), {
        "accentColor": "",
        "baseFontSize": 16,
    }, "appearance.json")

    _write_json_if_missing(os.path.join(OBSIDIAN_DIR, "core-plugins.json"), [
        "file-explorer", "global-search", "switcher", "graph",
        "backlink", "outgoing-link", "tag-pane", "page-preview",
        "command-palette", "markdown-importer", "word-count",
        "open-with-default-app", "file-recovery",
    ], "core-plugins.json")

    _write_json_if_missing(
        os.path.join(OBSIDIAN_DIR, "community-plugins.json"), [], "community-plugins.json"
    )

    log("Vault skeleton ready ✓")


def _write_json_if_missing(path: str, data: Any, label: str) -> None:
    if not os.path.exists(path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        log(f"Created {label}")


# ---------------------------------------------------------------------------
# Step 2 – Build and install local plugins
# ---------------------------------------------------------------------------

def build_local_plugins(force: bool = False, skip_build: bool = False) -> list[str]:
    """Build and install local plugins. Returns list of successfully installed plugin IDs."""
    banner("Step 2 · Local Plugins (build from source)")

    if not LOCAL_PLUGINS:
        log("No local plugins configured.")
        return []

    if skip_build:
        log("Skipping build (--skip-build)")
        # Still check if already built
        installed = []
        for plugin in LOCAL_PLUGINS:
            plugin_dir = os.path.join(PLUGINS_DIR, plugin["plugin_id"])
            if _verify_plugin_files(plugin_dir, plugin["critical_files"]):
                log(f"  ✓ {plugin['name']} (already built)")
                installed.append(plugin["plugin_id"])
        return installed

    installed: list[str] = []

    for plugin in LOCAL_PLUGINS:
        print()
        log(f"── {plugin['name']} ──")

        source_dir = os.path.join(VAULT_ROOT, plugin["source_dir"])
        plugin_dir = os.path.join(PLUGINS_DIR, plugin["plugin_id"])

        # Check if source exists
        if not os.path.isdir(source_dir):
            log_error(f"Source directory not found: {normalize_path(plugin['source_dir'])}")
            continue

        # Check if already installed (and not forcing)
        if not force and _verify_plugin_files(plugin_dir, plugin["critical_files"]):
            local_ver = get_local_plugin_version(plugin_dir)
            log(f"Already installed (version {local_ver or 'unknown'}). Use --force to rebuild.")
            installed.append(plugin["plugin_id"])
            continue

        # Build the plugin
        log(f"Building from {normalize_path(plugin['source_dir'])} ...")

        # Check if npm is available
        if not shutil.which("npm"):
            log_error("npm not found. Please install Node.js and npm first.")
            print()
            print("  Install Node.js from: https://nodejs.org/")
            print("  Then run this script again.")
            continue

        try:
            # Run npm install (use public registry to avoid corporate proxy issues)
            log("Running npm install ...")
            result = subprocess.run(
                ["npm", "install", "--registry", "https://registry.npmmirror.com"],
                cwd=source_dir,
                text=True,
                timeout=BUILD_TIMEOUT,
                shell=(os.name == "nt"),  # Windows needs shell=True for npm
            )
            if result.returncode != 0:
                log_error("npm install failed (exit code {}).".format(result.returncode))
                _diagnose_npm_error(source_dir)
                continue

            # Verify node_modules was created
            node_modules_dir = os.path.join(source_dir, "node_modules")
            if not os.path.isdir(node_modules_dir):
                log_error("npm install completed but node_modules/ was not created.")
                _diagnose_npm_error(source_dir)
                continue

            # Try npm run build first; fall back to node esbuild.config.mjs
            # (npm run build can fail on Windows when MacType's package.json
            #  sits on the PATH and confuses npm's config resolution)
            log("Running npm run build ...")
            result = subprocess.run(
                ["npm", "run", "build"],
                cwd=source_dir,
                text=True,
                timeout=BUILD_TIMEOUT,
                shell=(os.name == "nt"),
            )
            if result.returncode != 0:
                esbuild_config = os.path.join(source_dir, "esbuild.config.mjs")
                if os.path.exists(esbuild_config):
                    log_warn("npm run build failed, trying direct esbuild fallback …")
                    result = subprocess.run(
                        ["node", "esbuild.config.mjs", "production"],
                        cwd=source_dir,
                        text=True,
                        timeout=BUILD_TIMEOUT,
                        shell=(os.name == "nt"),
                    )
                if result.returncode != 0:
                    log_error("Build failed (exit code {}).".format(result.returncode))
                    continue

            log("Build completed.")

        except subprocess.TimeoutExpired:
            log_error(f"Build timed out after {BUILD_TIMEOUT}s. Check network or try again.")
            continue

        except Exception as e:
            log_error(f"Build failed: {e}")
            continue

        # Verify output files
        if not _verify_plugin_files(plugin_dir, plugin["critical_files"]):
            log_error(f"Build output missing critical files in {normalize_path(plugin_dir)}")
            continue

        log(f"{plugin['name']} installed to: {normalize_path(os.path.relpath(plugin_dir, VAULT_ROOT))} ✓")
        installed.append(plugin["plugin_id"])

    return installed


def _verify_plugin_files(plugin_dir: str, critical_files: list[str]) -> bool:
    """Check that all critical files exist and are non-empty."""
    if not os.path.isdir(plugin_dir):
        return False
    for fname in critical_files:
        fpath = os.path.join(plugin_dir, fname)
        if not verify_file_integrity(fpath, min_size=10):
            return False
    return True


def _diagnose_npm_error(source_dir: str) -> None:
    """Print diagnostic hints for common npm install failures."""
    print()
    print("  Possible causes:")
    print("    • Network issue — check your internet connection")
    print("    • Corporate proxy/registry — your .npmrc may point to an internal registry")
    print("    • Node.js not installed or not in PATH")
    print()
    print("  Try manually:")
    print(f"    cd {normalize_path(source_dir)}")
    print("    npm install --registry https://registry.npmmirror.com")
    print("    npm run build")
    print()


# ---------------------------------------------------------------------------
# Step 3 – Remote plugins (interactive download from GitHub)
# ---------------------------------------------------------------------------

def get_required_remote_plugins() -> list[dict]:
    """Return list of required remote plugins (auto-install)."""
    return [p for p in REMOTE_PLUGINS if p.get("required", False)]


def get_optional_remote_plugins() -> list[dict]:
    """Return list of optional remote plugins (interactive)."""
    return [p for p in REMOTE_PLUGINS if not p.get("required", False)]


def install_required_remote_plugins(force: bool = False) -> list[str]:
    """Install all required remote plugins. Returns list of successfully installed plugin IDs."""
    required = get_required_remote_plugins()
    if not required:
        return []

    banner("Step 3a · Required Remote Plugins (auto-install)")
    
    installed: list[str] = []
    for plugin in required:
        if install_remote_plugin(plugin, force=force):
            installed.append(plugin["plugin_id"])
    
    return installed


def select_optional_remote_plugins() -> list[dict]:
    """Present the optional remote plugin menu and return the list of chosen plugins."""
    optional = get_optional_remote_plugins()
    
    banner("Step 3b · Optional Remote Plugins")

    if not optional:
        log("No optional remote plugins available.")
        return []

    print()
    print("  The following optional plugins can be downloaded:")
    print()
    for idx, plugin in enumerate(optional, 1):
        print(f"    [{idx}] {plugin['name']} — {plugin['description']}")
        print(f"        (GitHub: https://github.com/{plugin['github_repo']})")
    print()

    chosen: list[dict] = []
    for plugin in optional:
        if ask_yes_no(f"  Install '{plugin['name']}'?"):
            chosen.append(plugin)

    return chosen


def install_remote_plugin(plugin: dict, force: bool = False) -> bool:
    """Download and install a remote plugin. Returns True on success."""
    plugin_dir = os.path.join(PLUGINS_DIR, plugin["plugin_id"])
    repo = plugin["github_repo"]
    assets = plugin["assets"]
    critical = plugin.get("critical_files", ["main.js", "manifest.json"])

    print()
    log(f"── Installing {plugin['name']} ──")

    # Fetch latest release once (used for both version check and download)
    log(f"Fetching latest release from {repo} …")
    release_info = fetch_json(f"https://api.github.com/repos/{repo}/releases/latest")

    # Check if already installed
    if not force and _verify_plugin_files(plugin_dir, critical):
        local_ver = get_local_plugin_version(plugin_dir)
        remote_ver = _extract_version_from_release(release_info) if release_info else None
        if remote_ver and local_ver and remote_ver == local_ver:
            log(f"Already installed (version {local_ver}), up to date.")
            return True
        elif remote_ver and local_ver:
            log(f"Installed: v{local_ver}, Available: v{remote_ver}")
            if not ask_yes_no("  Update to newer version?"):
                return True
        else:
            log(f"Already installed (version {local_ver or 'unknown'}). Use --force to reinstall.")
            return True

    # Show pre-install reminders
    if plugin.get("pre_install"):
        print()
        for line in plugin["pre_install"]:
            print(f"  {line}")
        print()
        if not ask_yes_no("  Continue with installation?"):
            log(f"Skipped {plugin['name']}.")
            return False

    if not release_info:
        log_error(f"Could not fetch release info for {repo}. Check network or try again later.")
        return False

    tag = release_info.get("tag_name", "unknown")
    log(f"Latest release: {tag}")

    # Build asset URL map
    asset_urls: dict[str, str] = {}
    for asset in release_info.get("assets", []):
        if asset["name"] in assets:
            asset_urls[asset["name"]] = asset["browser_download_url"]

    missing_assets = [a for a in assets if a not in asset_urls]
    if missing_assets:
        log_warn(f"Assets not found in release: {missing_assets}")

    # Check critical assets are available
    missing_critical = [a for a in critical if a not in asset_urls]
    if missing_critical:
        log_error(f"Critical assets missing from release: {missing_critical}")
        return False

    # Download
    ensure_dir(plugin_dir)
    download_success: dict[str, bool] = {}

    for name, url in asset_urls.items():
        dest = os.path.join(plugin_dir, name)
        download_success[name] = download_file(url, dest)

    # Verify critical files downloaded successfully
    for fname in critical:
        if not download_success.get(fname, False):
            log_error(f"Failed to download critical file: {fname}")
            return False
        fpath = os.path.join(plugin_dir, fname)
        if not verify_file_integrity(fpath):
            log_error(f"Downloaded file failed integrity check: {fname}")
            return False

    log(f"{plugin['name']} installed to: {normalize_path(os.path.relpath(plugin_dir, VAULT_ROOT))} ✓")
    return True


def _extract_version_from_release(release_info: dict | None) -> str | None:
    """Extract version from an already-fetched release info dict."""
    if not release_info:
        return None
    # Fallback: use tag name as version
    tag = release_info.get("tag_name", "")
    return tag.lstrip("v") if tag else None


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def show_summary(
    local_installed: list[str],
    required_remote_installed: list[str],
    optional_remote_installed: list[str],
    optional_remote_skipped: list[str],
) -> None:
    banner("Setup Complete 🎉")

    # Local plugins
    print()
    print("  Local plugins (built from source):")
    if local_installed:
        for pid in local_installed:
            name = next((p["name"] for p in LOCAL_PLUGINS if p["plugin_id"] == pid), pid)
            print(f"    ✅ {name}")
    else:
        print("    (none)")

    local_failed = [p["name"] for p in LOCAL_PLUGINS if p["plugin_id"] not in local_installed]
    if local_failed:
        print()
        print("  Local plugins FAILED:")
        for name in local_failed:
            print(f"    ❌ {name}")

    # Required remote plugins
    required_remote = get_required_remote_plugins()
    if required_remote:
        print()
        print("  Required remote plugins:")
        for pid in required_remote_installed:
            name = next((p["name"] for p in required_remote if p["plugin_id"] == pid), pid)
            print(f"    ✅ {name}")
        
        required_failed = [p["name"] for p in required_remote if p["plugin_id"] not in required_remote_installed]
        if required_failed:
            print()
            print("  Required remote plugins FAILED:")
            for name in required_failed:
                print(f"    ❌ {name}")

    # Optional remote plugins
    optional_remote = get_optional_remote_plugins()
    if optional_remote:
        print()
        print("  Optional remote plugins:")
        if optional_remote_installed:
            for pid in optional_remote_installed:
                name = next((p["name"] for p in optional_remote if p["plugin_id"] == pid), pid)
                print(f"    ✅ {name}")
        else:
            print("    (none installed)")

        if optional_remote_skipped:
            print()
            print("  Optional remote plugins skipped:")
            for pid in optional_remote_skipped:
                name = next((p["name"] for p in optional_remote if p["plugin_id"] == pid), pid)
                print(f"    ⏭  {name}")

    print()
    print("  Next steps:")
    print("    1. Open this folder as a vault in Obsidian")
    print("    2. Settings → Community plugins → Turn off 'Restricted mode'")
    print("    3. Enable and configure the installed plugins")
    
    # Warnings
    all_failed = local_failed + [p["name"] for p in required_remote if p["plugin_id"] not in required_remote_installed]
    if all_failed:
        print()
        print("  ⚠  Some required plugins failed. Check the errors above.")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Initialize Obsidian vault and install plugins.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python oh-my-brain-plugin/setup.py                 # Normal setup
  python oh-my-brain-plugin/setup.py --force         # Force rebuild/reinstall all plugins
  python oh-my-brain-plugin/setup.py --skip-build    # Skip building local plugins
  python oh-my-brain-plugin/setup.py --skip-download # Skip downloading remote plugins (offline)
        """,
    )
    parser.add_argument(
        "--force", "-f",
        action="store_true",
        help="Force reinstall even if plugins already exist",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip building local plugins (use existing builds)",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip downloading remote plugins (offline mode)",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = parse_args()

    print()
    print("  ╔══════════════════════════════════════════════════════╗")
    print("  ║        Oh-My-Brain · Obsidian Vault Setup           ║")
    print("  ╚══════════════════════════════════════════════════════╝")

    # Step 1: vault skeleton
    init_vault()

    # Step 2: local plugins (build from source)
    local_installed = build_local_plugins(force=args.force, skip_build=args.skip_build)

    # Step 3: remote plugins
    required_remote_installed: list[str] = []
    optional_remote_installed: list[str] = []
    optional_remote_skipped: list[str] = []

    if args.skip_download:
        banner("Step 3 · Remote Plugins (skipped)")
        log("Skipping remote plugins (--skip-download)")
        # Check if required remote plugins are already installed
        for plugin in get_required_remote_plugins():
            plugin_dir = os.path.join(PLUGINS_DIR, plugin["plugin_id"])
            if _verify_plugin_files(plugin_dir, plugin.get("critical_files", ["main.js", "manifest.json"])):
                required_remote_installed.append(plugin["plugin_id"])
                log(f"  ✓ {plugin['name']} (already installed)")
        optional_remote_skipped = [p["plugin_id"] for p in get_optional_remote_plugins()]
    else:
        # Step 3a: required remote plugins (auto-install)
        required_remote_installed = install_required_remote_plugins(force=args.force)

        # Check if any required plugin (local or remote) failed
        local_failed = [p for p in LOCAL_PLUGINS if p["plugin_id"] not in local_installed]
        required_remote_failed = [p for p in get_required_remote_plugins() if p["plugin_id"] not in required_remote_installed]

        if local_failed or required_remote_failed:
            log_warn("Some required plugins failed to install. Skipping optional plugins.")
            optional_remote_skipped = [p["plugin_id"] for p in get_optional_remote_plugins()]
        else:
            # Step 3b: optional remote plugins (interactive)
            chosen = select_optional_remote_plugins()
            for plugin in chosen:
                if install_remote_plugin(plugin, force=args.force):
                    optional_remote_installed.append(plugin["plugin_id"])
            optional_remote_skipped = [
                p["plugin_id"] for p in get_optional_remote_plugins()
                if p["plugin_id"] not in optional_remote_installed
            ]

    # Register all installed plugins
    all_installed = local_installed + required_remote_installed + optional_remote_installed
    if all_installed:
        register_community_plugins(all_installed)

    # Summary
    show_summary(
        local_installed,
        required_remote_installed,
        optional_remote_installed,
        optional_remote_skipped,
    )

    # Return non-zero if any required plugin failed
    local_failed = [p for p in LOCAL_PLUGINS if p["plugin_id"] not in local_installed]
    required_remote_failed = [p for p in get_required_remote_plugins() if p["plugin_id"] not in required_remote_installed]
    return 1 if (local_failed or required_remote_failed) else 0


if __name__ == "__main__":
    sys.exit(main())