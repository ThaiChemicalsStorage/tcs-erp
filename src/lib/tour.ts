const STORAGE_KEY = "tcs_erp_tour_completed_user_ids";

// อ่านรายชื่อ user id ที่ทำทัวร์แนะนำจบแล้วจาก localStorage
// Reads the list of user IDs who have completed the guided tour from localStorage.
function readCompletedIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// ตรวจว่าผู้ใช้คนนี้ทำทัวร์แนะนำจบแล้วหรือยัง
// Checks whether this user has already completed the guided tour.
export function hasTourCompleted(userId: string): boolean {
  return readCompletedIds().includes(userId);
}

// บันทึกว่าผู้ใช้คนนี้ทำทัวร์แนะนำจบแล้ว
// Marks this user as having completed the guided tour.
export function markTourCompleted(userId: string): void {
  const ids = readCompletedIds();
  if (!ids.includes(userId)) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, userId]));
    } catch {
      // storage unavailable — harmless degradation, ignore
    }
  }
}

const PAGE_TOUR_KEY_PREFIX = "tcs_erp_page_tour_completed:";

// อ่านรายชื่อ user id ที่ทำทัวร์ของหน้านี้ (tourKey) จบแล้ว
// Reads the list of user IDs who have completed this page's tour (tourKey).
function readPageTourIds(tourKey: string): string[] {
  try {
    const raw = localStorage.getItem(PAGE_TOUR_KEY_PREFIX + tourKey);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// ตรวจว่าผู้ใช้คนนี้ทำทัวร์ของหน้านี้จบแล้วหรือยัง
// Checks whether this user has already completed this page's tour.
export function hasPageTourCompleted(tourKey: string, userId: string): boolean {
  return readPageTourIds(tourKey).includes(userId);
}

// บันทึกว่าผู้ใช้คนนี้ทำทัวร์ของหน้านี้จบแล้ว
// Marks this user as having completed this page's tour.
export function markPageTourCompleted(tourKey: string, userId: string): void {
  const ids = readPageTourIds(tourKey);
  if (!ids.includes(userId)) {
    try {
      localStorage.setItem(PAGE_TOUR_KEY_PREFIX + tourKey, JSON.stringify([...ids, userId]));
    } catch {
      // storage unavailable — harmless degradation, ignore
    }
  }
}
