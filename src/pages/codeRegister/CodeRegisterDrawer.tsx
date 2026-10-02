import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, Ban, Check, CheckCircle2, Clock, Info, Loader2, Power, XCircle } from "lucide-react";
import {
  type CodeEntry, type CodeEntryDraft, type CodeKind, emptyCodeEntryDraft, codeApprovalStatusOf, codeNeedsApproval,
} from "../../lib/codeRegister";
import { formatQuoteDateThai } from "../../lib/quotes";
import { Drawer } from "../../components/ui/Overlays";
import { Field, ReadonlyField } from "../../components/ui/Field";
import { MoreMenu } from "../../components/ui/MoreMenu";
import { btn, field } from "../../components/ui/styles";
import { StatusBadge } from "../../components/StatusBadge";
import { useI18n } from "../../lib/i18n";
import { codeApprovalLabelKey, codeKindLabelKey } from "./codeRegisterDisplay";

function toDraft(c: CodeEntry | null, kind: CodeKind): CodeEntryDraft {
  if (!c) return emptyCodeEntryDraft(kind);
  return {
    kind: c.kind, code: c.code, name: c.name, isActive: c.isActive,
    category: c.category, level: c.level, isControl: c.isControl, parentCode: c.parentCode,
  };
}

/**
 * แผงแก้ไขรหัส (ดีไซน์ใหม่ 2026-09-30) แทนกล่องฟอร์มกลางจอเดิม
 * ส่วน "ผังบัญชี" (หมวด / บัญชีคุม / เป็นบัญชีคุม) มีเฉพาะรหัสบัญชี · ช่องติ๊ก "ใช้งานอยู่" เดิม → "ปิดใช้งาน /
 * เปิดใช้งาน" ในเมนูเพิ่มเติมท้ายแผง · เก็บถาวร/กู้คืนอยู่ในเมนูเดียวกัน
 */
