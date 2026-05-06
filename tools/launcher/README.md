# Open Design Windows Launcher

`OpenDesignLauncher.cs` builds a small Windows console executable that starts the
local development app without typing the normal commands by hand.

The compiled `OpenDesign.exe` is intentionally not committed to git. Build it
locally when you want the shortcut, or download a trusted build from GitHub
Releases if the project publishes one.

## Build

From the repository root on Windows:

```powershell
C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:exe /out:OpenDesign.exe /win32icon:tools\pack\resources\win\icon.ico tools\launcher\OpenDesignLauncher.cs
```

If your Windows installation only has the 32-bit .NET Framework compiler, use:

```powershell
C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe /target:exe /out:OpenDesign.exe /win32icon:tools\pack\resources\win\icon.ico tools\launcher\OpenDesignLauncher.cs
```

## Run

Place the built `OpenDesign.exe` in the repository root next to `package.json`,
then double-click it.

The launcher checks for dependencies and runs:

```powershell
corepack pnpm install
corepack pnpm tools-dev
```
