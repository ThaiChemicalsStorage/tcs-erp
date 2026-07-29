import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useI18n } from "../lib/i18n";
import { hasPageTourCompleted, markPageTourCompleted } from "../lib/tour";

/**
 * First-time-user guided tour (2026-07-10 UI/UX pass) — a thin wrapper around `driver.js`
 * (picked over React Joyride: this app has no complex tour-state machine to coordinate with
 * React's render cycle, and driver.js needing no React-specific integration is a smaller,
 * lighter dependency for a straightforward "point at real elements, explain them" walkthrough).
 *
 * Each tour is scoped to elements that are on-screen together rather than choreographing
 * navigation between pages mid-tour, which would need real coordination with this app's flat
 * `activeNav` state — a bigger, separately-scoped undertaking. `data-tour="..."` attributes mark
 * the real targets. **2026-07-29**: the driver wiring was extracted into `useDriverTour()` and
 * per-page module tours added (`useModuleTour()` — Quotation list + Products list so far); the
 * original sidebar/topbar/Dashboard walkthrough (`useGuidedTour()`) is unchanged.
 */
function useDriverTour(steps: DriveStep[], onFinish?: () => void) {
  const { t } = useI18n();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  const start = () => {
    // Only include steps whose target actually exists on screen right now (e.g. the notification
    // bell/user menu are always mounted, but a permission-gated Dashboard section might not be) —
    // driver.js has no built-in "skip missing element" behavior, so filter defensively.
    const availableSteps = steps.filter((s) => typeof s.element !== "string" || document.querySelector(s.element));
    if (availableSteps.length === 0) return;
    driverRef.current = driver({
      showProgress: true,
      progressText: t("onboarding.progress"),
      nextBtnText: t("onboarding.next"),
      prevBtnText: t("onboarding.back"),
      doneBtnText: t("onboarding.done"),
      steps: availableSteps,
      // Fires whether the tour was completed (Done) or dismissed early (the × close button /
      // Escape) — both count as "the user has seen the tour," so it doesn't need to nag again.
      onDestroyed: () => onFinish?.(),
    });
    driverRef.current.drive();
  };

  const stop = () => {
    driverRef.current?.destroy();
  };

  useEffect(() => stop, []);

  return { start, stop };
}

/** The original first-sign-in walkthrough (sidebar, topbar, Dashboard) — offered once per user
 * via App.tsx's Start/Skip banner, restartable from the user menu. */
export function useGuidedTour(onFinish?: () => void) {
  const { t } = useI18n();
  const steps: DriveStep[] = [
    { element: '[data-tour="sidebar-nav"]', popover: { title: t("onboarding.step.sidebar.title"), description: t("onboarding.step.sidebar.desc"), side: "right" } },
    { element: '[data-tour="dashboard-title"]', popover: { title: t("onboarding.step.dashboard.title"), description: t("onboarding.step.dashboard.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-filters"]', popover: { title: t("onboarding.step.filters.title"), description: t("onboarding.step.filters.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-kpis"]', popover: { title: t("onboarding.step.kpis.title"), description: t("onboarding.step.kpis.desc"), side: "top" } },
    { element: '[data-tour="notification-bell"]', popover: { title: t("onboarding.step.notifications.title"), description: t("onboarding.step.notifications.desc"), side: "bottom" } },
    { element: '[data-tour="user-menu"]', popover: { title: t("onboarding.step.profile.title"), description: t("onboarding.step.profile.desc"), side: "bottom" } },
  ];
  return useDriverTour(steps, onFinish);
}

/**
 * Per-page module tour (added 2026-07-29 — Quotation list + Products list). Auto-starts ONCE per
 * user the first time they open the page (after a short delay so the page has painted), tracked
 * per `tourKey` in localStorage (src/lib/tour.ts) — closing/skipping counts as seen, same
 * convention as the main tour. The returned `start` backs the page's "ดูคำแนะนำหน้านี้" replay
 * button. Mount it in the page's LIST view component (not the page shell) so it can never fire
 * over a detail/editor view.
 */
export function useModuleTour(tourKey: string, userId: string, steps: DriveStep[]) {
  const { start, stop } = useDriverTour(steps, () => markPageTourCompleted(tourKey, userId));
  // Latest-closure ref so the auto-start effect doesn't need `steps`/`start` (rebuilt every
  // render) in its dependency list — it must fire exactly once per page visit per user.
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    if (hasPageTourCompleted(tourKey, userId)) return;
    const timer = setTimeout(() => startRef.current(), 600);
    return () => clearTimeout(timer);
  }, [tourKey, userId]);
  return { start, stop };
}
