/** Everything the Expenses tab keeps on this phone for offline use (a copy of the family's data) starts with this. */
export const FAMILY_CACHE_PREFIX = 'fm.exp.'

/**
 * Forgets the saved copy of the family's data. Called when someone signs out, so the next person who signs in on
 * this phone never sees it (it can include private entries). Entries still waiting to upload are NOT removed:
 * they are kept per person and belong to whoever made them.
 */
export function clearSavedFamilyData() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(FAMILY_CACHE_PREFIX)) localStorage.removeItem(key)
    }
  } catch { /* storage unavailable */ }
}
