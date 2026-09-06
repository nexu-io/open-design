/**
 * Linux is deliberately outside the current Electron distribution boundary.
 * This module reserves the platform surface so a future implementation can be
 * added without changing the electron-kit import topology.
 */
export const ELECTRON_LINUX_DISTRIBUTION_IMPLEMENTED = false as const;
