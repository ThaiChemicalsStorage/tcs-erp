import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useI18n } from "../lib/i18n";

/**
 * First-time-user guided tour (2026-07-10 UI/UX pass) — a thin wrapper around `driver.js`
 * (picked over React Joyride: this app has no complex tour-state machine to coordinate with
 * React's render cycle, and driver.js needing no React-specific integration is a smaller,
 * lighter dependency for a straightforward "point at real elements, explain them" walkthrough).
 *
 * Scoped to elements that are on-screen together (sidebar, topbar, Dashboard) rather than
 * choreographing navigation to other pages mid-tour, which would need real coordination with
 * this app's flat `activeNav` state — a bigger, separately-scoped undertaking. `data-tour="..."`
 * attributes mark the real targets; add a new step here (and the matching attribute on its
 * target element) to extend the tour later.
 */
export function useGuidedTour(onFinish?: () => void) {
  const { t } = useI18n();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  const steps: DriveStep[] = [
    { element: '[data-tour="sidebar-nav"]', popover: { title: t("onboarding.step.sidebar.title"), description: t("onboarding.step.sidebar.desc"), side: "right" } },
    { element: '[data-tour="dashboard-title"]', popover: { title: t("onboarding.step.dashboard.title"), description: t("onboarding.step.dashboard.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-filters"]', popover: { title: t("onboarding.step.filters.title"), description: t("onboarding.step.filters.desc"), side: "bottom" } },
    { element: '[data-tour="dashboard-kpis"]', popover: { title: t("onboarding.step.kpis.title"), description: t("onboarding.step.kpis.desc"), side: "top" } },
    { element: '[data-tour="notification-bell"]', popover: { title: t("onboarding.step.notifications.title"), description: t("onboarding.step.notifications.desc"), side: "bottom" } },
    { element: '[data-tour="user-menu"]', popover: { title: t("onboarding.step.profile.title"), description: t("onboarding.step.profile.desc"), side: "bottom" } },
  ];

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
