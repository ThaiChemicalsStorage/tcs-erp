import { useCallback, useEffect, useState } from "react";
import { PackageMinus, Plus, Search, Undo2, X } from "lucide-react";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { useI18n } from "../../lib/i18n";
import { ApiError } from "../../lib/apiClient";
import { formatQuoteDateThai } from "../../lib/quotes";
import { ALL_DATES, resolveRange, isWithinRange, type DateRangeValue } from "../../lib/dateRanges";
import { fetchAllMaterialRequisitions, createStoreMaterialRequisition, type MaterialRequisitionSummary } from "../../lib/materialRequisition";
import { fetchStoreReceipts, createStoreReceipt, type StoreReceiptSummary } from "../../lib/storeReceipt";
import {
  STORE_ISSUE_CODES, STORE_RECEIPT_CODES, storeIssueCodeInfo, storeReceiptCodeInfo,
  type StoreIssueCode, type StoreReceiptCode,
} from "../../lib/storeCodes";
import { EmptyState } from "../../components/EmptyState";
import { DateRangeFilter } from "../../components/DateRangeFilter";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { MaterialRequisitionDocument } from "../materialRequisition/MaterialRequisitionDocument";
import { StoreReceiptDocument } from "./StoreReceiptDocument";
import { StoreCodeDialog } from "./StoreCodeDialog";

export type StoreDocumentKind = "issue" | "receipt";

interface Row {
  kind: StoreDocumentKind;
  id: string;
  number: string;
  code: string;
  codeName: string;
  reference: string;
  charge: string;
  status: "Draft" | "PendingApproval" | "Final";
  /** ใบเบิก: ยังจ่ายไม่ครบ · ใบรับคืน: อนุมัติแล้วแต่ยังไม่รับเข้าคลัง */
  pendingStore: boolean;
  posted: boolean;
  updatedAt: string;
}

const STATUS_STYLE: Record<Row["status"], string> = {
  Draft: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  PendingApproval: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  Final: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
};

