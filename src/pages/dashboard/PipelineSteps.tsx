import type { PipelineStage, DashboardVatMode } from "../../lib/dashboard";
import { type QuoteStatus, statusLabelKey } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { QuoteStatusPill } from "../quotation/statusIcons";
import { ChartCard, ScopeTag } from "./ChartCard";
import { fmtShort, fmtPercent } from "./format";
import { BAR, TONE } from "./tabs/dashboardTokens";
import { fmtCount } from "./tabs/countFormat";

const MAIN_FLOW: QuoteStatus[] = ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว", "ลูกค้ายอมรับ", "ปิดการขายสำเร็จ"];
const OFF_RAMP: QuoteStatus[] = ["ลูกค้าปฏิเสธ", "เสียโอกาส", "ยกเลิก"];

/** จอแคบซ่อนแถบ (ซ้ำกับตัวเลขจำนวน) เพื่อให้ "ต่อจากขั้นก่อน" ยังอยู่ครบ */
const GRID = "grid grid-cols-[minmax(0,1fr)_36px_72px_56px] sm:grid-cols-[150px_minmax(0,1fr)_48px_96px_110px] gap-2 sm:gap-3 items-center px-4 sm:px-6";

/**
 * ใบเสนอราคาแต่ละขั้น (บอร์ด Dashboard-Sales, ดีไซน์ใหม่ 2026-09-30) — แทนการ์ดขั้นตอนแนวนอนกับรายการขั้นเดิมที่ซ้ำกัน
 * แถวละขั้น: ป้ายสถานะ · แถบเทียบขั้นที่มากสุด · จำนวน · มูลค่า · "ต่อจากขั้นก่อน" · ขั้นที่หลุดจากเส้นทางอยู่ใต้เส้นคั่น
 * กดแถวเปิดรายการใบเสนอราคาที่กรองสถานะนั้น (เหมือนเดิม)
 */
export function PipelineSteps({ pipeline, onStageClick, vatMode }: { pipeline: PipelineStage[]; onStageClick: (stage: QuoteStatus) => void; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const byStage = new Map(pipeline.map((p) => [p.stage, p]));
  const mainStages = MAIN_FLOW.map((s) => byStage.get(s)).filter((s): s is PipelineStage => !!s);
  const offRampStages = OFF_RAMP.map((s) => byStage.get(s)).filter((s): s is PipelineStage => !!s);
  const max = Math.max(1, ...pipeline.map((p) => p.count));
  const hasData = pipeline.some((p) => p.count > 0);

  const row = (stage: PipelineStage, offRamp: boolean) => {
    const status = stage.stage as QuoteStatus;
    const label = t(statusLabelKey[status]);
    return (
      <li key={stage.stage}>
        <button
          type="button" onClick={() => onStageClick(status)}
          className={`${GRID} w-full min-h-10 py-1 text-left hover:bg-[#f8f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1a5fb4]/40 transition-colors`}
        >
          <span className="min-w-0"><QuoteStatusPill status={status} label={label} /></span>
          <span className="hidden sm:block h-2 rounded-full bg-[#eef1f6] overflow-hidden" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${(stage.count / max) * 100}%`, background: offRamp ? TONE.empty : BAR.rank }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{fmtCount(stage.count)}</span>
          <span className="text-right text-[#26395a] tabular-nums whitespace-nowrap">{fmtShort(stage.totalValue)}</span>
          <span className="text-right text-[13px] text-muted-foreground tabular-nums">
            {offRamp ? "" : stage.conversionFromPrevious === null ? "—" : fmtPercent(stage.conversionFromPrevious)}
          </span>
        </button>
      </li>
    );
  };

  return (
    <ChartCard
      flush className="h-full" bodyClassName="flex-1 flex flex-col"
      title={t("dashboard.sales.stages.title")} tag={vatSuffix} sub={t("dashboard.sales.stages.sub2")}
      actions={<ScopeTag>{t("dashboard.dept.periodTag")}</ScopeTag>}
    >
      {!hasData ? (
        <p className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <>
          <div className={`${GRID} h-10 bg-[#f8f9fc] border-b border-border text-[12.5px] font-semibold text-[#3d5173]`} aria-hidden="true">
            <span>{t("dashboard.sales.stages.col.stage")}</span>
            <span className="hidden sm:block" />
            <span className="text-right">{t("dashboard.sales.stages.col.count")}</span>
            <span className="text-right">{t("dashboard.sales.stages.col.value")}</span>
            <span className="text-right truncate sm:whitespace-nowrap" title={t("dashboard.sales.stages.col.conversion")}>{t("dashboard.sales.stages.col.conversion")}</span>
          </div>
          <ul className="py-1">{mainStages.map((s) => row(s, false))}</ul>
          {offRampStages.length > 0 && (
            <>
              <p className="px-5 sm:px-6 pt-2.5 pb-1.5 border-t border-[#eef1f6] text-xs font-semibold text-muted-foreground">{t("dashboard.pipeline.offRamp")}</p>
              <ul className="pb-2">{offRampStages.map((s) => row(s, true))}</ul>
            </>
          )}
        </>
      )}
    </ChartCard>
  );
}
