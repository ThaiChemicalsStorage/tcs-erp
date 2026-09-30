import { useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ChevronRight, Info, PackageMinus, Plus } from "lucide-react";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import {
  fetchAllMaterialRequisitions, createStoreMaterialRequisition, fetchStoreIssueSources, updateMaterialRequisition,
  type MaterialRequisitionSummary, type StoreIssueSourceCandidate,
} from "../../lib/materialRequisition";
import { fetchStoreReceipts, createStoreReceipt, type StoreReceiptSummary } from "../../lib/storeReceipt";
import {
  STORE_ISSUE_CODES, STORE_RECEIPT_CODES, storeIssueCodeInfo, storeReceiptCodeInfo,
  type StoreIssueCode, type StoreReceiptCode,
} from "../../lib/storeCodes";
import { FilterSelect, ListCard, ListEmpty, ListPageHeader, ListPagination, ListTabs, ListToolbar } from "../../components/ui/ListPage";
import { btn, table } from "../../components/ui/styles";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { MaterialRequisitionDocument } from "../materialRequisition/MaterialRequisitionDocument";
import { CodeChip, ListDateRangeSelect, LoadErrorState, PAGE_CLASS, Pill, Tag, rowOpenClass, type PillTone } from "../receivingReport/receivingUi";
import { paginate, rowOpenProps } from "../receivingReport/receivingFormat";
import { StoreReceiptDocument } from "./StoreReceiptDocument";
import { StoreCodeDialog } from "./StoreCodeDialog";
import { storeDocTabCounts, toStoreDocRows, type StoreDocRow, type StoreDocTab, type StoreDocumentKind } from "./storeDocsFormat";

export type { StoreDocumentKind } from "./storeDocsFormat";
/** deep link ของหน้านี้ — "incoming" = ใบเบิกของแผนกที่เพิ่งอนุมัติ (มาจากแจ้งเตือน) เปิดแท็บ "ใบเบิกจากแผนก" แล้วเน้นแถวนั้น */
export type StoreDocumentLink = { kind: StoreDocumentKind | "incoming"; id: string };

const STATUS_TONE: Record<StoreDocRow["status"], PillTone> = { Draft: "grey", PendingApproval: "amber", Final: "blue" };

/**
 * หน้ารวม "ใบเบิก-คืนวัสดุ (สโตร์)" (2026-09-23) — ใบเบิกของสโตร์ (รหัสจ่าย) กับใบรับคืน/รับเข้าคลัง (รหัสรับ)
 * อยู่ในรายการเดียวกัน ตามชื่อฟอร์มจริง "ใบเบิกและใบคืนวัสดุ" และแบบร่างที่เจ้าของดูแล้ว
 *
 * ใบเบิกเปิดด้วยหน้าแก้ไขใบเบิกตัวเดิม (ปรับให้รองรับใบของสโตร์) ส่วนใบรับคืนมีหน้าแก้ไขของตัวเอง
 *
 * ดีไซน์ใหม่ 2026-09-30: การ์ดรายการใบเดียว — แท็บพร้อมจำนวน (ทั้งหมด / ใบเบิก / ใบรับคืน / ใบเบิกจากแผนก) แทนปุ่มกลุ่มเดิม ·
 * รหัสและสถานะเป็นปุ่มตัวกรอง · ทั้งแถวกดเปิดเอกสาร · แบ่งหน้า
 */
