import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { PipelineStage } from "../../lib/dashboard";
import { type QuoteStatus, statusLabelKey } from "../../lib/quotes";
import { useI18n } from "../../lib/i18n";
import { ChartCard } from "./ChartCard";
import { fmtShort, fmtPercent } from "./format";

const STAGE_COLORS = ["#5a7299", "#c9a84c", "#2aa36b", "#3b6fc9", "#1f9d8a", "#157347", "#e08a3c", "#e05252", "#8a94a6"];

export function PipelineFunnel({ pipeline, onStageClick }: { pipeline: PipelineStage[]; onStageClick: (stage: QuoteStatus) => void }) {
  const { t } = useI18n();
  const hasData = pipeline.some((p) => p.count > 0);
  const funnelData = pipeline.map((p, i) => ({ name: t(statusLabelKey[p.stage as QuoteStatus]), value: p.count, fill: STAGE_COLORS[i % STAGE_COLORS.length] }));

  return (
    <ChartCard title={t("dashboard.pipeline.title")} sub={t("dashboard.pipeline.sub")}>
      {!hasData ? (
        <p className="text-xs text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <FunnelChart>
              <Tooltip formatter={(value: number) => [value.toLocaleString("th-TH"), t("dashboard.pipeline.col.count")]} />
              <Funnel dataKey="value" data={funnelData} isAnimationActive>
                <LabelList position="right" dataKey="name" stroke="none" fill="#5a7299" fontSize={11} />
                {funnelData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.fill} />)}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>

          <div className="mt-4 divide-y divide-border/60 border-t border-border">
            {pipeline.map((p) => (
              <button
                key={p.stage}
                onClick={() => onStageClick(p.stage as QuoteStatus)}
                className="w-full flex items-center justify-between py-2.5 text-left hover:bg-secondary/40 transition-colors px-1 rounded"
              >
                <span className="text-xs text-foreground">{t(statusLabelKey[p.stage as QuoteStatus])}</span>
                <span className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                  <span>{p.count.toLocaleString("th-TH")} {t("quotation.countUnit")}</span>
                  <span>{fmtShort(p.totalValue)}</span>
                  <span className="w-12 text-right">{p.conversionFromPrevious !== null ? fmtPercent(p.conversionFromPrevious) : "—"}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}
