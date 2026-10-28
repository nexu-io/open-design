/** Desktop login-status reads carry the UI locale before analytics initializes.
 * This is an optimization hint, never evidence of authentication or consent.
 */
export const TOUCHPOINT_PREFETCH_LOCALE_HEADER = 'x-od-touchpoint-locale';
