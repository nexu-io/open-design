import { app } from "electron";

function isAvailable(): boolean {
  // Only register login items for packaged builds. Development mode
  // runs from a temporary .tmp/ path that disappears across reboots,
  // so a login-item entry pointing there would be broken.
  return app.isPackaged;
}

export function enableAutoLaunch(): boolean {
  if (!isAvailable()) return false;
  try {
    app.setLoginItemSettings({ openAtLogin: true });
    return true;
  } catch {
    return false;
  }
}

export function disableAutoLaunch(): boolean {
  if (!isAvailable()) return false;
  try {
    app.setLoginItemSettings({ openAtLogin: false });
    return true;
  } catch {
    return false;
  }
}

export function isAutoLaunchEnabled(): boolean {
  if (!isAvailable()) return false;
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}
