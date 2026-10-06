import { Clock, Zap } from "lucide-react";
import type { ReactNode } from "react";
import {
  addBusinessDays, agingTone, businessDaysBetween, calendarDaysBetween, purchasingTargetDays, todayInThailand,
  PURCHASING_TARGET_DAYS, type AgingTone,
} from "../../lib/businessDays";
import type { PurchaseRequest, PurchaseRequestPoRef } from "../../lib/purchaseRequest";
import { useI18n } from "../../lib/i18n";
import { surface } from "../../components/ui/styles";
import { StageTag } from "./docShared";
import { formatDisplayDate } from "../../lib/displayDate";

/**
 * งานด่วน + ตัวนับวันทำการของงานจัดซื้อ (เจ้าของสั่ง 2026-10-02) — ชิ้นส่วนที่หน้ารายการและหน้าเอกสาร
 * ใบขอซื้อใช้ร่วมกัน · กติกาการนับอยู่ที่ `src/lib/businessDays.ts` ที่เดียว (จ.–ศ. เท่านั้น)
 */

/** ป้าย "ด่วน" สีส้ม */
export function UrgentBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const { t } = useI18n();
  if (size === "md") {
    return (
      <span className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap bg-[#fff1e8] text-[#a8431a]">
        <Zap size={13} strokeWidth={2.5} aria-hidden="true" /> {t("purchaseRequest.urgent.badge")}
      </span>
    );
  }
  return (
    <StageTag tone="urgent"><Zap size={12} strokeWidth={2.5} aria-hidden="true" className="mr-1" />{t("purchaseRequest.urgent.badge")}</StageTag>
  );
}

const TONE_TAG: Record<AgingTone, "red" | "amber" | "grey"> = { over: "red", due: "amber", ok: "grey" };

/** ข้อความป้ายเทียบเป้า: เกินเป้า N วัน / ครบกำหนดวันนี้ / ในเป้า */
export function useAgingLabel() {
  const { t } = useI18n();
  return (days: number, target: number) => {
    const tone = agingTone(days, target);
    const text = tone === "over" ? t("purchaseRequest.age.over").replace("{n}", String(days - target))
      : tone === "due" ? t("purchaseRequest.age.due")
      : t("purchaseRequest.age.ok");
    return { tone, text, tag: TONE_TAG[tone] };
  };
}

/** "3 วันทำการ" · 0 = "เข้าวันนี้" */
export function useDaysText() {
  const { t } = useI18n();
  return (days: number) => (days === 0 ? t("purchaseRequest.age.today") : t("purchaseRequest.age.days").replace("{n}", String(days)));
}

/**
 * การ์ดความเร่งด่วนบนหน้าเอกสาร — แก้ได้: กล่องติ๊ก + เหตุผล · อ่านอย่างเดียว: แสดงเฉพาะใบที่ด่วน
 */
