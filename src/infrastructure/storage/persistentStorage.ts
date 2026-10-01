/**
 * Asks the browser not to evict our data under storage pressure.
 * Returns true if storage is (now) persistent. Safe to call when unsupported.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
