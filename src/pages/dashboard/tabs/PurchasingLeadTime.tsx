import { CalendarClock, Zap } from "lucide-react";
import type { PurchasingLeadTime as LeadTime, PurchaseRequestDept } from "../../../lib/departmentDashboard";
import { useI18n } from "../../../lib/i18n";
import { agingTone } from "../../../lib/businessDays";
import { UrgentBadge } from "../../purchaseRequest/purchasingAging";
import { StageTag } from "../../purchaseRequest/docShared";
import {
  CardTable, ChartCard, KpiCard, KpiGrid, MonthlyBars, OpenListButton, SectionHeading, SplitRow,
} from "./DepartmentWidgets";
import { CHART, TONE, TH } from "./dashboardTokens";
import { fmtCount } from "./countFormat";
import { formatDisplayDate } from "../../../lib/displayDate";

/**
 * KPI ระยะเวลาออกใบสั่งซื้อบนแท็บจัดซื้อ (เจ้าของสั่ง 2026-10-02 — *"เพิ่มข้อมูลจะได้เอาไปทำ KPI ได้ว่าได้ใบ PR มาแล้ว
 * ใช้เวลากี่วันในการออกใบ PO"*) · ดีไซน์: canvas REDESIGN บอร์ด Dashboard-Purchasing ส่วน "KPI ระยะเวลาออกใบสั่งซื้อ"
 *
 * ตัวเลขทั้งหมดมาจากเซิร์ฟเวอร์ (`purchasingLeadTime()` ใน api/_lib/departmentDashboard.ts) — หน้านี้แค่แสดง
 */
