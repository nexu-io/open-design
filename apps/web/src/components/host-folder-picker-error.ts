import {
  isHostPickWorkingDirUnsupported,
  type OpenDesignHostPickWorkingDirResult,
} from '@open-design/host';

/**
 * Message for a host folder pick that neither succeeded nor was canceled.
 * Only a host build without the picker capability asks the user to update;
 * a pick that ran and failed (e.g. a desktop-auth handshake timeout) can
 * succeed on retry, so it asks the user to try again.
 */
export function hostFolderPickerErrorMessage(result: OpenDesignHostPickWorkingDirResult): string {
  const reason = 'reason' in result ? result.reason : 'host unavailable';
  const advice = isHostPickWorkingDirUnsupported(result)
    ? 'Please update OpenDesign and try again.'
    : 'Please try again.';
  return `Couldn't open the folder picker (${reason}). ${advice}`;
}