export function UrgentCard({ urgent, reason, editable, onChange, reasonError }: {
  urgent: boolean;
  reason: string;
  editable: boolean;
  onChange?: (next: { urgent: boolean; urgentReason: string }) => void;
  reasonError?: boolean;
}) {
  const { t } = useI18n();
  const help = t("purchaseRequest.urgent.help")
    .replace("{urgent}", String(PURCHASING_TARGET_DAYS.urgent))
    .replace("{normal}", String(PURCHASING_TARGET_DAYS.normal));
  if (!editable) {
    if (!urgent) return null;
    return (
      <section className="rounded-xl border border-[#f3cdb6] bg-[#fffaf6] px-6 py-[18px] flex items-start gap-3.5">
        <span className="w-9 h-9 rounded-lg bg-[#fff1e8] text-[#a8431a] flex items-center justify-center flex-shrink-0"><Zap size={18} aria-hidden="true" /></span>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <h2 className="m-0 text-base font-semibold text-[#a8431a]">{t("purchaseRequest.urgent.readonlyTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("purchaseRequest.urgent.reason")}</span>
          <span className="text-sm font-medium text-foreground whitespace-pre-line">{reason || "—"}</span>
          <span className="text-xs text-muted-foreground">{t("purchaseRequest.urgent.target").replace("{n}", String(PURCHASING_TARGET_DAYS.urgent))}</span>
        </div>
      </section>
    );
  }
  return (
    <section className={surface.card}>
      <div className={surface.cardHead}><h2 className={surface.cardTitle}>{t("purchaseRequest.urgent.cardTitle")}</h2></div>
      <div className="px-6 pt-5 pb-6 flex flex-col gap-4">
        <label className={`w-full p-4 rounded-lg border-[1.5px] flex items-start gap-3.5 cursor-pointer transition-colors ${urgent ? "border-[#a8431a] bg-[#fffaf6]" : "border-[#c3ccda] bg-white hover:border-[#a8431a]"}`}>
          <input
            type="checkbox"
            checked={urgent}
            onChange={(e) => onChange?.({ urgent: e.target.checked, urgentReason: reason })}
            className="w-5 h-5 mt-0.5 accent-[#a8431a] cursor-pointer flex-shrink-0"
          />
          <span className="flex-1 min-w-0 flex flex-col gap-1">
            <span className={`text-[15px] font-semibold inline-flex items-center gap-1.5 ${urgent ? "text-[#a8431a]" : "text-foreground"}`}>
              <Zap size={16} aria-hidden="true" /> {t("purchaseRequest.urgent.checkbox")}
            </span>
            <span className="text-[13px] text-[#3d5173] leading-relaxed">{help}</span>
          </span>
        </label>
        {urgent && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pr-urgentReason" className="text-[13px] font-medium text-[#26395a]">
              {t("purchaseRequest.urgent.reason")} <span className="text-[#b93636]">*</span>
            </label>
            <input
              id="pr-urgentReason"
              value={reason}
              onChange={(e) => onChange?.({ urgent, urgentReason: e.target.value })}
              aria-invalid={reasonError || undefined}
              className={`h-10 px-3 rounded-lg border bg-white text-sm outline-none focus:border-[#1a5fb4] focus:shadow-[0_0_0_3px_rgba(26,95,180,0.18)] ${reasonError ? "border-[#b93636]" : "border-[#c3ccda]"}`}
            />
            <span className={`text-xs ${reasonError ? "text-[#b93636]" : "text-muted-foreground"}`}>{t("purchaseRequest.urgent.reasonHelp")}</span>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * การ์ด "ถึงจัดซื้อมาแล้ว N วันทำการ" บนคอลัมน์ขวา — ขึ้นเมื่อใบถึงจัดซื้อแล้วเท่านั้น
 * ออกใบสั่งซื้อครบแล้วจะเปลี่ยนเป็น "ออกครบใน N วันทำการ" (หยุดนับ)
 */
export function PurchasingAgeCard({ receivedAt, completedAt, urgent, neededByDate }: {
  receivedAt: string;
  completedAt: string;
  urgent: boolean;
  neededByDate: string;
}) {
  const { t } = useI18n();
  const label = useAgingLabel();
  const daysText = useDaysText();
  if (!receivedAt) return null;
  const end = completedAt || todayInThailand();
  const days = businessDaysBetween(receivedAt, end) ?? 0;
  const calendar = calendarDaysBetween(receivedAt, end) ?? 0;
  const target = purchasingTargetDays(urgent);
  const state = label(days, target);
  const done = !!completedAt;
  const border = done ? (state.tone === "over" ? "border-[#f0c4c4]" : "border-[#bfe0cc]") : state.tone === "over" ? "border-[#f0c4c4]" : state.tone === "due" ? "border-[#efd3a0]" : "border-border";
  const valueColor = state.tone === "over" ? "text-[#b93636]" : done ? "text-[#1b7f4f]" : "text-foreground";
  // ออกครบแล้วและทันเป้า = ป้ายเขียว "ทันเป้า" แทน "ในเป้า"
  const tag = done && state.tone !== "over" ? { tone: "green" as const, text: t("purchaseRequest.age.onTime") } : { tone: state.tag, text: state.text };
  const segments = Math.max(days, target);
  return (
    <section className={`rounded-xl border bg-white p-5 flex flex-col gap-3 ${border}`}>
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] font-medium text-[#3d5173] inline-flex items-center gap-1.5">
          <Clock size={14} aria-hidden="true" /> {done ? t("purchaseRequest.age.completedTitle") : t("purchaseRequest.age.atPurchasing")}
        </span>
        <StageTag tone={tag.tone}>{tag.text}</StageTag>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`text-[26px] font-semibold leading-tight tabular-nums ${valueColor}`}>{days}</span>
        <span className="text-[15px] font-medium">{t("purchaseRequest.age.unit")}</span>
        <span className="text-[12.5px] text-muted-foreground">{t("purchaseRequest.age.calendar").replace("{n}", String(calendar))}</span>
      </div>
      {segments > 0 && segments <= 30 && (
        <div role="img" aria-label={`${daysText(days)} / ${t("purchaseRequest.age.target").replace("{n}", String(target))}`} className="flex gap-[3px] h-2">
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} className={`flex-1 rounded-full ${i < days ? (i < target ? "bg-[#1a5fb4]" : "bg-[#b93636]") : "bg-[#eef1f6]"}`} />
          ))}
        </div>
      )}
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t("purchaseRequest.age.target").replace("{n}", String(target))}{urgent ? ` · ${t("purchaseRequest.urgent.badge")}` : ""}</span>
        <span>{t("purchaseRequest.age.used").replace("{n}", String(days))}</span>
      </div>
      <div className="h-px bg-[#eef1f6]" />
      <Row label={t("purchaseRequest.age.receivedAt")} value={formatDisplayDate(receivedAt)} />
      {!done && <Row label={t("purchaseRequest.age.dueAt")} value={formatDisplayDate(addBusinessDays(receivedAt, target))} />}
      {done && <Row label={t("purchaseRequest.age.completedAt")} value={formatDisplayDate(completedAt)} />}
      {neededByDate && <Row label={t("purchaseRequestDoc.field.neededByDate")} value={formatDisplayDate(neededByDate)} />}
      <p className="m-0 text-xs text-muted-foreground leading-relaxed">{t("purchaseRequest.age.rule")}</p>
    </section>
  );
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[13px] text-muted-foreground">
      <span>{label}</span><span className="text-foreground text-right">{value}</span>
    </div>
  );
}

