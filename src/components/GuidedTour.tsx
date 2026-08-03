import { useEffect, useRef } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { useI18n } from "../lib/i18n";
import { hasPageTourCompleted, markPageTourCompleted } from "../lib/tour";

// สร้าง/ควบคุมทัวร์แนะนำด้วย driver.js ใช้เป็นแกนกลางให้ทัวร์อื่นๆ เรียกใช้
// Wraps driver.js to create and control a guided tour; the shared core other tours build on
function useDriverTour(steps: DriveStep[], onFinish?: () => void) {
  const { t } = useI18n();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const unmountingRef = useRef(false);

  const start = () => {
    const availableSteps = steps.filter((s) => typeof s.element !== "string" || document.querySelector(s.element));
    if (availableSteps.length === 0) return;
    driverRef.current = driver({
      showProgress: true,
      progressText: t("onboarding.progress"),
      nextBtnText: t("onboarding.next"),
      prevBtnText: t("onboarding.back"),
      doneBtnText: t("onboarding.done"),
      steps: availableSteps,
      onDestroyed: () => { if (!unmountingRef.current) onFinish?.(); },
    });
    driverRef.current.drive();
  };

  const stop = () => {
    driverRef.current?.destroy();
  };

  useEffect(() => () => {
    unmountingRef.current = true;
    driverRef.current?.destroy();
  }, []);

  return { start, stop };
}

// ทัวร์แนะนำครั้งแรกสำหรับผู้ใช้ใหม่ (sidebar, topbar, Dashboard) เริ่มครั้งเดียวต่อผู้ใช้ เปิดซ้ำได้จากเมนูผู้ใช้
// The original first-sign-in walkthrough (sidebar, topbar, Dashboard), offered once per user and restartable from the user menu
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

// ทัวร์แนะนำเฉพาะหน้า เริ่มอัตโนมัติครั้งเดียวต่อผู้ใช้ต่อหน้า และรองรับปุ่มดูทัวร์ซ้ำ
// Per-page module tour that auto-starts once per user per page, and supports a manual replay button
export function useModuleTour(tourKey: string, userId: string, steps: DriveStep[], opts?: { autoStart?: boolean }) {
  const autoStart = opts?.autoStart ?? true;
  const { start, stop } = useDriverTour(steps, () => markPageTourCompleted(tourKey, userId));
  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; });
  useEffect(() => {
    if (!autoStart || hasPageTourCompleted(tourKey, userId)) return;
    const timer = setTimeout(() => startRef.current(), 600);
    return () => clearTimeout(timer);
  }, [tourKey, userId, autoStart]);
  return { start, stop };
}
