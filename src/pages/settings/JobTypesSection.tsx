import { useId, useState, type FormEvent } from "react";
import { Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { SectionCard } from "../../components/ui/SectionCard";
import { btn, field, table } from "../../components/ui/styles";
import { Toggle } from "../../components/Toggle";
import { ApiError } from "../../lib/apiClient";
import { createJobType, updateJobType, type JobType } from "../../lib/jobTypes";
import { useI18n } from "../../lib/i18n";

/**
 * จัดการประเภทงาน (Job Type) — แท็บในหน้าตั้งค่า (added 2026-10-06, Tuhmo #41) · สิทธิ์ `company:manage`
 * ตัวเดียวกับที่ `POST/PATCH /api/jobtypes` ใช้
 *
 * **รหัสแก้ไม่ได้หลังสร้าง** (API แก้ได้ แต่หน้าจอไม่เปิดให้) — ใบเสนอราคา/Scope of Work/Template อ้างประเภทงานด้วยรหัส
 * ถ้าเปลี่ยนรหัส เอกสารเดิมจะหาประเภทงานของตัวเองไม่เจอ · แทนการลบใช้ "ปิดใช้งาน": ไม่ขึ้นให้เลือกในเอกสารใหม่
 * แต่เอกสารเดิมยังแสดงได้ (ตัวเลือกในใบเสนอราคาเก็บประเภทที่ปิดแล้วไว้ถ้าเอกสารใช้อยู่)
 */
export function JobTypesSection({ jobTypes, onChange }: {
  jobTypes: JobType[];
  onChange: (next: JobType[]) => void;
}) {
  const { t } = useI18n();
  const idPrefix = useId();
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const sorted = [...jobTypes].sort((a, b) => a.code.localeCompare(b.code));
  const replace = (updated: JobType) => onChange(jobTypes.map((j) => (j.id === updated.id ? updated : j)));
  const errorText = (err: unknown) => (err instanceof ApiError ? err.message : t("jobTypes.error.generic"));

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (adding) return;
    const code = newCode.trim();
    const name = newName.trim();
    if (!code || !name) { setAddError(t("jobTypes.error.required")); return; }
    if (jobTypes.some((j) => j.code.toLowerCase() === code.toLowerCase())) { setAddError(t("jobTypes.error.codeTaken")); return; }
    setAdding(true);
    setAddError("");
    try {
      const created = await createJobType(code, name);
      onChange([...jobTypes, created]);
      setNewCode("");
      setNewName("");
    } catch (err) {
      setAddError(errorText(err));
    } finally {
      setAdding(false);
    }
  };

  const save = async (id: string, fields: { name?: string; isActive?: boolean }) => {
    setBusyId(id);
    setRowError(null);
    try {
      replace(await updateJobType(id, fields));
      return true;
    } catch (err) {
      setRowError({ id, message: errorText(err) });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const saveName = async (j: JobType) => {
    const name = editName.trim();
    if (!name) { setRowError({ id: j.id, message: t("jobTypes.error.nameRequired") }); return; }
    if (name === j.name || await save(j.id, { name })) setEditId(null);
  };

  return (
    <SectionCard title={t("jobTypes.title")} subtitle={t("jobTypes.subtitle")} bodyClassName="flex flex-col">
      <form onSubmit={(e) => void handleAdd(e)} noValidate className="px-6 py-4 border-b border-[#eef1f6] flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 w-[140px]">
          <span className={field.label}>{t("jobTypes.col.code")}</span>
          <input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder={t("jobTypes.codePlaceholder")}
            maxLength={20} className={`${field.input} w-full font-mono`} />
        </label>
        <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <span className={field.label}>{t("jobTypes.col.name")}</span>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("jobTypes.namePlaceholder")}
            maxLength={120} className={`${field.input} w-full`} />
        </label>
        <button type="submit" disabled={adding} className={btn.primary}>
          {adding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {t("jobTypes.add")}
        </button>
        {addError && <p className={`${field.error} basis-full`} role="alert">{addError}</p>}
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={table.head}>
              <th className={`${table.th} w-[130px]`}>{t("jobTypes.col.code")}</th>
              <th className={table.th}>{t("jobTypes.col.name")}</th>
              <th className={`${table.th} w-[150px]`}>{t("jobTypes.col.active")}</th>
              <th className={`${table.th} w-[60px]`}><span className="sr-only">{t("jobTypes.col.actions")}</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((j) => {
              const editing = editId === j.id;
              const busy = busyId === j.id;
              const activeLabelId = `${idPrefix}-active-${j.id}`;
              return (
                <tr key={j.id} className={`${table.row} ${j.isActive ? "" : "text-muted-foreground"}`}>
                  <td className={`${table.td} ${table.code}`}>{j.code}</td>
                  <td className={table.td}>
                    {editing ? (
                      <form onSubmit={(e) => { e.preventDefault(); void saveName(j); }} className="flex items-center gap-2">
                        <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={120}
                          aria-label={t("jobTypes.col.name")}
                          onKeyDown={(e) => { if (e.key === "Escape") { setEditId(null); setRowError(null); } }}
                          className={`${field.cell} flex-1 min-w-0`} />
                        <button type="submit" disabled={busy} className={btn.icon} aria-label={t("common.save")} title={t("common.save")}>
                          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        </button>
                        <button type="button" onClick={() => { setEditId(null); setRowError(null); }} className={btn.icon}
                          aria-label={t("common.cancel")} title={t("common.cancel")}>
                          <X size={16} />
                        </button>
                      </form>
                    ) : (
                      <span className={j.isActive ? "text-foreground" : ""}>{j.name}</span>
                    )}
                    {rowError?.id === j.id && <p className={`${field.error} mt-1`} role="alert">{rowError.message}</p>}
                  </td>
                  <td className={table.td}>
                    <span className="inline-flex items-center gap-2.5">
                      <Toggle checked={j.isActive} labelledBy={activeLabelId} onChange={(v) => { if (!busy) void save(j.id, { isActive: v }); }} />
                      <span id={activeLabelId} className="text-[13px]">{j.isActive ? t("jobTypes.active") : t("jobTypes.inactive")}</span>
                    </span>
                  </td>
                  <td className={table.td}>
                    {!editing && (
                      <button type="button" onClick={() => { setEditId(j.id); setEditName(j.name); setRowError(null); }}
                        className={btn.icon} aria-label={`${t("jobTypes.rename")} ${j.code}`} title={t("jobTypes.rename")}>
                        <Pencil size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
