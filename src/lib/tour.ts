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

// ─── Per-page module tours (added 2026-07-29 — Quotation/Products tour steps) ──────────────────
// Same per-user localStorage convention as the main tour above, but keyed per tour so each page's
// walkthrough tracks its own "seen" state independently (a user who finished the Dashboard tour
// still gets the Quotation page's one-time walkthrough the first time they open that page).

const PAGE_TOUR_KEY_PREFIX = "tcs_erp_page_tour_completed:";

function readPageTourIds(tourKey: string): string[] {
  try {
    const raw = localStorage.getItem(PAGE_TOUR_KEY_PREFIX + tourKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function hasPageTourCompleted(tourKey: string, userId: string): boolean {
  return readPageTourIds(tourKey).includes(userId);
}

export function markPageTourCompleted(tourKey: string, userId: string): void {
  const ids = readPageTourIds(tourKey);
  if (!ids.includes(userId)) {
    try {
      localStorage.setItem(PAGE_TOUR_KEY_PREFIX + tourKey, JSON.stringify([...ids, userId]));
    } catch {
      // Same harmless degradation as markTourCompleted above.
    }
  }
}
