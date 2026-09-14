import { useEffect, useMemo, useState } from "react";
import { Inbox, Search, X, Loader2, AlertTriangle } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { PENDING_KIND_LABEL_KEY } from "./kindLabels";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import {
  type PendingApprovalItem, type PendingApprovalKind,
  fetchPendingApprovals, daysWaiting,
} from "../../lib/pendingApprovals";

/**
 * กล่องงานเข้า "เอกสารรออนุมัติ" ข้ามแผนก — เจ้าของขอไว้ 2026-08-28:
 * *"เพิ่มหน้าเอกสารรออนุมัติทุกอย่าง เพราะแบบเฮดคนนึงต้องอนุมัติหลายแผนก"*
 *
 * หน้านี้**ไม่อนุมัติเอง** — กดแถวแล้วเด้งไปที่ตัวเอกสาร ซึ่งเป็นที่เดียวที่ปุ่มอนุมัติอยู่
 * ตั้งใจให้เป็นแบบนั้น: การอนุมัติเอกสารต้องเกิดหลังจากเห็นตัวเอกสาร ไม่ใช่จากแถวในตาราง และแต่ละใบ
 * มีเงื่อนไขก่อนอนุมัติของตัวเอง (Scope of Work ตรวจความครบก่อน ใบสั่งผลิตเติมชื่อผู้อนุมัติให้ ฯลฯ)
 * การทำปุ่มอนุมัติรวมตรงนี้แปลว่าต้องยกตรรกะพวกนั้นมาไว้อีกที่ ซึ่งเป็นวิธีที่มันจะเริ่มเพี้ยนจากกัน
 *
 * เซิร์ฟเวอร์กรองด้วย**สิทธิ์อนุมัติ**ให้แล้ว (ดู `api/_lib/pendingApprovals.ts`) หน้านี้จึงแสดง
 * ทุกอย่างที่ได้รับมา ไม่กรองสิทธิ์ซ้ำ
 */

const FILTER_ALL = "all";

/** ป้ายชนิดเอกสาร — ใช้ร่วมกับแท็บภาพรวมของแดชบอร์ด ดู kindLabels.ts */
const KIND_LABEL_KEY = PENDING_KIND_LABEL_KEY;

/** รอเกินกี่วันถึงเริ่มเตือน — ไม่ใช่กฎของบริษัท เป็นแค่เส้นให้สายตาจับได้ว่าใบไหนค้างนาน */
const STALE_DAYS = 3;

export function PendingApprovalsPage({ onOpen }: {
  onOpen: (item: PendingApprovalItem) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<PendingApprovalItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<string>(FILTER_ALL);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPendingApprovals()
      .then((list) => { if (!cancelled) { setItems(list); setLoadError(null); } })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : t("pendingApprovals.loadError"));
        setItems([]);
      });
    return () => { cancelled = true; };
  }, [t]);

  // แท็บชนิดเอกสารสร้างจากสิ่งที่ได้รับมาจริง ไม่ใช่ลิสต์ตายตัว — คนที่อนุมัติได้ชนิดเดียวจะเห็นแท็บเดียว
  const kindsPresent = useMemo(() => {
    const seen = new Map<PendingApprovalKind, number>();
    for (const it of items ?? []) seen.set(it.kind, (seen.get(it.kind) ?? 0) + 1);
    return [...seen.entries()];
  }, [items]);

  const q = searchQuery.trim().toLowerCase();
  const filtered = (items ?? [])
    .filter((it) => filterKind === FILTER_ALL || it.kind === filterKind)
    .filter((it) => !q || [it.docNumber, it.party, it.lineage, it.submittedBy, it.id].some((v) => (v ?? "").toLowerCase().includes(q)));

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("pendingApprovals.pageTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 font-mono">{t("pendingApprovals.pageSubtitle")}</p>
        </div>
        {items !== null && items.length > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20 text-xs font-semibold">
            {t("pendingApprovals.totalCount").replace("{n}", String(items.length))}
          </span>
        )}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#e05252]/10 border border-[#e05252]/20 text-sm text-[#a83232]">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {loadError}
        </div>
      )}

      {items === null ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <>
          {items.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative h-9 w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("pendingApprovals.searchPlaceholder")}
                  aria-label={t("pendingApprovals.searchPlaceholder")}
                  className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} aria-label={t("common.close")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-xl p-1 min-h-9 w-fit flex-wrap">
                <button onClick={() => setFilterKind(FILTER_ALL)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterKind === FILTER_ALL ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                  {t("quotation.filterAll")}
                </button>
                {kindsPresent.map(([kind, count]) => (
                  <button key={kind} onClick={() => setFilterKind(kind)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterKind === kind ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                    {t(KIND_LABEL_KEY[kind])}
                    <span className="ml-1.5 font-mono opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {items.length === 0 ? (
              <EmptyState icon={Inbox} title={t("empty.pendingApprovals.title")} description={t("empty.pendingApprovals.sub")} compact />
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <Inbox size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{t("pendingApprovals.noFilterResults")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {[
                        t("pendingApprovals.col.kind"), t("pendingApprovals.col.docNumber"),
                        t("pendingApprovals.col.party"), t("pendingApprovals.col.lineage"),
                        t("pendingApprovals.col.submittedBy"), t("pendingApprovals.col.waiting"),
                      ].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((it) => {
                      const days = daysWaiting(it.waitingSince);
                      return (
                        <tr
                          key={`${it.kind}:${it.id}`}
                          tabIndex={0}
                          role="button"
                          aria-label={`${t("pendingApprovals.openRow")} ${it.docNumber || it.party}`}
                          onClick={() => onOpen(it)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(it); } }}
                          className="border-b border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 focus-visible:bg-secondary/30"
                        >
                          <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{t(KIND_LABEL_KEY[it.kind])}</td>
                          <td className="px-4 py-3.5 text-xs font-mono text-[#c9a84c] font-semibold whitespace-nowrap">{it.docNumber || "—"}</td>
                          <td className="px-4 py-3.5 text-sm text-foreground max-w-[240px] truncate" title={it.party}>{it.party || "—"}</td>
                          <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{it.lineage || "—"}</td>
                          <td className="px-4 py-3.5 text-xs text-muted-foreground max-w-[160px] truncate" title={it.submittedBy}>{it.submittedBy || "—"}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {/* วันที่ที่แสดงคือ "แก้ไขล่าสุด" ไม่ใช่เวลากดส่งจริง สำหรับ 9 ใน 10 ชนิด —
                                ระบบยังไม่เก็บเวลากดส่ง ดู api/_lib/pendingApprovals.ts */}
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                              days >= STALE_DAYS
                                ? "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20"
                                : "bg-muted text-muted-foreground border border-border"
                            }`}>
                              {days === 0 ? t("pendingApprovals.waitingToday") : t("pendingApprovals.waitingDays").replace("{n}", String(days))}
                            </span>
                            <span className="ml-2 text-xs font-mono text-muted-foreground">
                              {it.waitingSince ? formatQuoteDateThai(it.waitingSince.slice(0, 10)) : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
