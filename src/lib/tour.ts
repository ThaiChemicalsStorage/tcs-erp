const STORAGE_KEY = "tcs_erp_tour_completed_user_ids";

/**
 * สวิตช์ปิดทัวร์ทั้งหมดในเบราว์เซอร์นี้ (2026-10-06, Tuhmo #43) — ใช้ตอนถ่ายภาพหน้าจอทำคู่มือ ทัวร์ประจำหน้าจะได้ไม่เด้งบัง
 * เปิด: `localStorage.setItem("tcs_erp_tours_disabled", "1")` · ปิด: `removeItem` · ปุ่มเล่นทัวร์ซ้ำยังกดได้ตามปกติ
 * ดูวิธีใช้กับ Playwright ใน docs/manual/README.md
 */
export const TOURS_DISABLED_KEY = "tcs_erp_tours_disabled";

function toursDisabled(): boolean {
  try {
    return localStorage.getItem(TOURS_DISABLED_KEY) === "1";
  } catch {
    return false;
  }
}

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
  return toursDisabled() || readCompletedIds().includes(userId);
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
  return toursDisabled() || readPageTourIds(tourKey).includes(userId);
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
