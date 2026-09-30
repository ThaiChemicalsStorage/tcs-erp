import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useI18n } from "../lib/i18n";
import { hasPageTourCompleted, markPageTourCompleted } from "../lib/tour";
import { manualHref, manualLabel } from "../lib/manualSections";

/**
 * ขั้นหนึ่งของคำแนะนำ + รหัสหัวข้อในคู่มือ (`chN-k` ใน src/lib/manualSections.ts)
 * ดีไซน์ใหม่ (2026-09-30): ทุกขั้นบอกสั้น ๆ ประโยคเดียว แล้วมีลิงก์ "ยังไม่เข้าใจ? อ่านในคู่มือ" พาไปหัวข้อนั้นในแท็บใหม่
 */
export type TourStep = DriveStep & { manual?: string };

const ICON_BOOK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>';
const ICON_EXT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>';

// สร้าง/ควบคุมทัวร์แนะนำด้วย driver.js ใช้เป็นแกนกลางให้ทัวร์อื่นๆ เรียกใช้
// Wraps driver.js to create and control a guided tour; the shared core other tours build on
function useDriverTour(steps: TourStep[], onFinish?: () => void) {
  const { t } = useI18n();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const unmountingRef = useRef(false);

  /** Returns whether the tour actually rendered — false when none of its step anchors exist yet.
   *  Callers that record a tour as "seen" on start must check this, or a tour that never appeared
   *  would be suppressed forever. */
  const start = (): boolean => {
    const availableSteps = steps.filter((s) => typeof s.element !== "string" || document.querySelector(s.element));
    if (availableSteps.length === 0) return false;
    driverRef.current = driver({
      showProgress: true,
      progressText: t("onboarding.progress"),
      nextBtnText: t("onboarding.next"),
      prevBtnText: t("onboarding.back"),
      doneBtnText: t("onboarding.done"),
      steps: availableSteps,
      popoverClass: "tcs-tour",
      overlayColor: "#0b1d3a",
      overlayOpacity: 0.55,
      stagePadding: 6,
      stageRadius: 10,
      // แถบความคืบหน้าข้าง "ขั้นที่ X จาก Y" + ลิงก์ไปคู่มือ — driver.js วาดกล่องเอง จึงเติมหลังวาด
      onPopoverRender: (popover, { state }) => {
        const index = state.activeIndex ?? 0;
        const top = document.createElement("div");
        top.className = "tcs-tour-top";
        const bars = document.createElement("span");
        bars.className = "tcs-tour-bars";
        availableSteps.forEach((_, i) => {
          const bar = document.createElement("span");
          if (i <= index) bar.dataset.on = "";
          bars.appendChild(bar);
        });
        top.append(popover.progress, bars);
        popover.title.before(top);
        const id = availableSteps[index]?.manual;
        const label = id ? manualLabel(id) : null;
        if (id && label) {
          const link = document.createElement("a");
          link.className = "tcs-tour-manual";
          link.href = manualHref(id);
          link.target = "_blank";
          link.rel = "noreferrer";
          const icon = document.createElement("span");
          icon.className = "tcs-tour-manual-icon";
          icon.innerHTML = ICON_BOOK;
          const text = document.createElement("span");
          text.className = "tcs-tour-manual-text";
          const strong = document.createElement("strong");
          strong.textContent = t("tour.manualLink");
          const small = document.createElement("small");
          small.textContent = label;
          text.append(strong, small);
          const ext = document.createElement("span");
          ext.className = "tcs-tour-manual-ext";
          ext.innerHTML = ICON_EXT;
          link.append(icon, text, ext);
          popover.footer.before(link);
        }
      },
      onDestroyed: () => { if (!unmountingRef.current) onFinish?.(); },
    });
    driverRef.current.drive();
    return true;
  };

  const stop = () => {
    driverRef.current?.destroy();
  };

  /**
   * `unmountingRef` exists so a tour torn down because the page unmounted isn't recorded as
   * "completed" — the user never finished it. It MUST be reset on setup, not just set on cleanup:
   * React 18 StrictMode runs effects mount → cleanup → mount again in development, and refs survive
   * that (it's the same component instance). Without this reset the flag latched `true` on the
   * simulated unmount and stayed true forever, so `onDestroyed` never called `onFinish`,
   * `markPageTourCompleted()` never ran, and every tour re-auto-played on every visit in dev.
   */
  useEffect(() => {
    unmountingRef.current = false;
    return () => {
      unmountingRef.current = true;
      driverRef.current?.destroy();
    };
  }, []);

  return { start, stop };
}