export function PurchasingLeadTimeSection({ data, onOpenInbox }: { data: LeadTime; onOpenInbox: () => void }) {
  const { t } = useI18n();
  const c = data.completed;
  const days = (n: number | null) => (n === null ? "—" : n.toFixed(1));
  const pct = c.count > 0 ? Math.round((c.onTime / c.count) * 100) : null;
  const deptLabel: Record<PurchaseRequestDept, string> = {
    project: t("dashboard.purchasing.pr.dept.project"),
    production: t("dashboard.purchasing.pr.dept.production"),
    general: t("dashboard.purchasing.pr.dept.general"),
  };
  const bucketLabel = (key: string) => (key === "0" ? t("dashboard.leadTime.bucket.sameDay") : t("dashboard.leadTime.bucket.days").replace("{n}", key.replace("-", "–")));
  const w = data.waiting;
  const lastTwo = data.avgByMonth.filter((m) => m.avgDays !== null).slice(-2);
  const trendCaption = lastTwo.length === 2 && lastTwo[0].avgDays !== null && lastTwo[1].avgDays !== null
    ? (lastTwo[1].avgDays <= lastTwo[0].avgDays ? t("dashboard.leadTime.faster") : t("dashboard.leadTime.slower"))
      .replace("{n}", Math.abs(lastTwo[1].avgDays - lastTwo[0].avgDays).toFixed(1))
    : undefined;
  const stageTotal = (data.stages.approval ?? 0) + (data.stages.store ?? 0) + (data.stages.purchasing ?? 0);
  const stageParts = [
    { key: "approval", value: data.stages.approval, label: t("dashboard.leadTime.stage.approval"), who: t("dashboard.leadTime.stage.approvalWho"), color: "#d6dce6", fg: "#0b1d3a" },
    { key: "store", value: data.stages.store, label: t("dashboard.leadTime.stage.store"), who: t("dashboard.leadTime.stage.storeWho"), color: "#c3ccda", fg: "#0b1d3a" },
    { key: "purchasing", value: data.stages.purchasing, label: t("dashboard.leadTime.stage.purchasing"), who: t("dashboard.leadTime.stage.purchasingWho"), color: CHART.blue, fg: "#ffffff" },
  ];

  return (
    <>
      <SectionHeading divider title={t("dashboard.leadTime.title")} note={t("dashboard.leadTime.note")} />
      <div className="flex items-center gap-2 flex-wrap -mt-2 text-[13px] text-[#3d5173]">
        <CalendarClock size={14} className="text-muted-foreground" aria-hidden="true" />
        <span>{t("dashboard.leadTime.rule")}</span>
        <span className="flex-1" />
        <span className="h-6 px-2.5 rounded-full bg-white border border-border text-[12.5px] inline-flex items-center whitespace-nowrap">
          {t("dashboard.leadTime.targetNormal").replace("{n}", String(data.targets.normal))}
        </span>
        <span className="h-6 px-2.5 rounded-full bg-[#fcebeb] text-[#b93636] text-[12.5px] inline-flex items-center gap-1 whitespace-nowrap">
          <Zap size={12} strokeWidth={2.5} aria-hidden="true" />{t("dashboard.leadTime.targetUrgent").replace("{n}", String(data.targets.urgent))}
        </span>
      </div>

      <KpiGrid>
        <KpiCard
          label={t("dashboard.leadTime.avg")} value={days(c.avgDays)} unit={t("purchaseRequest.age.unit")} scope="period"
          caption={<>
            {t("dashboard.leadTime.avgSplit").replace("{urgent}", days(c.avgUrgent)).replace("{normal}", days(c.avgNormal))}
            {trendCaption && <span className="block mt-0.5">{trendCaption}</span>}
          </>}
        />
        <KpiCard
          label={t("dashboard.leadTime.onTime")} value={pct === null ? "—" : `${pct}%`} scope="period"
          progress={c.count > 0 ? { value: c.onTime, max: c.count, color: TONE.good } : undefined}
          caption={t("dashboard.leadTime.onTimeCaption")
            .replace("{ok}", fmtCount(c.onTime)).replace("{n}", fmtCount(c.count))
            .replace("{ou}", fmtCount(c.onTimeUrgent)).replace("{u}", fmtCount(c.urgentCount))
            .replace("{on}", fmtCount(c.onTimeNormal)).replace("{nn}", fmtCount(c.count - c.urgentCount))}
        />
        <KpiCard
          label={t("dashboard.leadTime.waiting")} value={fmtCount(w.count)} unit={t("dashboard.unit.docs")} scope={t("dashboard.dept.caption.asOfNow")}
          segments={w.count > 0 ? [
            { key: "urgent", label: t("purchaseRequest.urgent.badge"), value: w.urgent, color: CHART.orange },
            { key: "normal", label: t("dashboard.leadTime.normal"), value: w.count - w.urgent, color: CHART.blue },
          ] : undefined}
        />
        <KpiCard
          tone={w.over > 0 ? "alert" : undefined}
          label={t("dashboard.leadTime.over")} value={fmtCount(w.over)} unit={t("dashboard.unit.docs")} scope={t("dashboard.dept.caption.asOfNow")}
          caption={<>
            {w.due > 0 && <span className="block">{t("dashboard.leadTime.dueToday").replace("{n}", fmtCount(w.due))}</span>}
            {w.oldestDays !== null && t("dashboard.leadTime.oldest").replace("{n}", String(w.oldestDays)).replace("{id}", w.oldestId)}
          </>}
        />
      </KpiGrid>

      <SplitRow
        main={
          <CardTable
            title={t("dashboard.leadTime.queue.title")} sub={t("dashboard.leadTime.queue.sub")}
            actions={<OpenListButton onClick={onOpenInbox} />}
            headers={[
              { label: t("purchaseRequest.col.id") }, { label: t("purchaseRequest.col.department") },
              { label: t("purchaseRequest.col.arrived") }, { label: t("purchaseRequest.col.ageAtPurchasing") },
              { label: t("purchaseRequestDoc.field.neededByDate") },
            ]}
            empty={t("dashboard.leadTime.queue.empty")} isEmpty={data.queue.length === 0}
          >
            {data.queue.map((q) => {
              const tone = agingTone(q.days, q.target);
              return (
                <tr key={q.id} className={`border-b border-[#eef1f6] h-[56px] ${q.urgent ? "bg-[#fef7f7]" : ""}`}>
                  <td className={`${TH} font-normal`}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px] font-medium text-foreground">{q.id}</span>
                      {q.urgent && <UrgentBadge />}
                    </span>
                  </td>
                  <td className={`${TH} font-normal text-[13px]`}>{deptLabel[q.dept]}</td>
                  <td className={`${TH} font-normal text-[13px]`}>{formatDisplayDate(q.receivedAt)}</td>
                  <td className={`${TH} font-normal`}>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-foreground">{q.days === 0 ? t("purchaseRequest.age.today") : t("purchaseRequest.age.days").replace("{n}", String(q.days))}</span>
                      <StageTag tone={tone === "over" ? "red" : tone === "due" ? "amber" : "grey"}>
                        {tone === "over" ? t("purchaseRequest.age.over").replace("{n}", String(q.days - q.target)) : tone === "due" ? t("purchaseRequest.age.due") : t("purchaseRequest.age.ok")}
                      </StageTag>
                    </span>
                  </td>
                  <td className={`${TH} font-normal text-[13px]`}>{q.neededByDate ? formatDisplayDate(q.neededByDate) : "—"}</td>
                </tr>
              );
            })}
          </CardTable>
        }
        side={
          <ChartCard title={t("dashboard.leadTime.dist.title")} sub={t("dashboard.leadTime.dist.sub").replace("{n}", fmtCount(c.count))} className="h-full">
            <MonthlyBars
              rows={data.distribution.map((r) => ({ ...r, month: r.key }))}
              labelOf={(r) => bucketLabel(r.key)}
              stacked
              series={[
                { key: "urgent", name: t("purchaseRequest.urgent.badge"), color: CHART.orange },
                { key: "normal", name: t("dashboard.leadTime.normal"), color: CHART.blue },
              ]}
              format={(v) => fmtCount(v)}
              height={200}
              empty={t("dashboard.leadTime.empty")}
            />
          </ChartCard>
        }
      />

      <SplitRow
        main={
          <ChartCard title={t("dashboard.leadTime.trend.title")} sub={t("dashboard.leadTime.trend.sub")} fill>
            <MonthlyBars
              rows={data.avgByMonth.map((m) => ({ month: m.month, avgDays: m.avgDays ?? undefined }))}
              series={[{ key: "avgDays", name: t("dashboard.leadTime.trend.series") }]}
              format={(v) => (Number.isFinite(v) ? v.toFixed(1) : "")}
              axisFormat={(v) => String(v)}
              empty={t("dashboard.leadTime.empty")}
            />
          </ChartCard>
        }
        side={
          <CardTable
            title={t("dashboard.leadTime.dept.title")} sub={t("dashboard.leadTime.dept.sub")}
            headers={[
              { label: t("purchaseRequest.col.department") }, { label: t("dashboard.leadTime.dept.count"), align: "right" },
              { label: t("dashboard.leadTime.dept.avg"), align: "right" }, { label: t("dashboard.leadTime.onTime"), align: "right" },
            ]}
            empty={t("dashboard.leadTime.empty")} isEmpty={c.count === 0}
          >
            {data.byDepartment.map((d) => (
              <tr key={d.dept} className="border-b border-[#eef1f6] h-[52px]">
                <td className={`${TH} font-medium text-foreground`}>{deptLabel[d.dept]}</td>
                <td className={`${TH} font-normal text-right tabular-nums`}>{fmtCount(d.count)}</td>
                <td className={`${TH} text-right tabular-nums text-foreground`}>{days(d.avgDays)}</td>
                <td className={`${TH} text-right tabular-nums text-foreground`}>{d.count > 0 ? `${Math.round((d.onTime / d.count) * 100)}%` : "—"}</td>
              </tr>
            ))}
          </CardTable>
        }
      />

      <ChartCard
        title={t("dashboard.leadTime.stage.title")}
        sub={t("dashboard.leadTime.stage.sub").replace("{n}", fmtCount(data.stages.count))}
        actions={stageTotal > 0 ? <span className="text-[15px] font-semibold tabular-nums">{t("dashboard.leadTime.stage.total").replace("{n}", stageTotal.toFixed(1))}</span> : undefined}
      >
        {data.stages.count === 0 || stageTotal === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-6">{t("dashboard.leadTime.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div role="img" aria-label={stageParts.map((p) => `${p.label} ${days(p.value)}`).join(", ")} className="flex gap-[3px] h-9">
              {stageParts.map((p) => (
                <span key={p.key} className="rounded-md flex items-center justify-center text-[13px] font-semibold tabular-nums min-w-[36px]"
                  style={{ width: `${((p.value ?? 0) / stageTotal) * 100}%`, background: p.color, color: p.fg }}>
                  {days(p.value)}
                </span>
              ))}
            </div>
            {/* คำอธิบายแยกจากแท่ง — ช่วงที่สั้นมาก (เช่น 0 วัน) จะได้ไม่ถูกตัดชื่อเหลือ "รอ..." */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {stageParts.map((p) => (
                <span key={p.key} className="flex items-start gap-2">
                  <span aria-hidden className="mt-[5px] size-2.5 rounded-sm shrink-0" style={{ background: p.color }} />
                  <span className="flex flex-col gap-px">
                    <span className={`text-[13px] ${p.key === "purchasing" ? "font-semibold" : "font-medium"}`}>{p.label} · <span className="tabular-nums">{days(p.value)}</span></span>
                    <span className="text-xs text-muted-foreground">{p.who}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </ChartCard>
    </>
  );
}
