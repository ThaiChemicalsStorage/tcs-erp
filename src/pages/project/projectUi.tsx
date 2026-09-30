import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { FilterSelect } from "../../components/ui/ListPage";
import { field } from "../../components/ui/styles";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PromptDialog } from "../../components/PromptDialog";
import { ApiError } from "../../lib/apiClient";
import type { DateRangePreset, DateRangeValue } from "../../lib/dateRanges";
import type { ProjectItemStatus, ProjectStatus } from "../../lib/project";
import { formatQuoteDateThai } from "../../lib/quotes";
import { useUserDirectory } from "../../lib/userDirectory";
import { useI18n } from "../../lib/i18n";

/**
 * ชิ้นส่วนหน้าตาแบบใหม่ (REDESIGN 2026-09-30) ที่ฝ่ายโครงการใช้ร่วมกัน — โครงการ ใบเบิก-คืนวัสดุ (รวมใบจ่ายของสโตร์
 * ที่ใช้หน้าเดียวกัน) และใบสั่งงาน · ของกลางอยู่ที่ `components/ui/` ที่นี่มีเฉพาะสิ่งที่ชุดกลางยังไม่มี
 */

type Tone = "grey" | "blue" | "amber" | "green" | "red";

const TONE: Record<Tone, { pill: string; dot: string }> = {
  grey: { pill: "bg-[#eef1f6] text-[#3d5173]", dot: "bg-[#8a97ad]" },
  blue: { pill: "bg-[#e8f0fb] text-[#1a5fb4]", dot: "bg-[#1a5fb4]" },
  amber: { pill: "bg-[#fdf3e0] text-[#8a5a00]", dot: "bg-[#d89614]" },
  green: { pill: "bg-[#e6f4ec] text-[#1b7f4f]", dot: "bg-[#1b7f4f]" },
  red: { pill: "bg-[#fcebeb] text-[#b93636]", dot: "bg-[#b93636]" },
};

/** ป้ายสถานะแบบใหม่: พื้นอ่อน ตัวเข้ม จุดสีนำหน้า */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const s = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap ${s.pill}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {children}
    </span>
  );
}

