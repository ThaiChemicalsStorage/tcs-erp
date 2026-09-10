import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, PackageCheck, PackageMinus, Search, Send, X } from "lucide-react";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";
import { formatQuoteDateThai } from "../../lib/quotes";
import {
  type MaterialRequisition, type MaterialRequisitionSummary,
  fetchMaterialRequisition, fetchStoreIssueQueue, postMaterialIssueBatch,
  issuedQtyOf, outstandingQtyOf, issueBatchesOf,
} from "../../lib/materialRequisition";

const FILTER_ALL = "all";
const inputCls = "h-9 w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 outline-none focus:border-[#c9a84c]/50 transition-colors";

/**
 * **หน้าตัดของของสโตร์** (2026-09-10) — เจ้าของสั่ง *"เพิ่มหน้าตัดของ ของสโตร์มา แยกออกมาจากใบ"*
 * ต่อจากคำถามเมื่อ 2026-09-09 ว่า *"แล้วสโตร์จะดูจากตรงไหนว่ามีใบไหนมาให้ตัด"*
 *
 * **ทำไมต้องเป็นหน้าใหม่ ไม่ใช่ตัวกรองในหน้าใบเบิกเดิม** — หน้าใบเบิกถูกเมาต์สองครั้ง (กลุ่มโครงการ
 * และกลุ่มผลิต) และแต่ละครั้งเห็นเฉพาะใบของฝ่ายตัวเอง สโตร์จึงต้องไล่ดูสองเมนูเพื่อหางานของตัวเอง
 * ที่มาจากคลังเดียวกัน · หน้านี้รวมทั้งสองฝ่ายไว้ที่เดียว เรียงใบที่รอนานที่สุดขึ้นก่อน และ**จ่ายจบได้
 * ในหน้านี้เลย** ไม่ต้องเปิดเข้าไปในใบ ซึ่งคือความหมายของ "แยกออกมาจากใบ"
 *
 * ไม่ใช่ทางจ่ายของทางที่สอง — ปุ่มบันทึกยิง `POST /:id/issues` ตัวเดียวกับการ์ดจ่ายของในใบเบิก
 * (สิทธิ์ `stock:adjust` · ตัดสต๊อกจริง · เป็นรอบ ยกเลิกรอบล่าสุดได้จากในใบ) หน้านี้เป็นแค่ทางเข้า
 * ที่สั้นกว่า ไม่ได้เก็บตัวเลขชุดของตัวเองไว้ที่ไหนเลย
 *
 * ช่อง "ตัดของแผนกไหน/ทีมไหน/เข้างานอะไร" ไม่มีที่นี่โดยตั้งใจ — ไม่ส่งค่าไปแปลว่ารอบนี้ใช้ค่าที่อยู่
 * บนใบอยู่แล้ว (`resolveChargeFromBody` แตะเฉพาะคีย์ที่ส่งมา) คนที่ต้องการเปลี่ยนแผนกที่รับของ
 * กด "เปิดใบเบิก" ไปแก้ในใบ ซึ่งเป็นที่ที่เห็นบริบททั้งใบ
 */
