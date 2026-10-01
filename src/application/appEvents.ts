/**
 * Browser events used to tell the UI about the offline app shell, without the UI having to know
 * how the service worker is implemented.
 */
export const UPDATE_READY_EVENT = 'memorize:update-ready';
export const OFFLINE_READY_EVENT = 'memorize:offline-ready';

/** Detail of UPDATE_READY_EVENT: call `apply()` to switch to the new version (the page then reloads). */
export interface UpdateReadyDetail {
  apply(): void;
}