// ทัวร์แนะนำครั้งแรกสำหรับผู้ใช้ใหม่ (sidebar, topbar, Dashboard) เริ่มครั้งเดียวต่อผู้ใช้ เปิดซ้ำได้จากเมนูผู้ใช้
// The original first-sign-in walkthrough (sidebar, topbar, Dashboard), offered once per user and restartable from the user menu
export function useGuidedTour(onFinish?: () => void) {
  const { t } = useI18n();
  const steps: TourStep[] = [
    { element: '[data-tour="sidebar-nav"]', popover: { title: t("onboarding.step.sidebar.title"), description: t("onboarding.step.sidebar.desc"), side: "right" } },
    { element: '[data-tour="dashboard-title"]', popover: { title: t("onboarding.step.dashboard.title"), description: t("onboarding.step.dashboard.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-filters"]', popover: { title: t("onboarding.step.filters.title"), description: t("onboarding.step.filters.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-kpis"]', popover: { title: t("onboarding.step.kpis.title"), description: t("onboarding.step.kpis.desc"), side: "top" } },
    { element: '[data-tour="notification-bell"]', popover: { title: t("onboarding.step.notifications.title"), description: t("onboarding.step.notifications.desc"), side: "bottom" } },
    { element: '[data-tour="user-menu"]', popover: { title: t("onboarding.step.profile.title"), description: t("onboarding.step.profile.desc"), side: "bottom" } },
  ];
  return useDriverTour(steps, onFinish);
}

// ทัวร์แนะนำเฉพาะหน้า เริ่มอัตโนมัติครั้งเดียวต่อผู้ใช้ต่อหน้า และรองรับปุ่มดูทัวร์ซ้ำ
/**
 * Per-page module tour: auto-starts once per user per page, plus a manual replay button.
 *
 * **"Seen" is recorded when the automatic play actually renders — not when it's dismissed**
 * (changed 2026-08-07). Marking on dismissal meant a user who let the tour sit and navigated away
 * got no completion event at all (the unmount path deliberately suppresses it), so it auto-played
 * again on the next visit. Appearing once is the thing the user experiences, so appearing once is
 * what gets recorded. `start()`'s return value matters here: a tour whose step anchors aren't in
 * the DOM never rendered, and must not be marked, or it would be suppressed having never been seen.
 *
 * The **manual replay path deliberately writes nothing at all**. It shares `start()` but not the
 * marking, so replaying on demand has no persistent side effect — in particular it can't mark a
 * tour "seen" that the user never got the automatic play of (e.g. on a page whose `autoStart` gate
 * hasn't opened yet). `useDriverTour`'s own dismissal tracking is untouched and still serves
 * `useGuidedTour` (the main first-login tour) exactly as before.
 */
export function useModuleTour(tourKey: string, userId: string, steps: TourStep[], opts?: { autoStart?: boolean }) {
  const autoStart = opts?.autoStart ?? true;
  const { start, stop } = useDriverTour(steps);
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    if (!autoStart || hasPageTourCompleted(tourKey, userId)) return;
    const timer = setTimeout(() => {
      if (startRef.current()) markPageTourCompleted(tourKey, userId);
    }, 600);
    return () => clearTimeout(timer);
  }, [tourKey, userId, autoStart]);
  return { start, stop };
}
