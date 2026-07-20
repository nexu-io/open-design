# Windows Troubleshooting Guide

Open Design runs on Windows natively, but the path is less travelled than macOS, Linux, or WSL2. This guide covers the most common errors you will hit on a fresh Windows machine and the exact fix for each.

> **Tip:** If your coding-agent CLIs run inside WSL2, use the dedicated [`WSL2 setup guide`](wsl-setup.md). This guide is for native Windows (PowerShell).

---

## Installing the desktop app: "Windows protected your PC"

### Symptom

When you run the downloaded installer (for example `open-design-0.11.0-win-x64-setup.exe`), a blue Windows Defender SmartScreen dialog appears:

```text
Windows protected your PC
Microsoft Defender SmartScreen prevented an unrecognized app from starting.
App:       open-design-x.y.z-win-x64-setup.exe
Publisher: Unknown publisher
```

The first dialog only shows a **Don't run** button. The **Run anyway** button is hidden until you click **More info**.

### Why this happens

This is expected and does not mean the app is unsafe or broken. SmartScreen warns about any installer that is not signed with a code-signing certificate it already recognizes. Open Design ships unsigned Windows builds today, so the installer reports `Publisher: Unknown publisher` and SmartScreen flags it until a given signed binary builds up download reputation. The warning is about verifying who published the file, not about detecting a threat.

### Fix

If you downloaded the installer from an official source, you can proceed:

1. Click **More info** in the dialog.
2. Click **Run anyway**.
3. Continue through the installer as normal.

### Verify the download first

Only run the installer if you got it from an official source:

- [open-design.ai](https://open-design.ai/), or
- [GitHub Releases](https://github.com/nexu-io/open-design/releases) on the `nexu-io/open-design` repository.

Do not run an installer from a mirror, a re-upload, or a link you cannot trace back to one of those two sources. If a release publishes a SHA-256 checksum, you can confirm the file is intact before running it:

```powershell
Get-FileHash .\open-design-x.y.z-win-x64-setup.exe -Algorithm SHA256
```

Compare the printed hash against the checksum listed on the release page. They must match exactly.

---

## Prerequisites

| Tool | Version | How to verify |
|---|---|---|
| Node.js | `~24` | `node -v` |
| pnpm | `10.33.x` | `pnpm -v` |
| Git | any recent | `git --version` |

---

## 1. Node 24 installation

### Symptom
`node -v` returns something older than `v24.x.x`, or you do not have Node installed at all.

### Fix

**Option A — nvm-windows (recommended)**

1. Install [nvm-windows](https://github.com/coreybutler/nvm-windows/releases).
2. In a fresh PowerShell window:

   ```powershell
   nvm install 24
   nvm use 24
   node -v   # should print v24.x.x
   ```

**Option B — Official installer**

Download and run the Node 24 `.msi` from [nodejs.org](https://nodejs.org/).

### Common nvm-windows gotcha

If running `nvm version` or `node -v` pops up a Windows dialog that asks *"How do you want to open this file?"*, a fake `nvm` file (no extension) has been created in `C:\Windows\System32`.

**Fix:** Delete that file, then restart PowerShell.

---

## 2. pnpm not found

### Symptom

```text
pnpm : The term 'pnpm' is not recognized as the name of a cmdlet...
```

### Fix (npm global — Windows native)

The repo pins `pnpm@10.33.2` in `packageManager`, but `corepack enable` on a
normal Windows Node installation tries to write shims under
`C:\Program Files\nodejs` and fails with `EPERM`. Install the pinned pnpm
version globally instead:

```powershell
npm install -g pnpm@10.33.2
pnpm -v   # should print 10.33.2
```

Use Corepack in macOS, Linux, and WSL2 as documented in the root Quickstart;
do not treat a Windows-native `corepack enable` permission failure as a broken
Node installation.

---

## 3. Build scripts blocked

### Symptom

During `pnpm install` you see:

```text
Ignored build scripts: better-sqlite3, ...
```

Later, `pnpm tools-dev run web` fails with native-module errors.

### Fix

pnpm 10 blocks lifecycle scripts by default. Allow the packages that need native compilation:

```powershell
pnpm approve-builds
```

Approve any packages that appear in the list (commonly `better-sqlite3`, `electron`, and `esbuild`). Then re-run:

```powershell
pnpm install
```

> **Expected on Windows native:** `better-sqlite3` does not publish a win32
> prebuilt binary for Node 24, so `pnpm install` compiles it from source with
> node-gyp (often around two minutes). Install Visual Studio Build Tools 2022
> or newer as described in step 4 *before* running `pnpm install`. Compilation
> output by itself is not a Node-version incompatibility.

---

## 4. Visual Studio / `gyp` build errors

### Symptom

```text
gyp ERR! find VS could not find Visual Studio
```

or

```text
error MSB8036: The Windows SDK version was not found
```

### Fix

Install **Build Tools for Visual Studio 2022** with the following workloads:

- **Desktop development with C++**
- **MSVC v143 - VS 2022 C++ x64/x86 build tools**
- **Windows 11 SDK** (or Windows 10 SDK if you are on Windows 10)

Download: [https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)

If you see `gyp ERR! find Python`, verify Python is installed:

```powershell
python --version   # or py --version
```

If missing, install Python 3.x from [python.org](https://www.python.org/downloads/) and ensure it's on PATH.

After installing all build tools, open a **fresh** PowerShell window and re-run `pnpm install`.

---

## 5. PowerShell execution policy

### Symptom

```text
 cannot be loaded because running scripts is disabled on this system.
```

### Fix

On fresh Windows installs, PowerShell blocks script execution by default:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Restart PowerShell after changing the policy.

---

## 6. Start the dev server

### Symptom
You have completed the steps above but are not sure how to launch the app.

### Fix

From the repository root:

```powershell
pnpm tools-dev run web
```

Expected output ends with something like:

```text
Open Design dev server ready
  - Local:   http://localhost:17573
```

The exact port may change; always read the terminal output.

---

## Quick diagnostic checklist

Run these commands in PowerShell before opening an issue. Include the output in your report.

```powershell
node -v
pnpm -v
where.exe pnpm
where.exe node
where.exe opencode
corepack --version
python --version   # or py --version
Get-ExecutionPolicy -List
```

## 7. Optional: quick launcher

If you want a double-click entry point on Windows, create a `launch.bat` file in the repo root with:

```bat
@echo off
cd /d %~dp0
corepack pnpm tools-dev run web
```

That keeps the launcher on the supported `pnpm tools-dev run web` path while still giving you a one-click start.

---

## Optional: OpenCode agent CLI on Windows

OpenCode is one of the local agent CLIs Open Design can drive. If you want to use it:

```powershell
npm install -g opencode-ai
where.exe opencode   # should show C:\Users\YOUR_USERNAME\AppData\Roaming\npm\opencode.cmd
opencode --version
```

If Open Design still shows OpenCode as *not installed* in **Settings → Execution mode**, click **Rescan** after confirming the `opencode.cmd` directory is on your user `PATH`.
