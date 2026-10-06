import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// จัดการปิดด้วยปุ่ม Escape และดักโฟกัสให้วนอยู่ในกล่องโต้ตอบ (focus trap) สำหรับ dialog แบบ modal
// Handles Escape-to-close and a Tab focus trap for a modal dialog
export function useDialogA11y(onCancel: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  // ปุ่ม/ช่องที่เปิดกล่องนี้ — จับไว้ตั้งแต่ render แรก ก่อน autoFocus ในกล่องจะย้ายโฟกัสไป แล้วคืนโฟกัสให้ตอนกล่องปิด
  // ผู้ใช้คีย์บอร์ด/โปรแกรมอ่านหน้าจอจะได้กลับมาที่เดิม ไม่หลุดไปต้นหน้า (2026-10-06, Tuhmo #27)
  const openerRef = useRef<HTMLElement | null>(typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null);

  useEffect(() => {
    const opener = openerRef.current;
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCancel(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return panelRef;
}