/**
 * หน้ารวม "ใบเบิก-คืนวัสดุ (สโตร์)" (2026-09-23) — ใบเบิกของสโตร์ (รหัสจ่าย) กับใบรับคืน/รับเข้าคลัง (รหัสรับ)
 * อยู่ในรายการเดียวกัน ตามชื่อฟอร์มจริง "ใบเบิกและใบคืนวัสดุ" และแบบร่างที่เจ้าของดูแล้ว
 *
 * ใบเบิกเปิดด้วยหน้าแก้ไขใบเบิกตัวเดิม (ปรับให้รองรับใบของสโตร์) ส่วนใบรับคืนมีหน้าแก้ไขของตัวเอง
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
  initialDocument?: { kind: StoreDocumentKind; id: string } | null;
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
  const [open, setOpen] = useState<{ kind: StoreDocumentKind; id: string } | null>(initialDocument ?? null);
  const [issues, setIssues] = useState<MaterialRequisitionSummary[]>([]);
  const [receipts, setReceipts] = useState<StoreReceiptSummary[]>([]);
  const [loaded, setLoaded] = useState<"loading" | "ok" | "error">("loading");
  const [reload, setReload] = useState(0);
  const [picker, setPicker] = useState<StoreDocumentKind | null>(null);
  const [tab, setTab] = useState<"all" | StoreDocumentKind>("all");
  const [status, setStatus] = useState<"all" | Row["status"]>("all");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>(ALL_DATES);

  const [applied, setApplied] = useState<string | null>(null);
  if (initialDocument && `${initialDocument.kind}:${initialDocument.id}` !== applied) {
    setApplied(`${initialDocument.kind}:${initialDocument.id}`);
    setOpen(initialDocument);
  }
  useEffect(() => {
    if (initialDocument) onInitialDocumentConsumed?.();
  }, [initialDocument, onInitialDocumentConsumed]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAllMaterialRequisitions("store"), fetchStoreReceipts()])
      .then(([i, r]) => { if (!cancelled) { setIssues(i); setReceipts(r); setLoaded("ok"); } })
      .catch(() => { if (!cancelled) setLoaded("error"); });
    return () => { cancelled = true; };
  }, [reload]);

  const backToList = useCallback(() => { setOpen(null); setReload((n) => n + 1); }, []);

  const createIssue = async (issueCode: StoreIssueCode) => {
    try {
      const created = await createStoreMaterialRequisition(issueCode);
      setPicker(null);
      setOpen({ kind: "issue", id: created.id });
    } catch (err) {
      setPicker(null);
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

  const rows: Row[] = [
    ...issues.map((m): Row => {
      const c = (m.issueCode ?? m.id.split("-")[0]) as StoreIssueCode;
      const known = STORE_ISSUE_CODES.some((x) => x.code === c);
      return {
        kind: "issue", id: m.id, number: m.documentNumber || m.id, code: c,
        codeName: known ? t(storeIssueCodeInfo(c).nameKey) : "",
        reference: [m.sourceRequisitionNumber, m.jobCode, m.storeReference].filter(Boolean).join(" · "),
        charge: [m.chargeDepartmentName, m.chargeTeamName].filter(Boolean).join(" / "),
        status: m.status, pendingStore: m.hasOutstanding, posted: false, updatedAt: m.updatedAt,
      };
    }),
    ...receipts.map((r): Row => ({
      kind: "receipt", id: r.id, number: r.documentNumber || r.id, code: r.receiptCode,
      codeName: t(storeReceiptCodeInfo(r.receiptCode).nameKey),
      reference: [r.sourceRequisitionNumber, r.jobCode, r.reference].filter(Boolean).join(" · "),
      charge: [r.chargeDepartmentName, r.chargeTeamName].filter(Boolean).join(" / "),
      status: r.status, pendingStore: r.status === "Final" && !r.posted, posted: r.posted, updatedAt: r.updatedAt,
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const range = resolveRange(dateRange);
  const q = query.trim().toLowerCase();
  const filtered = rows
    .filter((r) => tab === "all" || r.kind === tab)
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => !code || r.code === code)
    .filter((r) => isWithinRange(r.updatedAt, range))
    .filter((r) => !q || [r.number, r.id, r.reference, r.charge, r.codeName].some((v) => v.toLowerCase().includes(q)));

  const codeOptions = tab === "receipt" ? STORE_RECEIPT_CODES : tab === "issue" ? STORE_ISSUE_CODES : [...STORE_ISSUE_CODES, ...STORE_RECEIPT_CODES];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("storeDocs.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t("storeDocs.subtitle")}</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPicker("receipt")}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Undo2 size={15} /> {t("storeDocs.createReceipt")}
            </button>
            <button onClick={() => setPicker("issue")}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
              <Plus size={15} /> {t("storeDocs.createIssue")}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit" role="group" aria-label={t("storeDocs.col.type")}>
          {(["all", "issue", "receipt"] as const).map((k) => (
            <button key={k} onClick={() => { setTab(k); setCode(""); }} aria-pressed={tab === k}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${tab === k ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {t(k === "all" ? "storeDocs.tab.all" : k === "issue" ? "storeDocs.tab.issue" : "storeDocs.tab.receipt")}
            </button>
          ))}
        </div>
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <label className="relative h-9 w-64">
          <span className="sr-only">{t("storeDocs.search")}</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("storeDocs.search")}
            className="h-9 w-full pl-9 pr-8 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors" />
          {query && <button onClick={() => setQuery("")} aria-label={t("common.cancel")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={13} /></button>}
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("storeDocs.codeFilter")}
          <select value={code} onChange={(e) => setCode(e.target.value)}
            className="h-9 px-2 text-xs text-foreground bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50">
            <option value="">{t("storeDocs.codeFilterAll")}</option>
            {codeOptions.map((c) => <option key={c.code} value={c.code}>{c.code} — {t(c.nameKey)}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 h-9 w-fit" role="group" aria-label={t("storeDocs.col.status")}>
          {(["all", "Draft", "PendingApproval", "Final"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${status === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
              {s === "all" ? t("quotation.filterAll") : s === "Draft" ? t("materialRequisition.status.draft") : s === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loaded === "loading" ? (
          <div className="p-6 space-y-3" role="status" aria-live="polite">
            <span className="sr-only">{t("materialRequisition.loading")}</span>
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" aria-hidden="true" />)}
          </div>
        ) : loaded === "error" ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <p className="text-sm text-muted-foreground">{t("materialRequisition.loadError")}</p>
            <button onClick={() => { setLoaded("loading"); setReload((n) => n + 1); }} className="px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40">{t("materialRequisition.retry")}</button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={PackageMinus} title={t("storeDocs.empty.title")} description={t("storeDocs.empty.description")} compact />
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("storeDocs.noMatch")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {[t("storeDocs.col.number"), t("storeDocs.col.type"), t("storeDocs.col.reference"), t("storeDocs.col.charge"), t("storeDocs.col.status"), t("storeDocs.col.updatedAt")].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.kind}:${r.id}`} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <button onClick={() => setOpen({ kind: r.kind, id: r.id })} aria-label={`${t("storeDocs.openRow")} ${r.number}`}
                        className="text-xs font-mono text-[#866d28] font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a84c]/50 rounded">
                        {r.number}
                      </button>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">
                      <span className="font-mono font-semibold text-[#866d28] mr-2">{r.code}</span>{r.codeName}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{r.reference || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground whitespace-nowrap">{r.charge || "—"}</td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                        {r.status === "Draft" ? t("materialRequisition.status.draft") : r.status === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final")}
                      </span>
                      {r.pendingStore && (
                        <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20">
                          {r.kind === "issue" ? t("materialRequisition.outstandingBadge") : t("storeDocs.awaitingPost")}
                        </span>
                      )}
                      {r.posted && (
                        <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[#1f9d8a]/10 text-[#187c6d] border border-[#1f9d8a]/20">{t("storeDocs.posted")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">{formatQuoteDateThai(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {picker === "issue" && <StoreCodeDialog mode="issue" onCreate={createIssue} onCancel={() => setPicker(null)} />}
      {picker === "receipt" && <StoreCodeDialog mode="receipt" onCreate={createReceipt} onCancel={() => setPicker(null)} />}
      <Toast message={toast.message} />
    </div>
  );
}
