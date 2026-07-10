/**
 * Guided-tour completion state — per-user, stored in `localStorage` (not MongoDB: this is a
 * client-side UI preference, not business data, so a schema/API change wasn't warranted for it).
 * Added 2026-07-10 UI/UX pass.
 */
const STORAGE_KEY = "tcs_erp_tour_completed_user_ids";

function readCompletedIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function hasTourCompleted(userId: string): boolean {
  return readCompletedIds().includes(userId);
}

export function markTourCompleted(userId: string): void {
  const ids = readCompletedIds();
  if (!ids.includes(userId)) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, userId]));
    } catch {
      // Storage unavailable (private browsing, quota) — the tour will just offer itself again
      // next sign-in, which is a harmless degradation, not a functional failure.
    }
  }
}
