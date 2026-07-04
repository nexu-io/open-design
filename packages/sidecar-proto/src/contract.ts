import { APP_KEYS, SIDECAR_DEFAULTS, SIDECAR_RUNTIME_ENV, SIDECAR_MODES, SIDECAR_SOURCES, SIDECAR_STAMP_FIELDS, SIDECAR_STAMP_FLAGS } from "./identity.js";
import { SIDECAR_ERROR_CODES } from "./errors.js";
import { SIDECAR_MESSAGES } from "./messages.js";
import { DESKTOP_UPDATE_ACTIONS, DESKTOP_UPDATE_CHANNELS, DESKTOP_UPDATE_MODES, DESKTOP_UPDATE_STATES } from "./desktop-update.js";
import { normalizeAppKey, normalizeNamespace, normalizeSidecarSource, normalizeSidecarStamp, normalizeSidecarStampCriteria } from "./stamp.js";

/**
 * @module contract
 *
 * The aggregate {@link OpenDesignSidecarContract} descriptor
 * (OPEN_DESIGN_SIDECAR_CONTRACT) bundling the package's constants and
 * normalizers into a single frozen value for consumers that want the whole
 * protocol surface in one import.
 */

export type OpenDesignSidecarContract = {
  appKeys: typeof APP_KEYS;
  defaults: typeof SIDECAR_DEFAULTS;
  env: typeof SIDECAR_RUNTIME_ENV;
  errorCodes: typeof SIDECAR_ERROR_CODES;
  messages: typeof SIDECAR_MESSAGES;
  modes: typeof SIDECAR_MODES;
  normalizeApp: typeof normalizeAppKey;
  normalizeNamespace: typeof normalizeNamespace;
  normalizeSource: typeof normalizeSidecarSource;
  normalizeStamp: typeof normalizeSidecarStamp;
  normalizeStampCriteria: typeof normalizeSidecarStampCriteria;
  sources: typeof SIDECAR_SOURCES;
  stampFields: typeof SIDECAR_STAMP_FIELDS;
  stampFlags: typeof SIDECAR_STAMP_FLAGS;
  updateActions: typeof DESKTOP_UPDATE_ACTIONS;
  updateChannels: typeof DESKTOP_UPDATE_CHANNELS;
  updateModes: typeof DESKTOP_UPDATE_MODES;
  updateStates: typeof DESKTOP_UPDATE_STATES;
};

/** Frozen aggregate of the sidecar protocol: constants + normalizers as one descriptor. */
export const OPEN_DESIGN_SIDECAR_CONTRACT = Object.freeze({
  appKeys: APP_KEYS,
  defaults: SIDECAR_DEFAULTS,
  env: SIDECAR_RUNTIME_ENV,
  errorCodes: SIDECAR_ERROR_CODES,
  messages: SIDECAR_MESSAGES,
  modes: SIDECAR_MODES,
  normalizeApp: normalizeAppKey,
  normalizeNamespace,
  normalizeSource: normalizeSidecarSource,
  normalizeStamp: normalizeSidecarStamp,
  normalizeStampCriteria: normalizeSidecarStampCriteria,
  sources: SIDECAR_SOURCES,
  stampFields: SIDECAR_STAMP_FIELDS,
  stampFlags: SIDECAR_STAMP_FLAGS,
  updateActions: DESKTOP_UPDATE_ACTIONS,
  updateChannels: DESKTOP_UPDATE_CHANNELS,
  updateModes: DESKTOP_UPDATE_MODES,
  updateStates: DESKTOP_UPDATE_STATES,
} as const satisfies OpenDesignSidecarContract);
