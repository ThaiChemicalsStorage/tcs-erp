import { CalendarClock } from "lucide-react";
import type { FollowUps, FollowUpSummary, DashboardVatMode } from "../../lib/dashboard";
import { useI18n } from "../../lib/i18n";

// แถวรายการติดตามงานหนึ่งรายการ กดแล้วเปิดรายชื่อใบเสนอราคาของลูกค้ารายนั้น
// A single follow-up row; clicking it opens that customer's filtered quotation list.
function Row({ f, onClick }: { f: FollowUpSummary; onClick: (client: string) => void }) {
  return (
    <button onClick={() => onClick(f.client)} className="w-full flex items-center justify-between text-xs py-2 border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors px-1 rounded text-left">
      <span className="text-foreground min-w-0 truncate">{f.client}{f.salesperson && <span className="text-muted-foreground"> · {f.salesperson}</span>}</span>
      <span className="flex items-center gap-2 font-mono text-muted-foreground flex-shrink-0 ml-2">
        <span>{f.followUpDate}</span>
        <span className="text-foreground font-semibold">฿{f.amount.toLocaleString("th-TH")}</span>
      </span>
    </button>
  );
}

// แสดงรายการติดตามงานที่เกินกำหนด/วันนี้/กำลังจะถึง แบ่งเป็นกลุ่ม
// Shows follow-up reminders grouped into overdue, today, and upcoming sections.
export function FollowUpReminders({ followUps, onOpenClient, vatMode }: { followUps: FollowUps; onOpenClient: (client: string) => void; vatMode: DashboardVatMode }) {
  const { t } = useI18n();
  const vatSuffix = t(vatMode === "post" ? "dashboard.vatSuffix.post" : "dashboard.vatSuffix.pre");
  const sections: { key: keyof FollowUps; label: string; accent: string }[] = [
    { key: "overdue", label: t("dashboard.followUps.overdue"), accent: "#e05252" },
    { key: "today", label: t("dashboard.followUps.today"), accent: "#c9a84c" },
    { key: "upcoming", label: t("dashboard.followUps.upcoming"), accent: "#2aa36b" },
  ];
  const total = followUps.today.length + followUps.overdue.length + followUps.upcoming.length;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-foreground mb-1 flex items-center gap-1.5" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
        <CalendarClock size={15} /> {t("dashboard.followUps.title")}
      </h2>
      <p className="text-[10px] text-muted-foreground mb-3">{`${t("dashboard.followUps.amountNote")} ${vatSuffix}`}</p>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">{t("dashboard.noData")}</p>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {sections.filter((s) => followUps[s.key].length > 0).map((s) => (
            <div key={s.key}>
              <p className="text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: s.accent }}>{s.label} ({followUps[s.key].length})</p>
              {followUps[s.key].map((f) => <Row key={f.id} f={f} onClick={onOpenClient} />)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