export function StoreDocumentsPage({
  company, currentUserId, canCreate, canEdit, canFinalize, canPrint, canDelete, canIssueStock, canRequestProductCode,
  initialDocument, onInitialDocumentConsumed,
}: {
  company: Company;
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canIssueStock: boolean;
  canRequestProductCode: boolean;
  initialDocument?: StoreDocumentLink | null;
  onInitialDocumentConsumed?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const [open, setOpen] = useState<{ kind: StoreDocumentKind; id: string } | null>(
    initialDocument && initialDocument.kind !== "incoming" ? { kind: initialDocument.kind, id: initialDocument.id } : null,
  );
  const [issues, setIssues] = useState<MaterialRequisitionSummary[]>([]);
  // ใบเบิกของแผนกที่อนุมัติแล้วและยังค้างเบิก (2026-09-24) — "ส่งมา" ที่หน้านี้ให้สโตร์ทำใบจ่าย
  const [incoming, setIncoming] = useState<StoreIssueSourceCandidate[]>([]);
  const [issueFor, setIssueFor] = useState<StoreIssueSourceCandidate | null>(null);
  const [highlight, setHighlight] = useState<string | null>(initialDocument?.kind === "incoming" ? initialDocument.id : null);
  const [receipts, setReceipts] = useState<StoreReceiptSummary[]>([]);
  const [loaded, setLoaded] = useState<"loading" | "ok" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [picker, setPicker] = useState<StoreDocumentKind | null>(null);
  const [tab, setTab] = useState<StoreDocTab>(initialDocument?.kind === "incoming" ? "incoming" : "all");
  const [status, setStatus] = useState<"all" | StoreDocRow["status"]>("all");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);
  const [page, setPage] = useState(1);

  const [applied, setApplied] = useState<string | null>(null);
  if (initialDocument && `${initialDocument.kind}:${initialDocument.id}` !== applied) {
    setApplied(`${initialDocument.kind}:${initialDocument.id}`);
    if (initialDocument.kind === "incoming") {
      setOpen(null);
      setTab("incoming");
      setPage(1);
      setHighlight(initialDocument.id);
    } else {
      setOpen({ kind: initialDocument.kind, id: initialDocument.id });
    }
  }
  useEffect(() => {
    if (initialDocument) onInitialDocumentConsumed?.();
  }, [initialDocument, onInitialDocumentConsumed]);

  useEffect(() => {
    let cancelled = false;
    // รายการใบเบิกจากแผนกล้มได้โดยไม่ทำให้ทั้งหน้าพัง — แท็บนั้นแค่ว่าง
    Promise.all([fetchAllMaterialRequisitions("store"), fetchStoreReceipts(), fetchStoreIssueSources().catch(() => [])])
      .then(([i, r, inc]) => { if (!cancelled) { setIssues(i); setReceipts(r); setIncoming(inc); setLoaded("ok"); } })
      .catch(() => { if (!cancelled) setLoaded("error"); });
    return () => { cancelled = true; };
  }, [reload]);

  const backToList = useCallback(() => { setOpen(null); setReload((n) => n + 1); }, []);

  const createIssue = async (issueCode: StoreIssueCode) => {
    const source = issueFor;
    try {
      const created = await createStoreMaterialRequisition(issueCode);
      setPicker(null);
      setIssueFor(null);
      // ทำใบจ่ายจากใบเบิกที่ส่งมา — ผูกใบเบิกทันที เซิร์ฟเวอร์ดึงหัวใบ รายการที่ค้าง และเลขที่ใบตามใบเบิกให้
      if (source) {
        try {
          await updateMaterialRequisition(created.id, { sourceRequisitionId: source.id });
        } catch (err) {
          toast.show(err instanceof ApiError ? err.message : t("materialRequisitionDoc.errorSave"));
        }
      }
      setOpen({ kind: "issue", id: created.id });
    } catch (err) {
      setPicker(null);
      setIssueFor(null);
      toast.show(err instanceof ApiError ? err.message : t("materialRequisition.loadError"));
    }
  };
  const createReceipt = async (receiptCode: StoreReceiptCode) => {
    try {
      const created = await createStoreReceipt(receiptCode);
      setPicker(null);
      setOpen({ kind: "receipt", id: created.id });
    } catch (err) {
      setPicker(null);
      toast.show(err instanceof ApiError ? err.message : t("storeReceipt.errorSave"));
    }
  };

  if (open?.kind === "issue") {
    return (
      <>
        <MaterialRequisitionDocument
          key={open.id}
          materialRequisitionId={open.id}
          company={company}
          currentUserId={currentUserId}
          canEdit={canEdit}
          canFinalize={canFinalize}
          canPrint={canPrint}
          canDelete={canDelete}
          canIssueStock={canIssueStock}
          canRequestProductCode={canRequestProductCode}
          onBack={backToList}
          onDeleted={backToList}
          onOpenOther={(id) => setOpen({ kind: "issue", id })}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }
  if (open?.kind === "receipt") {
    return (
      <>
        <StoreReceiptDocument
          key={open.id}
          storeReceiptId={open.id}
          canEdit={canEdit}
          canApprove={canFinalize}
          canPost={canIssueStock}
          canPrint={canPrint}
          canDelete={canDelete}
          companyHeader={companyHeader}
          onBack={backToList}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  const codeName = (r: StoreDocRow) => {
    if (r.kind === "receipt") return t(storeReceiptCodeInfo(r.code as StoreReceiptCode).nameKey);
    return STORE_ISSUE_CODES.some((x) => x.code === r.code) ? t(storeIssueCodeInfo(r.code as StoreIssueCode).nameKey) : "";
  };
  const statusLabel = (s: StoreDocRow["status"]) =>
    s === "Draft" ? t("materialRequisition.status.draft") : s === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final");
  const incomingDept = (d: StoreIssueSourceCandidate["ownerDepartment"]) =>
    t(d === "production" ? "storeDocs.incoming.dept.production" : "storeDocs.incoming.dept.project");

  const rows = toStoreDocRows(issues, receipts);
  const counts = storeDocTabCounts(rows, incoming.length);
  const range = resolveRange(dateRange);
  const q = query.trim().toLowerCase();
  const slipsBySource = new Map<string, MaterialRequisitionSummary[]>();
  for (const m of issues) {
    if (!m.sourceRequisitionId) continue;
    slipsBySource.set(m.sourceRequisitionId, [...(slipsBySource.get(m.sourceRequisitionId) ?? []), m]);
  }
  const incomingFiltered = incoming
    .filter((r) => isWithinRange(r.updatedAt, range))
    .filter((r) => !q || [r.documentNumber, r.id, r.jobCode, r.customerName, r.chargeDepartmentName, r.chargeTeamName].some((v) => v.toLowerCase().includes(q)));
  const filtered = rows
    .filter((r) => tab === "all" || r.kind === tab)
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => !code || r.code === code)
    .filter((r) => isWithinRange(r.updatedAt, range))
    .filter((r) => !q || [r.number, r.id, r.refs.join(" · "), [r.chargeDepartment, r.chargeTeam].filter(Boolean).join(" / "), codeName(r)].some((v) => v.toLowerCase().includes(q)));
  const pagedRows = paginate(filtered, page);
  const pagedIncoming = paginate(incomingFiltered, page);

  const codeOptions = tab === "receipt" ? STORE_RECEIPT_CODES : tab === "issue" ? STORE_ISSUE_CODES : [...STORE_ISSUE_CODES, ...STORE_RECEIPT_CODES];
  const withReset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const dash = <span className="text-[#8a97ad]">—</span>;

  const tabs = (["all", "issue", "receipt", "incoming"] as const).map((k) => ({
    key: k,
    label: t(k === "all" ? "storeDocs.tab.all" : k === "issue" ? "storeDocs.tab.issue" : k === "receipt" ? "storeDocs.tab.receipt" : "storeDocs.tab.incoming"),
    count: counts[k],
  }));

  return (
    <div className={PAGE_CLASS}>
      <ListPageHeader
        module={t("nav.group.inventory")}
        title={t("storeDocs.title")}
        description={t("storeDocs.subtitle")}
        actions={canCreate ? (
          <>
            <button type="button" onClick={() => setPicker("receipt")} className={btn.secondary}>
              <ArrowDownToLine size={16} /> {t("storeDocs.createReceipt")}
            </button>
            <button type="button" onClick={() => setPicker("issue")} className={btn.primary}>
              <Plus size={16} /> {t("storeDocs.createIssue")}
            </button>
          </>
        ) : undefined}
      />

      <ListCard>
        <ListTabs tabs={tabs} active={tab} onChange={(k) => { setTab(k); setCode(""); setPage(1); }} ariaLabel={t("storeDocs.col.type")} />
        <ListToolbar
          search={query}
          onSearch={withReset(setQuery)}
          searchPlaceholder={t("storeDocs.search")}
          count={loaded !== "ok" ? undefined : tab === "incoming"
            ? t("storeDocs.incoming.count").replace("{n}", String(incomingFiltered.length))
            : t("ui.itemCount").replace("{n}", String(filtered.length))}
        >
          <ListDateRangeSelect value={dateRange} onChange={withReset(setDateRange)} />
          {tab !== "incoming" && (
            <>
              <FilterSelect
                label={t("storeDocs.codeFilter")}
                value={code}
                options={[{ value: "", label: t("storeDocs.codeFilterAll") }, ...codeOptions.map((c) => ({ value: c.code as string, label: `${c.code} — ${t(c.nameKey)}` }))]}
                onChange={withReset(setCode)}
              />
              <FilterSelect<"all" | StoreDocRow["status"]>
                label={t("storeDocs.col.status")}
                value={status}
                options={[
                  { value: "all", label: t("quotation.filterAll") },
                  ...(["Draft", "PendingApproval", "Final"] as const).map((s) => ({ value: s, label: statusLabel(s) })),
                ]}
                onChange={withReset(setStatus)}
              />
            </>
          )}
        </ListToolbar>

        {loaded === "loading" ? (
          <div className="p-5 flex flex-col gap-3" role="status" aria-live="polite">
            <span className="sr-only">{t("materialRequisition.loading")}</span>
            {[...Array(4)].map((_, i) => <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" aria-hidden="true" />)}
          </div>
        ) : loaded === "error" ? (
          <LoadErrorState message={t("materialRequisition.loadError")} retryLabel={t("materialRequisition.retry")} onRetry={() => { setLoaded("loading"); setReload((n) => n + 1); }} />
        ) : tab === "incoming" ? (
          <>
            {incoming.length === 0 ? (
              <ListEmpty title={t("storeDocs.incoming.emptyTitle")} hint={t("storeDocs.incoming.emptyDescription")} />
            ) : (
              <>
                <div className="px-5 py-3 border-b border-[#eef1f6]">
                  <div className="px-3.5 py-2.5 rounded-lg bg-[#e8f0fb] border border-[#b9d0f0] flex gap-2.5 text-[#16407a]">
                    <Info size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-[13px] leading-relaxed">{t("storeDocs.incoming.hint")}</p>
                  </div>
                </div>
                {incomingFiltered.length === 0 ? (
                  <ListEmpty title={t("storeDocs.noMatch")} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px]">
                      <thead>
                        <tr className={table.head}>
                          <th className={table.th}>{t("storeDocs.incoming.col.number")}</th>
                          <th className={table.th}>{t("storeDocs.incoming.col.job")}</th>
                          <th className={table.th}>{t("storeDocs.col.charge")}</th>
                          <th className={table.th}>{t("storeDocs.incoming.col.outstanding")}</th>
                          <th className={table.th}>{t("storeDocs.incoming.col.slips")}</th>
                          <th className={table.th}>{t("storeDocs.col.updatedAt")}</th>
                          <th className={`${table.th} w-[120px]`}><span className="sr-only">{t("storeDocs.incoming.makeSlip")}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedIncoming.rows.map((r) => {
                          const slips = slipsBySource.get(r.id) ?? [];
                          return (
                            <tr key={r.id} className={`h-16 border-b border-[#eef1f6] transition-colors ${highlight === r.id ? "bg-[#fbf7ea]" : "bg-white hover:bg-[#f8f9fc]"}`}>
                              <td className={`${table.td} whitespace-nowrap`}>
                                <button type="button" onClick={() => setOpen({ kind: "issue", id: r.id })} aria-label={`${t("storeDocs.incoming.view")} ${r.documentNumber}`}
                                  className="block font-mono text-[13px] font-medium text-[#1a5fb4] hover:underline rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40">
                                  {r.documentNumber}
                                </button>
                                <span className="block text-xs text-muted-foreground">{incomingDept(r.ownerDepartment)}</span>
                              </td>
                              <td className={`${table.td} max-w-[280px]`}>
                                <span className="block font-mono text-[13px] font-medium text-foreground truncate">{r.jobCode || dash}</span>
                                {r.customerName && <span className="block text-xs text-muted-foreground truncate">{r.customerName}</span>}
                              </td>
                              <td className={`${table.td} max-w-[200px]`}>
                                <span className="block text-sm text-foreground truncate">{r.chargeDepartmentName || dash}</span>
                                {r.chargeTeamName && <span className="block text-xs text-muted-foreground truncate">{r.chargeTeamName}</span>}
                              </td>
                              <td className={table.td}>
                                <Pill tone="amber" label={t("storeDocs.sourceOutstanding").replace("{n}", String(r.outstandingLineCount))} />
                              </td>
                              <td className={`${table.td} whitespace-nowrap`}>
                                {slips.length === 0 ? dash : slips.map((m) => (
                                  <button key={m.id} type="button" onClick={() => setOpen({ kind: "issue", id: m.id })}
                                    className="block font-mono text-[12.5px] text-[#1a5fb4] hover:underline rounded outline-none focus-visible:ring-2 focus-visible:ring-[#1a5fb4]/40">
                                    {m.documentNumber || m.id}
                                  </button>
                                ))}
                              </td>
                              <td className={`${table.td} text-[13px] text-[#3d5173] whitespace-nowrap`}>{formatQuoteDateThai(r.updatedAt)}</td>
                              <td className={`${table.td} text-right`}>
                                {canCreate && (
                                  <button type="button" onClick={() => { setIssueFor(r); setPicker("issue"); }} className={btn.secondarySm}>
                                    <PackageMinus size={14} /> {t("storeDocs.incoming.makeSlip")}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            {incomingFiltered.length > 0 && (
              <ListPagination page={pagedIncoming.current} pageCount={pagedIncoming.pageCount} from={pagedIncoming.from} to={pagedIncoming.to} total={incomingFiltered.length} onPage={setPage} />
            )}
          </>
        ) : rows.length === 0 ? (
          <ListEmpty title={t("storeDocs.empty.title")} hint={t("storeDocs.empty.description")} />
        ) : filtered.length === 0 ? (
          <ListEmpty title={t("storeDocs.noMatch")} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px]">
                <thead>
                  <tr className={table.head}>
                    <th className={table.th}>{t("storeDocs.col.number")}</th>
                    <th className={table.th}>{t("storeDocs.col.type")}</th>
                    <th className={table.th}>{t("storeDocs.col.reference")}</th>
                    <th className={table.th}>{t("storeDocs.col.charge")}</th>
                    <th className={table.th}>{t("storeDocs.col.status")}</th>
                    <th className={table.th}>{t("storeDocs.col.updatedAt")}</th>
                    <th className={`${table.th} w-10`} aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.rows.map((r) => {
                    const name = codeName(r);
                    return (
                      <tr key={`${r.kind}:${r.id}`} {...rowOpenProps(() => setOpen({ kind: r.kind, id: r.id }), `${t("storeDocs.openRow")} ${r.number}`)} className={`${table.row} group ${rowOpenClass}`}>
                        <td className={`${table.td} whitespace-nowrap`}>
                          <span className={`block ${table.code}`}>{r.number}</span>
                          {r.number !== r.id && <span className="block font-mono text-xs text-muted-foreground">{r.id}</span>}
                        </td>
                        <td className={`${table.td} max-w-[240px]`}>
                          <span className="flex items-center gap-2 min-w-0">
                            <CodeChip>{r.code}</CodeChip>
                            {name && <span className="text-[13px] text-[#3d5173] truncate">{name}</span>}
                          </span>
                        </td>
                        <td className={`${table.td} max-w-[260px]`}>
                          {r.refs.length === 0 ? dash : (
                            <>
                              <span className="block text-sm font-medium text-foreground truncate">{r.refs[0]}</span>
                              {r.refs.length > 1 && <span className="block text-xs text-muted-foreground truncate">{r.refs.slice(1).join(" · ")}</span>}
                            </>
                          )}
                        </td>
                        <td className={`${table.td} max-w-[200px]`}>
                          <span className="block text-sm text-foreground truncate">{r.chargeDepartment || dash}</span>
                          {r.chargeTeam && <span className="block text-xs text-muted-foreground truncate">{r.chargeTeam}</span>}
                        </td>
                        <td className={table.td}>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <Pill tone={STATUS_TONE[r.status]} label={statusLabel(r.status)} />
                            {r.pendingStore && (
                              <Tag tone="amber">{r.kind === "issue" ? t("materialRequisition.outstandingBadge") : t("storeDocs.awaitingPost")}</Tag>
                            )}
                            {r.posted && <Tag tone="green">{t("storeDocs.posted")}</Tag>}
                          </span>
                        </td>
                        <td className={`${table.td} text-[13px] text-[#3d5173] whitespace-nowrap`}>{formatQuoteDateThai(r.updatedAt)}</td>
                        <td className={table.td}>
                          <ChevronRight size={16} className="text-[#a3aec2] group-hover:text-foreground transition-colors ml-auto" aria-hidden="true" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListPagination page={pagedRows.current} pageCount={pagedRows.pageCount} from={pagedRows.from} to={pagedRows.to} total={filtered.length} onPage={setPage} />
          </>
        )}
      </ListCard>

      {picker === "issue" && (
        <StoreCodeDialog mode="issue" onCreate={createIssue} onCancel={() => { setPicker(null); setIssueFor(null); }}
          initialCode={issueFor ? (issueFor.ownerDepartment === "production" ? "PD" : "PP") : undefined}
          context={issueFor ? t("storeDocs.incoming.pickContext").replace("{number}", issueFor.documentNumber) : undefined}
          source={issueFor ? {
            number: issueFor.documentNumber,
            jobCode: issueFor.jobCode,
            detail: [issueFor.customerName, [issueFor.chargeDepartmentName, issueFor.chargeTeamName].filter(Boolean).join(" / ")].filter(Boolean).join(" · "),
            outstandingLines: issueFor.outstandingLineCount,
          } : undefined} />
      )}
      {picker === "receipt" && <StoreCodeDialog mode="receipt" onCreate={createReceipt} onCancel={() => setPicker(null)} />}
      <Toast message={toast.message} />
    </div>
  );
}