type TimelineEvent = {
  key: string;
  date: string;
  title: string;
  sub?: string;
  kind: "done" | "start" | "now" | "future";
  tag?: { tone: "urgent" | "blue" | "red"; text: string };
  /** วันทำการตั้งแต่เหตุการณ์ก่อนหน้า */
  delta?: number | null;
};

/**
 * การ์ด "เส้นเวลาของใบนี้" (2026-10-02) — ทุกขั้นที่ระบบรู้วันที่ + วันทำการที่ใช้ในแต่ละช่วง
 * เหตุการณ์ที่ยังไม่มีวันที่ (เช่นใบเก่าที่ไม่ได้บันทึกเวลาส่งขอ) ถูกข้าม ไม่เดา
 */
export function PurchaseRequestTimeline({ doc, purchaseOrders, completedAt }: {
  doc: PurchaseRequest;
  purchaseOrders: PurchaseRequestPoRef[];
  completedAt: string;
}) {
  const { t } = useI18n();
  const label = useAgingLabel();
  const daysText = useDaysText();
  const raw: Omit<TimelineEvent, "delta">[] = [];
  raw.push({
    key: "created", date: doc.createdAt.slice(0, 10), title: t("purchaseRequest.timeline.created"),
    sub: doc.requestedBy, kind: "done",
    ...(doc.urgent ? { tag: { tone: "urgent" as const, text: t("purchaseRequest.urgent.badge") } } : {}),
  });
  if (doc.submittedAt) raw.push({ key: "submitted", date: doc.submittedAt.slice(0, 10), title: t("purchaseRequest.timeline.submitted"), kind: "done" });
  if (doc.status === "Final" && doc.approvedAt) raw.push({ key: "approved", date: doc.approvedAt.slice(0, 10), title: t("purchaseRequest.timeline.approved"), sub: doc.approvedBy, kind: "done" });
  const received = doc.purchasingReceivedAt ?? "";
  if (received) {
    raw.push({
      key: "received", date: received, title: t("purchaseRequest.timeline.received"),
      sub: doc.pulledToPurchasingByName || doc.storeReviewedByName || "", kind: "start",
      tag: { tone: "blue", text: t("purchaseRequest.timeline.startTag") },
    });
  }
  for (const po of purchaseOrders) {
    raw.push({
      key: `po-${po.id}`, date: po.createdAt.slice(0, 10),
      title: t("purchaseRequest.timeline.po").replace("{no}", po.documentNumber),
      sub: [po.vendorName, t("ui.itemCount").replace("{n}", String(po.lineCount))].filter(Boolean).join(" · "),
      kind: "done",
    });
  }
  const target = purchasingTargetDays(doc.urgent);
  if (received && !completedAt) {
    const days = businessDaysBetween(received, todayInThailand()) ?? 0;
    const state = label(days, target);
    raw.push({
      key: "now", date: todayInThailand(), title: t("purchaseRequest.timeline.now"),
      sub: `${t("purchaseRequest.age.atPurchasing")} ${daysText(days)} · ${t("purchaseRequest.age.target").replace("{n}", String(target))}`,
      kind: "now",
      ...(state.tone !== "ok" ? { tag: { tone: state.tone === "over" ? "red" as const : "urgent" as const, text: state.text } } : {}),
    });
  }
  if (completedAt) raw.push({ key: "completed", date: completedAt, title: t("purchaseRequest.timeline.completed"), kind: "done" });
  else if (received) raw.push({ key: "future", date: "", title: t("purchaseRequest.timeline.completed"), sub: t("purchaseRequest.timeline.stopHere"), kind: "future" });

  // เรียงตามวันที่จริง (ช่อง "วันที่อนุมัติ" เป็นช่องที่เจ้าหน้าที่แก้เองได้ ลำดับจึงไม่แน่นอนเสมอไป)
  // · "วันนี้" กับ "ออกครบ (ยังไม่ถึง)" อยู่ท้ายเสมอ — sort ของ JS คงลำดับเดิมเมื่อวันที่เท่ากัน
  const tail = raw.filter((e) => e.kind === "now" || e.kind === "future");
  raw.splice(0, raw.length, ...raw.filter((e) => e.kind !== "now" && e.kind !== "future").sort((a, b) => a.date.localeCompare(b.date)), ...tail);
  const events: TimelineEvent[] = raw.map((e, i) => {
    const prev = raw.slice(0, i).reverse().find((p) => p.date);
    return { ...e, delta: e.date && prev?.date ? businessDaysBetween(prev.date, e.date) : null };
  });
  if (events.length <= 1) return null;
  const totalEnd = completedAt || todayInThailand();
  const startDate = doc.submittedAt?.slice(0, 10) || "";
  const total = startDate ? businessDaysBetween(startDate, totalEnd) : null;
  const totalCal = startDate ? calendarDaysBetween(startDate, totalEnd) : null;

  const dot: Record<TimelineEvent["kind"], string> = {
    done: "bg-[#1b7f4f] border-white", start: "bg-[#1a5fb4] border-white", now: "bg-[#b93636] border-[#f0c4c4]", future: "bg-white border-[#c3ccda]",
  };
  return (
    <section className={surface.card}>
      <div className={`${surface.cardHead} items-start`}>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <h2 className={surface.cardTitle}>{t("purchaseRequest.timeline.title")}</h2>
          <span className="text-xs text-muted-foreground">{t("purchaseRequest.timeline.subtitle")}</span>
        </div>
        {total !== null && (
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
            <span className="text-xs text-muted-foreground">{t("purchaseRequest.timeline.sinceSubmit")}</span>
            <span className="text-[15px] font-semibold tabular-nums">
              {t("purchaseRequest.age.days").replace("{n}", String(total))}{" "}
              <span className="text-[12.5px] font-medium text-muted-foreground">{t("purchaseRequest.age.calendar").replace("{n}", String(totalCal ?? 0))}</span>
            </span>
          </div>
        )}
      </div>
      <ol className="m-0 px-6 pt-3 pb-4 list-none flex flex-col">
        {events.map((e, i) => (
          <li key={e.key} className="grid grid-cols-[112px_20px_minmax(0,1fr)_120px] gap-3 min-h-[56px]">
            <span className={`pt-2 text-[13px] font-medium ${e.kind === "future" ? "text-[#8a97ad]" : "text-foreground"}`}>{e.date ? formatDisplayDate(e.date) : "—"}</span>
            <span className="flex flex-col items-center" aria-hidden="true">
              <span className={`w-0.5 h-2.5 ${i === 0 ? "bg-transparent" : "bg-[#c3ccda]"}`} />
              <span className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${dot[e.kind]}`} />
              <span className={`w-0.5 flex-1 ${i === events.length - 1 ? "bg-transparent" : e.kind === "now" || e.kind === "future" ? "bg-[#e3e8f0]" : "bg-[#c3ccda]"}`} />
            </span>
            <span className="pt-[7px] pb-2.5 flex flex-col gap-0.5 min-w-0">
              <span className={`text-sm flex items-center gap-2 flex-wrap ${e.kind === "now" ? "font-semibold" : "font-medium"} ${e.kind === "future" ? "text-[#8a97ad]" : "text-foreground"}`}>
                {e.title}
                {e.tag && <StageTag tone={e.tag.tone}>{e.tag.text}</StageTag>}
              </span>
              {e.sub && <span className="text-[12.5px] text-muted-foreground">{e.sub}</span>}
            </span>
            <span className={`pt-2 text-right text-[13px] font-semibold tabular-nums ${e.kind === "now" ? "text-[#b93636]" : "text-foreground"}`}>
              {e.delta !== null && e.delta !== undefined && i > 0 ? t("purchaseRequest.timeline.delta").replace("{n}", String(e.delta)) : ""}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