/** ป้ายเล็กเหลี่ยม (ไม่มีจุด) — "ค้างเบิก", สาขาการจัดหา ฯลฯ */
export function Tag({ tone = "grey", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-md text-xs font-semibold whitespace-nowrap ${TONE[tone].pill}`}>
      {children}
    </span>
  );
}

const PROJECT_TONE: Record<ProjectStatus, Tone> = { Planning: "grey", InProgress: "blue", Completed: "green" };

export function useProjectStatusLabel() {
  const { t } = useI18n();
  return (s: ProjectStatus) => (s === "Planning" ? t("project.status.planning") : s === "InProgress" ? t("project.status.inProgress") : t("project.status.completed"));
}

export function ProjectStatusPill({ status }: { status: ProjectStatus }) {
  const label = useProjectStatusLabel();
  return <Pill tone={PROJECT_TONE[status] ?? "grey"}>{label(status)}</Pill>;
}

const ITEM_TONE: Record<ProjectItemStatus, Tone> = { pending: "amber", documentCreated: "blue", fulfilled: "green", cancelled: "red" };

export function ProjectItemStatusPill({ status }: { status: ProjectItemStatus }) {
  const { t } = useI18n();
  const label: Record<ProjectItemStatus, string> = {
    pending: t("project.itemStatus.pending"),
    documentCreated: t("project.itemStatus.documentCreated"),
    fulfilled: t("project.itemStatus.fulfilled"),
    cancelled: t("project.itemStatus.cancelled"),
  };
  return <Pill tone={ITEM_TONE[status] ?? "grey"}>{label[status]}</Pill>;
}

/** สถานะอนุมัติของใบเบิก/ใบสั่งงาน — Draft → PendingApproval → Final (คำว่า Draft / Final คงภาษาอังกฤษตามแอป) */
export type ApprovalStatus = "Draft" | "PendingApproval" | "Final";

const APPROVAL_TONE: Record<ApprovalStatus, Tone> = { Draft: "grey", PendingApproval: "amber", Final: "blue" };

export function useApprovalStatusLabel() {
  const { t } = useI18n();
  return (s: ApprovalStatus) => (s === "Draft" ? t("materialRequisition.status.draft") : s === "PendingApproval" ? t("materialRequisition.status.pendingApproval") : t("materialRequisition.status.final"));
}

export function ApprovalPill({ status }: { status: ApprovalStatus }) {
  const label = useApprovalStatusLabel();
  return <Pill tone={APPROVAL_TONE[status] ?? "grey"}>{label(status)}</Pill>;
}

/** ขั้นตอนสามขั้นสำหรับ `DocumentStepper` — Final = ครบทุกขั้น */
export function useApprovalSteps(status: ApprovalStatus) {
  const { t } = useI18n();
  const steps = [{ label: t("approval.step.draft") }, { label: t("approval.step.pending") }, { label: t("approval.step.final") }];
  const current = status === "Draft" ? 0 : status === "PendingApproval" ? 1 : steps.length;
  return { steps, current };
}

/**
 * ข้อความ "ขั้นต่อไป" — ข้อความชุดเดียวกับ `DocumentStatusStepper` เดิมทุกกรณี (ถูกตีกลับ / รอใครอนุมัติ /
 * อนุมัติโดยใครเมื่อไหร่) ย้ายมาอยู่ในกล่องฟ้าบนคอลัมน์ขวาตามดีไซน์ใหม่
 */
export function useApprovalHint({ status, approverLabel, rejectionComment = "", approvedByUserId, approvedByName = "", approvedAt = "", finalHint }: {
  status: ApprovalStatus;
  approverLabel: string;
  rejectionComment?: string;
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  finalHint?: string;
}) {
  const { t } = useI18n();
  const { byId } = useUserDirectory();
  const approverName = approvedByName.trim() || byId(approvedByUserId)?.fullName || "";
  if (status === "Final") {
    return finalHint || t("approval.step.hint.final")
      .replace("{by}", approverName ? t("approval.step.by").replace("{name}", approverName) : "")
      .replace("{at}", approvedAt ? t("approval.step.at").replace("{date}", formatQuoteDateThai(approvedAt)) : "");
  }
  if (status === "PendingApproval") return t("approval.step.hint.pending").replace("{approver}", approverLabel || t("approval.step.defaultApprover"));
  return rejectionComment.trim() ? t("approval.step.hint.draftRejected") : t("approval.step.hint.draft");
}

/**
 * ขั้นตอนอนุมัติ (ส่งขออนุมัติ / อนุมัติ / ไม่อนุมัติ / ถอนกลับมาแก้) — ตรรกะเดียวกับ `DocumentApprovalActions`
 * ทุกประการ (state machine จริงอยู่ฝั่งเซิร์ฟเวอร์ `api/_lib/documentApproval.ts`) แต่แยกปุ่มออกมาให้หน้าเอกสาร
 * วางเองตามดีไซน์ใหม่: ปุ่มหลักมุมขวา · ไม่อนุมัติเป็นปุ่มขอบแดง · ถอนกลับมาแก้อยู่ในเมนูเพิ่มเติมเมื่อมีปุ่มอนุมัติแล้ว
 * ต้องเรียกเหนือ early return ของหน้า (เป็น hook) — ก่อนโหลดเอกสารเสร็จให้ส่ง status อะไรก็ได้ ปุ่มยังไม่ถูกวาด
 */
export function useApprovalFlow<T>({ status, canEdit, canApprove, onSubmit, onApprove, onReject, onWithdraw, onUpdated, showToast }: {
  status: ApprovalStatus;
  canEdit: boolean;
  canApprove: boolean;
  onSubmit: () => Promise<T>;
  onApprove: () => Promise<T>;
  onReject: (comment: string) => Promise<T>;
  onWithdraw: () => Promise<T>;
  onUpdated: (doc: T) => void;
  showToast: (message: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<null | "submit" | "approve" | "reject" | "withdraw">(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const run = async (kind: "submit" | "approve" | "reject" | "withdraw", fn: () => Promise<T>, successMsg: string, failMsg: string) => {
    setBusy(kind);
    try {
      onUpdated(await fn());
      setConfirmApprove(false);
      setRejectOpen(false);
      showToast(successMsg);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : failMsg);
    } finally {
      setBusy(null);
    }
  };

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmApprove}
        title={t("approval.confirmApprove.title")}
        message={t("approval.confirmApprove.message")}
        confirmLabel={busy === "approve" ? t("approval.approving") : t("approval.approve")}
        busy={busy === "approve"}
        onConfirm={() => void run("approve", onApprove, t("approval.approved"), t("approval.errorApprove"))}
        onCancel={() => setConfirmApprove(false)}
      />
      <PromptDialog
        open={rejectOpen}
        title={t("approval.rejectDialog.title")}
        message={t("approval.rejectDialog.message")}
        label={t("approval.rejectDialog.label")}
        confirmLabel={busy === "reject" ? t("approval.rejecting") : t("approval.reject")}
        requiredMessage={t("approval.rejectDialog.required")}
        busy={busy === "reject"}
        onConfirm={(comment) => void run("reject", () => onReject(comment), t("approval.rejected"), t("approval.errorReject"))}
        onCancel={() => setRejectOpen(false)}
      />
    </>
  );

  return {
    busy,
    canSubmit: status === "Draft" && canEdit,
    canDecide: status === "PendingApproval" && canApprove,
    canWithdraw: status === "PendingApproval" && canEdit,
    submit: () => void run("submit", onSubmit, t("approval.submitted"), t("approval.errorSubmit")),
    withdraw: () => void run("withdraw", onWithdraw, t("approval.withdrawn"), t("approval.errorWithdraw")),
    requestApprove: () => setConfirmApprove(true),
    requestReject: () => setRejectOpen(true),
    dialogs,
  };
}

/** ปุ่มขอบแดง "ไม่อนุมัติ" — ปุ่มรองที่เป็นการตีกลับ (ไม่ใช่การลบ จึงไม่ใช้ปุ่มแดงทึบ) */
export const rejectBtn = "h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg border border-[#e5b8b8] bg-white text-[#b93636] text-sm font-medium hover:bg-[#fcebeb] transition-colors disabled:opacity-60 whitespace-nowrap";

/** ปุ่มขอบแดงเล็กในหัวการ์ด (ยกเลิกรอบการจ่าย) */
export const rejectBtnSm = "h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#c3ccda] bg-white text-[#b93636] text-[13px] font-medium hover:bg-[#fcebeb] transition-colors disabled:opacity-60 whitespace-nowrap";

/** ปุ่มไอคอนลบแถว (✕ สีเทา แดงเมื่อชี้) */
export const rowRemoveBtn = "w-9 h-9 inline-flex items-center justify-center rounded-lg text-[#8a97ad] hover:bg-[#fcebeb] hover:text-[#b93636] transition-colors flex-shrink-0";

/** การ์ดสรุปสีกรมท่าบนคอลัมน์ขวา — หัวเล็ก ค่าใหญ่ (+ หน่วย) แถบความคืบหน้า (ถ้ามี) และแถวข้อมูลย่อย */
export function RailSummaryCard({ label, value, unit, progress, rows, mono = false, dataTour }: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** 0–100 · ไม่ส่ง = ไม่มีแถบ */
  progress?: number;
  rows: { label: ReactNode; value: ReactNode; warn?: boolean }[];
  mono?: boolean;
  dataTour?: string;
}) {
  return (
    <section data-tour={dataTour} className="rounded-xl bg-[#0b1d3a] text-white p-5 flex flex-col gap-3">
      <div className="text-[13px] text-[#c5d3e8]">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap min-w-0">
        <span className={mono ? "font-mono text-xl font-medium leading-tight break-all" : "text-[26px] font-semibold leading-tight tabular-nums"}>{value}</span>
        {unit && <span className="text-sm text-[#c5d3e8]">{unit}</span>}
      </div>
      {progress !== undefined && (
        <div aria-hidden="true" className="h-1.5 rounded-full bg-white/15 overflow-hidden">
          <div className="h-full rounded-full bg-[#c9a84c] transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {rows.length > 0 && <div className="h-px bg-white/10" />}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 text-[13px] text-[#c5d3e8]">
          <span>{r.label}</span>
          <span className={`text-right ${r.warn ? "text-[#f3c969]" : "text-white"}`}>{r.value}</span>
        </div>
      ))}
    </section>
  );
}

/** กล่องเทาข้อความอธิบาย (ไอคอน + ข้อความ) ในการ์ด */
export function NoteBox({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="px-3.5 py-3 bg-[#f8f9fc] border border-border rounded-lg flex gap-2.5 text-[#3d5173]">
      <span className="flex-shrink-0 mt-0.5 text-muted-foreground">{icon}</span>
      <span className="text-[13px] leading-relaxed">{children}</span>
    </div>
  );
}

const DATE_PRESETS: DateRangePreset[] = ["all", "today", "thisMonth", "lastMonth", "thisYear", "custom"];

/**
 * ตัวกรองช่วงวันที่แบบปุ่ม "ช่วงวันที่: ทั้งหมด ▾" ของแถบเครื่องมือแบบใหม่ — พรีเซ็ตชุดเดียวกับ `DateRangeFilter`
 * (ตรรกะช่วงวันที่ยังอยู่ที่ `lib/dateRanges.ts` ที่เดียว) · เลือก "กำหนดเอง" แล้วมีช่องวันที่สองช่อง
 */
export function ListDateRangeSelect({ value, onChange }: { value: DateRangeValue; onChange: (next: DateRangeValue) => void }) {
  const { t } = useI18n();
  const label: Record<string, string> = {
    all: t("dateFilter.all"),
    today: t("dateFilter.today"),
    thisMonth: t("dateFilter.thisMonth"),
    lastMonth: t("dateFilter.lastMonth"),
    thisYear: t("dateFilter.thisYear"),
    custom: t("dateFilter.custom"),
  };
  return (
    <div className="flex items-center gap-2 flex-wrap" data-tour="date-filter">
      <FilterSelect<DateRangePreset>
        label={t("project.list.dateRange")}
        value={value.preset}
        options={DATE_PRESETS.map((p) => ({ value: p, label: label[p] }))}
        onChange={(preset) => onChange(preset === "custom" ? { ...value, preset } : { preset, from: "", to: "" })}
      />
      {value.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <input type="date" value={value.from} max={value.to || undefined} aria-label={t("dateFilter.from")}
            onChange={(e) => onChange({ ...value, preset: "custom", from: e.target.value })} className={`${field.input} w-[150px]`} />
          <span className="text-sm text-muted-foreground">–</span>
          <input type="date" value={value.to} min={value.from || undefined} aria-label={t("dateFilter.to")}
            onChange={(e) => onChange({ ...value, preset: "custom", to: e.target.value })} className={`${field.input} w-[150px]`} />
          {(value.from || value.to) && (
            <button type="button" onClick={() => onChange({ preset: "custom", from: "", to: "" })} aria-label={t("dateFilter.clear")} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-[#f4f6fa] hover:text-foreground">
              <X size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** แถวตารางรายการที่ทั้งแถวกดเปิดได้ (Enter/Space ด้วย) */
export function rowOpenProps(onOpen: () => void, ariaLabel: string) {
  return {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": ariaLabel,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

/** แบ่งหน้าแบบเดียวกับหน้ารายการอื่น — 25 แถวต่อหน้า */
export const PAGE_SIZE = 25;

export function paginate<T>(rows: T[], page: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  return {
    pageCount,
    current,
    rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    from: (current - 1) * PAGE_SIZE + 1,
    to: Math.min(current * PAGE_SIZE, rows.length),
  };
}