export function StoreIssueInboxPage({
  currentUserName,
  onOpenDocument,
}: {
  /** ชื่อผู้ใช้ปัจจุบัน — เติมให้ช่อง "ผู้จ่ายของ" ไว้ก่อน แก้ได้ (เซิร์ฟเวอร์ก็ fallback ตัวเดียวกัน) */
  currentUserName: string;
  /** เปิดใบเบิกเต็มใบ — ไปที่เมนูของฝ่ายเจ้าของใบ ไม่ใช่ฝ่ายที่ผู้ใช้เปิดค้างไว้ */
  onOpenDocument?: (id: string, ownerDepartment: "project" | "production") => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [queue, setQueue] = useState<MaterialRequisitionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDept, setFilterDept] = useState<string>(FILTER_ALL);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ doc: MaterialRequisition; stock: Record<string, number> } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [issueQty, setIssueQty] = useState<Record<string, string>>({});
  const [issuedBy, setIssuedBy] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [issueRemark, setIssueRemark] = useState("");
  const [saving, setSaving] = useState(false);

  const loadQueue = () => {
    setLoading(true);
    setLoadError(false);
    return fetchStoreIssueQueue()
      .then((list) => { setQueue(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchStoreIssueQueue()
      .then((list) => { if (!cancelled) { setQueue(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  /**
   * เปิดใบไหนก็โหลดใบนั้นทีละใบ — คิวมีได้หลายสิบใบ การโหลดล่วงหน้าทั้งคิวคือการดึงทุกบรรทัดของทุกใบ
   * มาไว้เฉย ๆ ทั้งที่สโตร์จ่ายทีละใบอยู่แล้ว
   *
   * โหลดจากตัวจัดการคลิกโดยตรง ไม่ใช่จากเอฟเฟกต์ที่ตาม `openId` — กดสลับใบเร็ว ๆ แล้วคำตอบของใบก่อน
   * มาทีหลัง จะทับใบที่เปิดอยู่ `loadSeq` ตัดคำตอบที่ล้าสมัยทิ้ง
   */
  const loadSeq = useRef(0);
  const openRow = (id: string) => {
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    setDetailError(false);
    fetchMaterialRequisition(id)
      .then(({ materialRequisition, stockByProduct }) => {
        if (seq !== loadSeq.current) return;
        setDetail({ doc: materialRequisition, stock: stockByProduct });
        setIssueQty({});
        setIssueRemark("");
        setIssuedBy(materialRequisition.storeDeptBy || currentUserName);
        setIssueDate(new Date().toISOString().slice(0, 10));
        setDetailLoading(false);
      })
      .catch(() => {
        if (seq !== loadSeq.current) return;
        setDetailError(true);
        setDetailLoading(false);
      });
  };
  const closeRow = () => {
    loadSeq.current += 1;
    setOpenId(null);
    setDetail(null);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const departmentLabel = (dept: string) => (dept === "production" ? t("storeIssue.dept.production") : t("storeIssue.dept.project"));
  const rows = queue
    .map((m) => ({ ...m, documentNumber: m.documentNumber || m.id, ownerDepartment: m.ownerDepartment ?? "project" }))
    .filter((m) => filterDept === FILTER_ALL || m.ownerDepartment === filterDept)
    .filter((m) => !normalizedSearch || [m.id, m.documentNumber, m.jobCode ?? "", m.productionOrderId ?? "", m.customerName ?? "", m.chargeTeamName ?? ""]
      .some((v) => v.toLowerCase().includes(normalizedSearch)));

  /** เติมช่องจ่ายด้วยจำนวนที่จ่ายได้จริง — ค้างเบิก แต่ไม่เกินของที่มีในคลัง */
  const fillIssuable = () => {
    if (!detail) return;
    const next: Record<string, string> = {};
    for (const line of detail.doc.lines) {
      const outstanding = outstandingQtyOf(line);
      if (outstanding <= 0) continue;
      const stock = detail.stock[line.productId];
      const qty = stock === undefined ? outstanding : Math.min(outstanding, stock);
      if (qty > 0) next[line.id] = String(qty);
    }
    setIssueQty(next);
  };

  const submitIssue = async () => {
    if (!detail) return;
    const lines = detail.doc.lines
      .map((l) => ({ lineId: l.id, qty: Number(issueQty[l.id] ?? "") }))
      .filter((l) => Number.isFinite(l.qty) && l.qty > 0);
    if (lines.length === 0) {
      toast.show(t("storeIssue.emptyQty"));
      return;
    }
    setSaving(true);
    try {
      const { materialRequisition, stockByProduct } = await postMaterialIssueBatch(detail.doc.id, {
        lines, issuedDate: issueDate, issuedBy, remark: issueRemark,
      });
      setIssueQty({});
      setIssueRemark("");
      const stillOutstanding = materialRequisition.lines.some((l) => outstandingQtyOf(l) > 0);
      if (stillOutstanding) {
        setDetail({ doc: materialRequisition, stock: stockByProduct });
        toast.show(t("storeIssue.savedPartial"));
      } else {
        closeRow();
        toast.show(t("storeIssue.savedDone"));
      }
      await loadQueue();
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("storeIssue.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <PageHeader title={t("storeIssue.pageTitle")} description={t("storeIssue.pageSubtitle")} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative h-9 w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("storeIssue.searchPlaceholder")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} aria-label={t("storeIssue.clearSearch")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit flex-wrap">
          {([FILTER_ALL, "project", "production"] as const).map((d) => (
            <button key={d} onClick={() => setFilterDept(d)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${filterDept === d ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {d === FILTER_ALL ? t("quotation.filterAll") : departmentLabel(d)}
            </button>
          ))}
        </div>
        {!loading && !loadError && (
          <p className="text-xs text-muted-foreground font-mono" role="status" aria-live="polite">
            {t("storeIssue.queueCount").replace("{n}", String(rows.length))}
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3" role="status" aria-live="polite">
          <span className="sr-only">{t("storeIssue.loading")}</span>
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" aria-hidden="true" />)}
        </div>
      ) : loadError ? (
        <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("storeIssue.loadError")}</p>
          <button onClick={() => void loadQueue()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            {t("materialRequisition.retry")}
          </button>
        </div>
      ) : queue.length === 0 ? (
        <div className="bg-card border border-border rounded-xl">
          <EmptyState icon={PackageCheck} title={t("storeIssue.empty.title")} description={t("storeIssue.empty.description")} compact />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <PackageMinus size={20} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">{t("storeIssue.noFilterResults")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => {
            const open = openId === m.id;
            return (
              <div key={m.id} className={`bg-card border rounded-xl overflow-hidden transition-colors ${open ? "border-[#c9a84c]/40" : "border-border"}`}>
                <button
                  onClick={() => (open ? closeRow() : openRow(m.id))}
                  aria-expanded={open}
                  className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 text-left hover:bg-secondary/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50"
                >
                  <ChevronDown size={15} className={`text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                  <span className="text-xs font-mono text-[#c9a84c] font-semibold">{m.documentNumber}</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20">
                    {departmentLabel(m.ownerDepartment)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[m.productionOrderId || m.jobCode, m.customerName, [m.chargeDepartmentName, m.chargeTeamName].filter(Boolean).join(" / ")].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20">
                    {t("storeIssue.outstandingLines").replace("{n}", String(m.outstandingLineCount ?? 0))}
                  </span>
                  <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(m.updatedAt)}</span>
                </button>

                {open && (
                  <div className="border-t border-border px-5 py-4 space-y-3">
                    {detailLoading ? (
                      <div className="space-y-2" role="status" aria-live="polite">
                        <span className="sr-only">{t("storeIssue.loadingDoc")}</span>
                        {[...Array(2)].map((_, i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" aria-hidden="true" />)}
                      </div>
                    ) : detailError || !detail ? (
                      <div className="flex flex-col items-center gap-2 py-6 text-center">
                        <p className="text-sm text-muted-foreground">{t("storeIssue.loadDocError")}</p>
                        <button onClick={() => openRow(m.id)}
                          className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                          {t("materialRequisition.retry")}
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-muted-foreground">
                            {t("storeIssue.roundHint").replace("{n}", String(issueBatchesOf(detail.doc).length + 1))}
                          </p>
                          <div className="flex items-center gap-2">
                            <button onClick={fillIssuable}
                              className="px-2.5 py-1 text-[11px] border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                              {t("storeIssue.fillIssuable")}
                            </button>
                            {onOpenDocument && (
                              <button onClick={() => onOpenDocument(m.id, m.ownerDepartment)}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
                                <ExternalLink size={12} /> {t("storeIssue.openDocument")}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border bg-muted/40">
                                {[
                                  t("materialRequisitionDoc.col.item"), t("materialRequisitionDoc.col.plannedQty"), t("materialRequisitionDoc.col.issued"),
                                  t("materialRequisitionDoc.col.outstanding"), t("materialRequisitionDoc.col.stockQty"), t("materialRequisitionDoc.col.issueNow"),
                                ].map((h) => (
                                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {detail.doc.lines.map((line) => {
                                const stock = detail.stock[line.productId];
                                const outstanding = outstandingQtyOf(line);
                                const typed = Number(issueQty[line.id] ?? "");
                                // เตือนที่ช่องก่อนโดนเซิร์ฟเวอร์ปฏิเสธ — เกินค้างเบิก หรือของในคลังไม่พอ
                                const bad = Number.isFinite(typed) && typed > 0 && (typed > outstanding || (stock !== undefined && typed > stock));
                                return (
                                  <tr key={line.id} className={`border-b border-border/50 ${outstanding <= 0 ? "opacity-50" : ""}`}>
                                    <td className="px-3 py-2 text-xs text-foreground"><span className="font-mono text-muted-foreground mr-2">{line.productCode}</span>{line.productName}</td>
                                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">{(line.plannedQty ?? 0).toLocaleString()} {line.unit}</td>
                                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{issuedQtyOf(line).toLocaleString()}</td>
                                    <td className={`px-3 py-2 text-xs font-mono ${outstanding > 0 ? "text-[#a75d1a] font-semibold" : "text-muted-foreground"}`}>{outstanding.toLocaleString()}</td>
                                    <td className={`px-3 py-2 text-xs font-mono ${stock !== undefined && outstanding > 0 && stock < outstanding ? "text-[#e05252] font-semibold" : "text-muted-foreground"}`}>
                                      {stock === undefined ? "—" : stock.toLocaleString()}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <input type="number" min={0} max={outstanding} value={issueQty[line.id] ?? ""}
                                        disabled={outstanding <= 0}
                                        aria-label={`${t("materialRequisitionDoc.col.issueNow")} ${line.productName}`}
                                        onChange={(e) => setIssueQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                        className={`w-24 text-xs font-mono text-foreground bg-[#2aa36b]/5 border rounded px-1.5 py-1 outline-none disabled:opacity-40 ${bad ? "border-[#e05252]" : "border-[#2aa36b]/20"}`} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor={`si-by-${m.id}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.issuedBy")}</label>
                            <input id={`si-by-${m.id}`} value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} className={inputCls} />
                          </div>
                          <div>
                            <label htmlFor={`si-date-${m.id}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.issuedDate")}</label>
                            <input id={`si-date-${m.id}`} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputCls} />
                          </div>
                          <div className="sm:col-span-2">
                            <label htmlFor={`si-remark-${m.id}`} className="text-xs text-muted-foreground block mb-1">{t("materialRequisitionDoc.field.issueRemark")}</label>
                            <input id={`si-remark-${m.id}`} value={issueRemark} onChange={(e) => setIssueRemark(e.target.value)} className={inputCls} />
                          </div>
                        </div>

                        <button onClick={() => void submitIssue()} disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-60">
                          {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                          {t("storeIssue.submit")}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Toast message={toast.message} />
    </div>
  );
}