export function CodeRegisterDrawer({
  entry, kind, canEdit, canArchive, canApprove, approvalBusy, locked,
  onSave, onClose, onToggleActive, onArchiveToggle, onApprove, onReject,
}: {
  /** null = รหัสใหม่ในชุด `kind` */
  entry: CodeEntry | null;
  kind: CodeKind;
  canEdit: boolean;
  canArchive: boolean;
  /** `codeRegister:approve` — ฝ่ายบัญชี (2026-10-02) */
  canApprove: boolean;
  approvalBusy: boolean;
  onApprove: (c: CodeEntry) => void;
  onReject: (c: CodeEntry) => void;
  /** มีกล่องยืนยันซ้อนอยู่ด้านบน — กัน Escape/คลิกพื้นหลังปิดแผงไปพร้อมกัน */
  locked: boolean;
  onSave: (draft: CodeEntryDraft) => Promise<string | null>;
  onClose: () => void;
  onToggleActive: (c: CodeEntry) => void;
  onArchiveToggle: (c: CodeEntry) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CodeEntryDraft>(() => toDraft(entry, kind));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formId = useId();
  const isAccount = draft.kind === "account";
  const editable = canEdit && !(entry?.isDeleted ?? false);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const codeMissing = !draft.code.trim();
    const nameMissing = !draft.name.trim();
    setCodeError(codeMissing ? t("codeRegister.form.codeRequired") : null);
    setNameError(nameMissing ? t("codeRegister.form.nameRequired") : null);
    if (codeMissing || nameMissing) return;
    setError(null);
    setSaving(true);
    // สถานะเปิด/ปิดใช้งานเปลี่ยนจากเมนูเท่านั้น — ส่งค่าปัจจุบันไป ไม่ให้ฟอร์มเก่าทับ
    const err = await onSave(entry ? { ...draft, isActive: entry.isActive } : draft);
    setSaving(false);
    if (err) setError(err);
  };

  const title = entry ? (
    <span className="inline-flex items-baseline gap-2 min-w-0">
      <span className="font-mono font-medium">{entry.code}</span>
      <span className="truncate">{entry.name}</span>
    </span>
  ) : t("codeRegister.form.createTitle");

  const subtitle = entry ? (
    <span className="inline-flex items-center gap-2 flex-wrap mt-1">
      <StatusBadge
        status={entry.isDeleted ? "archived" : entry.isActive ? "active" : "inactive"}
        label={t(entry.isDeleted ? "vendors.status.archived" : entry.isActive ? "vendors.status.active" : "vendors.status.inactive")}
      />
      <span>{t(codeKindLabelKey[entry.kind])}</span>
    </span>
  ) : t(codeKindLabelKey[kind]);

  const footerLeft = entry ? (
    <MoreMenu
      align="left"
      items={[
        editable && {
          key: "active",
          label: entry.isActive ? t("vendors.action.deactivate") : t("vendors.action.activate"),
          hint: entry.isActive ? t("codeRegister.menu.deactivateHint") : undefined,
          icon: Power,
          onSelect: () => onToggleActive(entry),
        },
        canArchive && {
          key: "archive",
          label: entry.isDeleted ? t("codeRegister.confirmRestore.title") : t("codeRegister.confirmArchive.title"),
          hint: entry.isDeleted ? undefined : t("vendors.menu.archiveHint"),
          icon: entry.isDeleted ? ArchiveRestore : Archive,
          danger: !entry.isDeleted,
          onSelect: () => onArchiveToggle(entry),
        },
      ]}
    />
  ) : undefined;

  const footerRight = editable ? (
    <>
      <button type="button" onClick={onClose} disabled={saving} className={btn.secondary}>{t("common.cancel")}</button>
      <button type="submit" form={formId} disabled={saving} className={`${btn.primary} min-w-[88px]`}>
        {saving ? <Loader2 size={16} className="animate-spin" /> : t("common.save")}
      </button>
    </>
  ) : (
    <button type="button" onClick={onClose} className={btn.secondary}>{t("common.close")}</button>
  );

  return (
    <Drawer
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      busy={saving || locked}
      footerLeft={footerLeft}
      footerRight={footerRight}
    >
      {/* ขั้นอนุมัติของบัญชี (2026-10-02) — เฉพาะรหัสแผนก/รหัสบัญชี */}
      {entry && codeNeedsApproval(entry.kind) && (
        <div className="mb-6">
          <ApprovalBanner entry={entry} canApprove={canApprove} busy={approvalBusy} onApprove={() => onApprove(entry)} onReject={() => onReject(entry)} />
        </div>
      )}
      {editable && codeNeedsApproval(draft.kind) && (!entry || (!canApprove && codeApprovalStatusOf(entry) === "approved")) && (
        <p className="mb-6 flex items-start gap-2 rounded-lg bg-[#f4f6fa] text-[#3d5173] text-[13px] leading-relaxed px-3.5 py-2.5">
          <Info size={15} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          {t(!entry ? (canApprove ? "codeRegister.approval.newHintApprover" : "codeRegister.approval.newHint") : "codeRegister.approval.editHint")}
        </p>
      )}
      {editable ? (
        <form id={formId} onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-6">
          {error && <p role="alert" className="rounded-lg bg-[#fcebeb] text-[#b93636] text-[13px] px-3.5 py-2.5">{error}</p>}
          <section className="flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold text-foreground">{t("codeRegister.section.code")}</h3>
            <Field label={t("codeRegister.col.code")} htmlFor="code-code" required error={codeError}>
              <input id="code-code" autoFocus={!entry} aria-invalid={!!codeError} disabled={saving} value={draft.code}
                onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
                className={`${field.input} w-full sm:w-60 font-mono aria-invalid:border-[#b93636]`} />
            </Field>
            <Field label={t("codeRegister.col.name")} htmlFor="code-name" required error={nameError}>
              <input id="code-name" aria-invalid={!!nameError} disabled={saving} value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className={`${field.input} w-full aria-invalid:border-[#b93636]`} />
            </Field>
          </section>
          {isAccount && (
            <>
              <div className="h-px bg-[#eef1f6]" />
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-[15px] font-semibold text-foreground">{t("codeRegister.section.chart")}</h3>
                  <p className={field.help}>{t("codeRegister.section.chartHint")}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <Field label={t("codeRegister.col.category")} htmlFor="code-category">
                    <input id="code-category" disabled={saving} value={draft.category ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                      className={`${field.input} w-full`} />
                  </Field>
                  <Field label={t("codeRegister.col.parent")} htmlFor="code-parent">
                    <input id="code-parent" disabled={saving} value={draft.parentCode ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, parentCode: e.target.value }))}
                      className={`${field.input} w-full font-mono`} />
                  </Field>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" disabled={saving} checked={draft.isControl ?? false}
                    onChange={(e) => setDraft((d) => ({ ...d, isControl: e.target.checked }))}
                    className="w-4 h-4 mt-0.5 rounded border-[#c3ccda] accent-[#0b1d3a]" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{t("codeRegister.form.isControl")}</span>
                    <span className={field.help}>{t("codeRegister.form.isControlHint")}</span>
                  </span>
                </label>
              </section>
            </>
          )}
        </form>
      ) : entry ? (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4">
            <h3 className="text-[15px] font-semibold text-foreground">{t("codeRegister.section.code")}</h3>
            <ReadonlyField label={t("codeRegister.col.code")} value={entry.code} mono />
            <ReadonlyField label={t("codeRegister.col.name")} value={entry.name} />
          </section>
          {entry.kind === "account" && (
            <section className="flex flex-col gap-4">
              <h3 className="text-[15px] font-semibold text-foreground">{t("codeRegister.section.chart")}</h3>
              <div className="grid grid-cols-2 gap-4">
                <ReadonlyField label={t("codeRegister.col.category")} value={entry.category} />
                <ReadonlyField label={t("codeRegister.col.parent")} value={entry.parentCode} mono />
              </div>
              <ReadonlyField label={t("codeRegister.form.isControl")} value={entry.isControl ? t("codeRegister.isControlYes") : t("codeRegister.isControlNo")} />
            </section>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

const BANNER_TONE = {
  pending: { box: "bg-[#fdf3e0] border-[#efd3a0] text-[#8a5a00]", icon: Clock },
  approved: { box: "bg-[#e6f4ec] border-[#bfe0cc] text-[#1b7f4f]", icon: CheckCircle2 },
  rejected: { box: "bg-[#fcebeb] border-[#f1c9c9] text-[#b93636]", icon: XCircle },
} as const;

/**
 * แถบ "การอนุมัติของบัญชี" บนสุดของแผง — หน้าตาเดียวกับแถบของทะเบียนผู้ขาย (`VendorDrawer.tsx`)
 * รออนุมัติ: บัญชีกด อนุมัติ / ไม่อนุมัติ · ไม่อนุมัติ: บัญชีกลับมาอนุมัติได้ · ไม่มีปุ่ม "ส่ง" — รหัสใหม่รออนุมัติเองตั้งแต่บันทึก
 */
function ApprovalBanner({ entry, canApprove, busy, onApprove, onReject }: {
  entry: CodeEntry;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { t } = useI18n();
  const stage = codeApprovalStatusOf(entry);
  const tone = BANNER_TONE[stage];
  const Icon = tone.icon;
  const smallBtn = "h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-[#c3ccda] bg-white text-[13px] transition-colors disabled:opacity-60 whitespace-nowrap";
  const approveBtn = (
    <button type="button" onClick={onApprove} className={`${smallBtn} font-semibold text-[#1b7f4f] hover:bg-[#e6f4ec]`}>
      <Check size={14} /> {t("codeRegister.approval.approve")}
    </button>
  );
  let actions: ReactNode = null;
  if (busy) {
    actions = <Loader2 size={16} className="animate-spin" aria-label={t("common.loading")} />;
  } else if (canApprove && stage === "pending") {
    actions = (
      <>
        <button type="button" onClick={onReject} className={`${smallBtn} font-medium text-[#b93636] hover:bg-[#fcebeb]`}>
          <Ban size={14} /> {t("codeRegister.approval.reject")}
        </button>
        {approveBtn}
      </>
    );
  } else if (canApprove && stage === "rejected") {
    actions = approveBtn;
  }
  const by = stage === "approved" && entry.approvedByName
    ? t("codeRegister.approval.approvedBy").replace("{name}", entry.approvedByName).replace("{date}", entry.approvedAt ? formatQuoteDateThai(entry.approvedAt) : "—")
    : stage !== "approved" && entry.createdByName
      ? t("codeRegister.approval.createdBy").replace("{name}", entry.createdByName)
      : "";
  return (
    <section aria-labelledby="code-approval-title" className={`px-4 py-3.5 border rounded-xl flex flex-col gap-1.5 ${tone.box}`}>
      <div className="flex items-center gap-2.5 flex-wrap">
        <Icon size={16} className="flex-shrink-0" aria-hidden="true" />
        <h3 id="code-approval-title" className="flex-1 min-w-0 text-sm font-semibold">
          {t("codeRegister.approval.title")}: {t(codeApprovalLabelKey[stage])}
        </h3>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {stage === "rejected" && (entry.rejectionComment ?? "").trim() && (
        <p className="pl-[26px] text-[13px] leading-relaxed font-medium">{entry.rejectionComment}</p>
      )}
      {stage !== "approved" && (
        <p className="pl-[26px] text-[13px] leading-relaxed">{t(stage === "pending" ? "codeRegister.approval.pendingHint" : "codeRegister.approval.rejectedHint")}</p>
      )}
      {by && <p className="pl-[26px] text-xs opacity-90">{by}</p>}
    </section>
  );
}
