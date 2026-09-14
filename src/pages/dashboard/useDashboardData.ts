import { useEffect, useState } from "react";
import { fetchDashboardStats, type DashboardFilters } from "../../lib/dashboard";
import { fetchDepartmentDashboard, type DepartmentDashboardView } from "../../lib/departmentDashboard";
import { fetchArDashboardStats } from "../../lib/accountingDashboard";
import { fetchApSummary } from "../../lib/apEntries";

/**
 * ที่พักข้อมูลของหน้าแดชบอร์ด (2026-09-14) — สลับแท็บไปมาแล้วไม่ต้องโหลดใหม่
 *
 * The cache lives as long as the page is mounted (a sidebar re-click remounts it and so starts
 * fresh). Every request is keyed by its full parameters *including* a retry token, so "reload" is
 * just a new key — nothing is ever invalidated in place.
 *
 * The effect below depends only on the serialized key: the request is re-parsed inside it instead of
 * closing over a fetcher, which is what keeps `react-hooks/exhaustive-deps` honest without a disable.
 */

export type DashboardRequest =
  | { kind: "sales"; filters: DashboardFilters; retry: number }
  | { kind: "departments"; view: DepartmentDashboardView; from: string; to: string; retry: number }
  | { kind: "arSnapshot"; retry: number }
  | { kind: "apMonth"; month: string; retry: number };

interface Entry {
  data?: unknown;
  error?: boolean;
  pending?: Promise<void>;
}

export class DashboardDataCache {
  readonly entries = new Map<string, Entry>();
  /** ข้อมูลที่โหลดสำเร็จล่าสุดของแต่ละช่อง — แสดงไว้ระหว่างโหลดรอบใหม่ แทนที่จะกะพริบเป็นโครงเปล่า */
  readonly lastBySlot = new Map<string, unknown>();
}

function slotOf(req: DashboardRequest): string {
  if (req.kind === "departments") return `departments:${req.view}`;
  if (req.kind === "sales") return `sales:${req.filters.salesperson ?? "all"}:${req.filters.department ?? "all"}`;
  return req.kind;
}

function run(req: DashboardRequest): Promise<unknown> {
  switch (req.kind) {
    case "sales": return fetchDashboardStats(req.filters);
    case "departments": return fetchDepartmentDashboard(req.view, { from: req.from, to: req.to });
    // ตัวเลขที่ภาพรวมใช้จาก ar-dashboard เป็น "ณ ปัจจุบัน" ทั้งหมด จึงไม่ส่งช่วงวันที่
    case "arSnapshot": return fetchArDashboardStats();
    case "apMonth": return fetchApSummary(req.month);
  }
}

export interface DashboardData<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
}

/** `request` เป็น null = ไม่ต้องใช้ข้อมูลนี้ในแท็บปัจจุบัน */
export function useDashboardData<T>(cache: DashboardDataCache, request: DashboardRequest | null): DashboardData<T> {
  const key = request ? JSON.stringify(request) : null;
  const [, rerender] = useState(0);

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const refresh = () => { if (!cancelled) rerender((n) => n + 1); };
    const existing = cache.entries.get(key);
    if (existing) {
      existing.pending?.then(refresh);
      return () => { cancelled = true; };
    }
    const parsed = JSON.parse(key) as DashboardRequest;
    const entry: Entry = {};
    entry.pending = run(parsed).then(
      (data) => { entry.data = data; cache.lastBySlot.set(slotOf(parsed), data); },
      (err) => { entry.error = true; console.error("[dashboard] load failed", parsed.kind, err); },
    ).finally(() => { entry.pending = undefined; });
    cache.entries.set(key, entry);
    entry.pending.then(refresh);
    return () => { cancelled = true; };
  }, [key, cache]);

  if (key === null || request === null) return { data: null, loading: false, error: false };
  const entry = cache.entries.get(key);
  const settled = !!entry && !entry.pending;
  const data = (entry?.data ?? cache.lastBySlot.get(slotOf(request)) ?? null) as T | null;
  return { data, loading: !settled, error: settled && !!entry?.error };
}
