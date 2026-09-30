import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Loader2, Send } from "lucide-react";
import { ListCard, ListEmpty, ListPageHeader, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { Field } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { LoadErrorState, PAGE_CLASS, Pill, Tag } from "../receivingReport/receivingUi";
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
  onOpenDocument?: (id: string, ownerDepartment: "project" | "production" | "store") => void;
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

  /**
   * โหลดคิวใหม่ · `reportError: false` = รีเฟรชเบื้องหลัง ใช้หลังบันทึกการจ่ายสำเร็จ — ถ้าปล่อยให้
   * รีเฟรชที่พลาดตั้ง `loadError` หน้าจอจะกลายเป็นข้อความ "โหลดไม่สำเร็จ" ทับผลของการบันทึกที่สำเร็จ
   * ไปแล้ว ทั้งที่ของถูกตัดออกจากสต๊อกเรียบร้อย
   *
   * (การโหลดครั้งแรกไม่เรียกผ่านตัวนี้ — `react-hooks/set-state-in-effect` ห้ามเรียกฟังก์ชันที่
   * setState แบบซิงโครนัสจากตัวเอฟเฟกต์)
   */
  const loadQueue = (opts?: { reportError?: boolean }) => {
    if (opts?.reportError !== false) { setLoading(true); setLoadError(false); }
    return fetchStoreIssueQueue()
      .then((list) => { setQueue(list); setLoading(false); })
      .catch(() => { if (opts?.reportError === false) return; setLoadError(true); setLoading(false); });
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
  const departmentLabel = (dept: string) => (dept === "production" ? t("storeIssue.dept.production") : dept === "store" ? t("storeIssue.dept.store") : t("storeIssue.dept.project"));
  const rows = queue
    .map((m) => ({ ...m, documentNumber: m.documentNumber || m.id, ownerDepartment: m.ownerDepartment ?? "project" }))
    .filter((m) => filterDept === FILTER_ALL || m.ownerDepartment === filterDept)
    .filter((m) => !normalizedSearch || [m.id, m.documentNumber, m.jobCode ?? "", m.productionOrderId ?? "", m.customerName ?? "", m.chargeTeamName ?? ""]
      .some((v) => v.toLowerCase().includes(normalizedSearch)));

  /**
   * เติมช่องจ่ายด้วยจำนวนที่จ่ายได้จริง — ค้างเบิก แต่ไม่เกินของที่มีในคลัง
   *
   * ของในคลังคิดรวมทั้งใบ ไม่ใช่ทีละบรรทัด — สินค้าตัวเดียวกันอยู่ได้หลายบรรทัดในใบเดียว (นั่นคือเหตุผล
   * ที่ `productTotalsOf()` ฝั่งเซิร์ฟเวอร์รวมยอดตามสินค้าก่อนตัดสต๊อก) ถ้าเติมทีละบรรทัดจนเต็มยอดคงเหลือ
   * ผลรวมจะเกินของที่มี แล้วเซิร์ฟเวอร์ตีกลับทั้งชุดว่าของไม่พอ ทั้งที่ปุ่มบอกว่า "เติมจำนวนที่จ่ายได้"
   */
  const fillIssuable = () => {
    if (!detail) return;
    const next: Record<string, string> = {};
    const remaining = new Map<string, number>();
    for (const line of detail.doc.lines) {
      const outstanding = outstandingQtyOf(line);
      if (outstanding <= 0) continue;
      const stock = detail.stock[line.productId];
      if (stock === undefined) { next[line.id] = String(outstanding); continue; }
      const left = remaining.get(line.productId) ?? stock;
      const qty = Math.min(outstanding, left);
      if (qty > 0) next[line.id] = String(qty);
      remaining.set(line.productId, left - qty);
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
    // ผูกการบันทึกไว้กับใบที่เปิดอยู่ตอนกด — การจ่ายของยิงจริงหลายวินาที (ตัดสต๊อกทีละสินค้า + audit)
    // ระหว่างนั้นผู้ใช้กดเปิดใบอื่นได้ ถ้าไม่เช็ค `loadSeq` ตอนคำตอบกลับมา ใบเก่าจะถูกยัดลงไปในการ์ด
    // ของใบใหม่ (หรือ `closeRow()` ไปพับการ์ดที่ผู้ใช้เพิ่งเปิด) แล้วยอดที่พิมพ์ต่อจะไปลงผิดใบ
    const seq = loadSeq.current;
    setSaving(true);
    try {
      const { materialRequisition, stockByProduct } = await postMaterialIssueBatch(detail.doc.id, {
        lines, issuedDate: issueDate, issuedBy, remark: issueRemark,
      });
      const stillOutstanding = materialRequisition.lines.some((l) => outstandingQtyOf(l) > 0);
      if (seq === loadSeq.current) {
        setIssueQty({});
        setIssueRemark("");
        if (stillOutstanding) setDetail({ doc: materialRequisition, stock: stockByProduct });
        else closeRow();
      }
      toast.show(t(stillOutstanding ? "storeIssue.savedPartial" : "storeIssue.savedDone"));
      await loadQueue({ reportError: false });
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("storeIssue.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const numTd = `${table.td} py-2.5 text-right tabular-nums text-sm whitespace-nowrap`;
  const deptTabs = ([FILTER_ALL, "project", "production", "store"] as const).map((d) => ({
    key: d as string,
    label: d === FILTER_ALL ? t("quotation.filterAll") : departmentLabel(d),
    count: d === FILTER_ALL ? queue.length : queue.filter((m) => (m.ownerDepartment ?? "project") === d).length,
  }));

  return (
    <div className={PAGE_CLASS}>
      <ListPageHeader module={t("nav.group.inventory")} title={t("storeIssue.pageTitle")} description={t("storeIssue.pageSubtitle")} />

      <ListCard>
        <ListTabs tabs={deptTabs} active={filterDept} onChange={setFilterDept} ariaLabel={t("storeIssue.tabsAria")} />
        <ListToolbar
          search={searchQuery}
          onSearch={setSearchQuery}
          searchPlaceholder={t("storeIssue.searchPlaceholder")}
          count={!loading && !loadError ? <span role="status" aria-live="polite">{t("storeIssue.queueCount").replace("{n}", String(rows.length))}</span> : undefined}
        />

        {loading ? (
          <div className="p-5 flex flex-col gap-3" role="status" aria-live="polite">
            <span className="sr-only">{t("storeIssue.loading")}</span>
            {[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" aria-hidden="true" />)}
          </div>
        ) : loadError ? (
          <LoadErrorState message={t("storeIssue.loadError")} retryLabel={t("materialRequisition.retry")} onRetry={() => void loadQueue()} />
        ) : queue.length === 0 ? (
          <ListEmpty title={t("storeIssue.empty.title")} hint={t("storeIssue.empty.description")} />
        ) : rows.length === 0 ? (
          <ListEmpty title={t("storeIssue.noFilterResults")} />
        ) : (
          <div className="flex flex-col">
            {rows.map((m) => {
              const open = openId === m.id;
              return (
                <div key={m.id} className={`border-b border-[#eef1f6] last:border-b-0 ${open ? "bg-[#fbfcfe]" : "bg-white"}`}>
                  <button
                    type="button"
                    onClick={() => (open ? closeRow() : openRow(m.id))}
                    aria-expanded={open}
                    className="w-full min-h-[60px] flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3 text-left hover:bg-[#f8f9fc] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40"
                  >
                    <ChevronDown size={16} className={`text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
                    <span className="font-mono text-[13px] font-medium text-foreground">{m.documentNumber}</span>
                    <Tag tone="grey">{departmentLabel(m.ownerDepartment)}</Tag>
                    <span className="text-[13px] text-[#3d5173] min-w-0 truncate">
                      {[m.productionOrderId || m.jobCode, m.customerName, [m.chargeDepartmentName, m.chargeTeamName].filter(Boolean).join(" / ")].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="flex-1" />
                    <Pill tone="amber" label={t("storeIssue.outstandingLines").replace("{n}", String(m.outstandingLineCount ?? 0))} />
                    <span className="text-[13px] text-[#3d5173] whitespace-nowrap">{formatQuoteDateThai(m.updatedAt)}</span>
                  </button>

                  {open && (
                    <div className="border-t border-[#eef1f6] px-5 py-4 flex flex-col gap-4">
                      {detailLoading ? (
                        <div className="flex flex-col gap-2" role="status" aria-live="polite">
                          <span className="sr-only">{t("storeIssue.loadingDoc")}</span>
                          {[...Array(2)].map((_, i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" aria-hidden="true" />)}
                        </div>
                      ) : detailError || detail?.doc.id !== m.id ? (
                        <LoadErrorState message={t("storeIssue.loadDocError")} retryLabel={t("materialRequisition.retry")} onRetry={() => openRow(m.id)} />
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[13px] text-[#3d5173]">
                              {t("storeIssue.roundHint").replace("{n}", String(issueBatchesOf(detail.doc).length + 1))}
                            </p>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={fillIssuable} className={btn.secondarySm}>
                                {t("storeIssue.fillIssuable")}
                              </button>
                              {onOpenDocument && (
                                <button type="button" onClick={() => onOpenDocument(m.id, m.ownerDepartment)} className={btn.secondarySm}>
                                  <ExternalLink size={14} /> {t("storeIssue.openDocument")}
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full min-w-[720px]">
                              <thead>
                                <tr className={table.head}>
                                  <th className={table.th}>{t("materialRequisitionDoc.col.item")}</th>
                                  {[
                                    t("materialRequisitionDoc.col.plannedQty"), t("materialRequisitionDoc.col.issued"),
                                    t("materialRequisitionDoc.col.outstanding"), t("materialRequisitionDoc.col.stockQty"), t("materialRequisitionDoc.col.issueNow"),
                                  ].map((h) => <th key={h} className={`${table.th} text-right`}>{h}</th>)}
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
                                    <tr key={line.id} className={`border-b border-[#eef1f6] last:border-b-0 bg-white ${outstanding <= 0 ? "opacity-50" : ""}`}>
                                      <td className={`${table.td} py-2.5 text-sm text-foreground`}><span className="font-mono text-[13px] text-muted-foreground mr-2">{line.productCode}</span>{line.productName}</td>
                                      <td className={`${numTd} text-[#3d5173]`}>{(line.plannedQty ?? 0).toLocaleString()} {line.unit}</td>
                                      <td className={`${numTd} text-[#3d5173]`}>{issuedQtyOf(line).toLocaleString()}</td>
                                      <td className={`${numTd} ${outstanding > 0 ? "text-[#8a5a00] font-semibold" : "text-muted-foreground"}`}>{outstanding.toLocaleString()}</td>
                                      <td className={`${numTd} ${stock !== undefined && outstanding > 0 && stock < outstanding ? "text-[#b93636] font-semibold" : "text-[#3d5173]"}`}>
                                        {stock === undefined ? "—" : stock.toLocaleString()}
                                      </td>
                                      <td className={`${table.td} py-1.5 text-right`}>
                                        <input type="number" min={0} max={outstanding} value={issueQty[line.id] ?? ""}
                                          disabled={outstanding <= 0}
                                          aria-label={`${t("materialRequisitionDoc.col.issueNow")} ${line.productName}`}
                                          onChange={(e) => setIssueQty((prev) => ({ ...prev, [line.id]: e.target.value }))}
                                          className={`${field.cell} w-28 text-right tabular-nums disabled:opacity-40 ${bad ? "border-[#b93636] focus:border-[#b93636]" : ""}`} />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                            <Field label={t("materialRequisitionDoc.field.issuedBy")} htmlFor={`si-by-${m.id}`}>
                              <input id={`si-by-${m.id}`} value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} className={`${field.input} w-full`} />
                            </Field>
                            <Field label={t("materialRequisitionDoc.field.issuedDate")} htmlFor={`si-date-${m.id}`}>
                              <input id={`si-date-${m.id}`} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`${field.input} w-full`} />
                            </Field>
                            <Field className="sm:col-span-2" label={t("materialRequisitionDoc.field.issueRemark")} htmlFor={`si-remark-${m.id}`}>
                              <input id={`si-remark-${m.id}`} value={issueRemark} onChange={(e) => setIssueRemark(e.target.value)} className={`${field.input} w-full`} />
                            </Field>
                          </div>

                          <div className="flex justify-end">
                            <button type="button" onClick={() => void submitIssue()} disabled={saving} className={btn.primary}>
                              {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                              {t("storeIssue.submit")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ListCard>
      <Toast message={toast.message} />
    </div>
  );
}
