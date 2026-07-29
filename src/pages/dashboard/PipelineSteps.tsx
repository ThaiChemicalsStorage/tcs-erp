import { ChevronRight, GitBranch } from "lucide-react";
import type { PipelineStage } from "../../lib/dashboard";
import { type QuoteStatus, statusLabelKey, statusStyle } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { EmptyState } from "../../components/EmptyState";
import { fmtShort, fmtPercent } from "./format";

/** Main forward flow (Draft → ... → Won) rendered as connected step cards; the three "left the flow" outcomes render as a separate row below, since they're branches off the main path, not sequential steps in it. */
const MAIN_FLOW: QuoteStatus[] = ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว", "ส่งให้ลูกค้าแล้ว", "ลูกค้ายอมรับ", "ปิดการขายสำเร็จ"];
const OFF_RAMP: QuoteStatus[] = ["ลูกค้าปฏิเสธ", "เสียโอกาส", "ยกเลิก"];

function StageCard({ stage, onStageClick }: { stage: PipelineStage; onStageClick: (s: QuoteStatus) => void }) {
  const { t } = useI18n();
  const status = stage.stage as QuoteStatus;
  return (
    <button
      onClick={() => onStageClick(status)}
      className="flex-1 min-w-[136px] bg-card border border-border rounded-xl p-3.5 text-left hover:border-[#c9a84c]/40 hover:shadow-md transition-all"
    >
      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${statusStyle[status]}`}>
        {t(statusLabelKey[status])}
      </span>
      <p className="text-xl font-bold text-foreground font-mono leading-none">{stage.count.toLocaleString("th-TH")}</p>
      <p className="text-[10px] text-muted-foreground mt-1 font-mono">{fmtShort(stage.totalValue)}</p>
      {stage.conversionFromPrevious !== null && (
        <p className="text-[10px] text-[#2aa36b] mt-1.5 font-mono">
          {fmtPercent(stage.conversionFromPrevious)} <span className="text-muted-foreground">{t("dashboard.pipelineSteps.conversion")}</span>
        </p>
      )}
    </button>
  );
}

/**
 * Replaces the previous `recharts` `FunnelChart` (`PipelineFunnel.tsx`, now unused) — the funnel
 * shape squeezed 9 Thai status labels into a shrinking silhouette, which overlapped and read as
 * broken/unprofessional. Horizontal connected step cards (2026-07-10 UI/UX redesign, "Option A")
 * show the same real count/value/conversion% data per stage without that layout problem, and stay
 * legible with real (not fixed-width English) Thai labels.
 */
export function PipelineSteps({ pipeline, onStageClick }: { pipeline: PipelineStage[]; onStageClick: (stage: QuoteStatus) => void }) {
  const { t } = useI18n();
  const hasData = pipeline.some((p) => p.count > 0);
  const byStage = new Map(pipeline.map((p) => [p.stage, p]));
  const mainStages = MAIN_FLOW.map((s) => byStage.get(s)).filter((s): s is PipelineStage => !!s);
  const offRampStages = OFF_RAMP.map((s) => byStage.get(s)).filter((s): s is PipelineStage => !!s);

  return (
    <ChartCard title={t("dashboard.pipeline.title")} sub={t("dashboard.pipeline.sub")}>
      {!hasData ? (
        <EmptyState icon={GitBranch} title={t("dashboard.noData")} description={t("dashboard.pipeline.sub")} compact />
      ) : (
        <div className="space-y-4">
          <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
            {mainStages.map((stage, i) => (
              <div key={stage.stage} className="flex items-center gap-1.5 flex-1">
                <StageCard stage={stage} onStageClick={onStageClick} />
                {i < mainStages.length - 1 && <ChevronRight size={16} className="text-muted-foreground/50 flex-shrink-0" />}
              </div>
            ))}
          </div>
          {offRampStages.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">{t("dashboard.pipeline.offRamp")}</p>
              <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
                {offRampStages.map((stage) => <StageCard key={stage.stage} stage={stage} onStageClick={onStageClick} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}
