import { useEffect, useMemo, useState } from "react";
import { Printer, Loader2 } from "lucide-react";
import type { Company, CompanyHeaderInfo } from "../../lib/storage";
import { fetchDepartments, type Department } from "../../lib/departments";
import { fetchTeams, type Team } from "../../lib/teams";
import { fetchCodeEntries, type CodeEntry } from "../../lib/codeRegister";
import { fetchToolHoldings, fetchToolReport, type ToolHoldingRow, type ToolReportRow } from "../../lib/toolHoldings";
import { ToolReportPrintDocument } from "./ToolReportPrintDocument";
import { ToolIssueCard } from "./ToolIssueCard";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";
import { useModuleTour, type TourStep } from "../../components/GuidedTour";
import { TourReplayButton } from "../../components/TourReplayButton";
import { formatQuoteDateThai } from "../../lib/quotes";
import { printDate } from "../../lib/printFormat";
import { useI18n } from "../../lib/i18n";
import { ListPageHeader, ListCard, ListTabs, ListToolbar, ListEmpty } from "../../components/ui/ListPage";
import { SelectBox } from "../../components/ui/Field";
import { btn, field, table } from "../../components/ui/styles";
import { LoadErrorState } from "../receivingReport/receivingUi";
import { Pill } from "../stock/inventoryUi";

/** "issue" (2026-09-03 รอบสอง) = หน้าตัดเบิกเครื่องมือที่เจ้าของสั่ง — จ่าย/รับคืนให้ทีมโดยตรง */
type Tab = "issue" | "holdings" | "report";

/** แถว 56px ตามบอร์ด (ตารางกลางสูง 60) */
const ROW_CLS = "h-14 border-b border-[#eef1f6] bg-white hover:bg-[#f8f9fc] transition-colors text-sm";

/** วันแรกของเดือนนี้ตามเวลาเครื่อง — ค่าตั้งต้นของช่วงรายงาน */
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// หน้าเครื่องมือประจำทีม (2026-09-03) — เจ้าของสั่ง "เพิ่มหน้าคุมเครื่องมือ ว่าทีมนี้มีเครื่องมืออะไรในครอบครอง"
// และหน้าย่อยรายงานว่าทีมไหนเบิกอะไรไปบ้าง พิมพ์ได้ · แท็บ "ในครอบครอง"/"รายงาน" อ่านอย่างเดียว
// ส่วนแท็บ "จ่าย / รับคืน" (2026-09-03b, ต้องมีสิทธิ์ stock:adjust) เขียนลงบัญชีสต๊อกได้
// ทุกตัวเลขมาจากบัญชีสต๊อกที่ประทับทีมไว้ — รวมทั้งที่จ่ายตามใบเบิกและที่จ่ายตรงจากหน้านี้
// ดีไซน์ใหม่ 2026-09-30: การ์ดเดียวมีแท็บ · ตัวกรองอยู่ในแถบเครื่องมือ · ตัวเลขสรุปย้ายเป็นข้อความชิดขวาของแถบ
export function ToolControlPage({ company, currentUserId, canIssue }: { company: Company; currentUserId: string; canIssue: boolean }) {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("holdings");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [codeEntries, setCodeEntries] = useState<CodeEntry[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [workTypeCode, setWorkTypeCode] = useState("");
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [retryToken, setRetryToken] = useState(0);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchDepartments().then((list) => { if (!cancelled) setDepartments(list); }).catch(() => {});
    fetchTeams().then((list) => { if (!cancelled) setTeams(list); }).catch(() => {});
    fetchCodeEntries().then((list) => { if (!cancelled) setCodeEntries(list); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ผลลัพธ์ผูกกับ key ของรอบที่ fetch — loading = ยังไม่มีผลของ key ปัจจุบัน (pattern เดียวกับ StockPage)
  const filter = useMemo(() => ({ departmentId, teamId, workTypeCode, from: tab === "report" ? from : "", to: tab === "report" ? to : "" }), [departmentId, teamId, workTypeCode, from, to, tab]);
  const resultKey = `${tab}|${filter.departmentId}|${filter.teamId}|${filter.workTypeCode}|${filter.from}|${filter.to}|${retryToken}`;
  const [result, setResult] = useState<{ key: string; holdings?: ToolHoldingRow[]; rows?: ToolReportRow[]; truncated?: boolean; error?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = resultKey;
    const load = tab === "holdings"
      ? fetchToolHoldings(filter).then((holdings) => ({ key, holdings }))
      : fetchToolReport(filter).then(({ rows, truncated }) => ({ key, rows, truncated }));
    load.then((r) => { if (!cancelled) setResult(r); }).catch(() => { if (!cancelled) setResult({ key, error: true }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);
  const current = result?.key === resultKey ? result : null;
  const loading = current === null;
  const holdings = current?.holdings ?? [];
  const rows = current?.rows ?? [];

  const tourSteps: TourStep[] = [
    { element: '[data-tour="tool-tabs"]', manual: "ch25-1", popover: { title: t("tour.toolControl.tabs.title"), description: t("tour.toolControl.tabs.desc"), side: "bottom" } },
    // แท็บ "จ่าย / รับคืน" มีเฉพาะผู้มีสิทธิ์จ่าย (และเป็นแท็บแรกเสมอเมื่อมี) — ไม่มีสิทธิ์ก็ไม่ใส่ขั้นนี้
    ...(canIssue ? [{ element: '[data-tour="tool-tabs"] [role="tab"]:first-child', manual: "ch25-2", popover: { title: t("tour.toolControl.issue.title"), description: t("tour.toolControl.issue.desc"), side: "bottom" } } satisfies TourStep] : []),
    { element: '[data-tour="tool-filters"]', manual: "ch25-1", popover: { title: t("tour.toolControl.filters.title"), description: t("tour.toolControl.filters.desc"), side: "bottom" } },
    { element: '[data-tour="tool-holdings"]', manual: "ch25-1", popover: { title: t("tour.toolControl.holdings.title"), description: t("tour.toolControl.holdings.desc"), side: "top" } },
    { element: '[data-tour="tool-print"]', manual: "ch25-1", popover: { title: t("tour.toolControl.print.title"), description: t("tour.toolControl.print.desc"), side: "bottom" } },
  ];
  const tour = useModuleTour("toolControl", currentUserId, tourSteps);

  useEffect(() => {
    if (!showPrint) return;
    const reset = () => setShowPrint(false);
    window.addEventListener("afterprint", reset);
    window.print();
    return () => window.removeEventListener("afterprint", reset);
  }, [showPrint]);

  const activeDepartments = departments.filter((d) => d.isActive);
  const teamsOfDepartment = teams.filter((tm) => tm.isActive && (!departmentId || tm.departmentId === departmentId));
  const workTypes = codeEntries.filter((c) => c.kind === "workType" && c.isActive && !c.isDeleted);

  const companyHeader: CompanyHeaderInfo = {
    name: company.name, nameEn: "", logoDataUrl: company.logoDataUrl, address: company.address,
    phone: company.phone, fax: "", email: company.email, website: company.website,
    facebookName: company.facebookName, lineId: company.lineId, taxId: company.taxId,
    branchName: "", branchCode: "", stampDataUrl: company.stampDataUrl,
  };
  const filterLabel = [
    departmentId ? departments.find((d) => d.id === departmentId)?.name : t("toolControl.filter.all"),
    teamId ? teams.find((tm) => tm.id === teamId)?.name : t("toolControl.filter.allTeams"),
    workTypeCode ? workTypes.find((w) => w.code === workTypeCode)?.name ?? workTypeCode : "",
  ].filter(Boolean).join(" / ");
  const rangeLabel = from || to ? `${printDate(from)} – ${printDate(to)}` : "";

  const teamsHolding = new Set(holdings.map((h) => `${h.departmentId}|${h.teamId}`)).size;
  const piecesHeld = holdings.reduce((sum, h) => sum + h.held, 0);

  const tabKeys: Tab[] = canIssue ? ["issue", "holdings", "report"] : ["holdings", "report"];
  const tabLabel: Record<Tab, string> = {
    issue: t("toolControl.tab.issue"),
    holdings: t("toolControl.tab.holdings"),
    report: t("toolControl.tab.report"),
  };
  // จำนวนบนแท็บ = จำนวนแถวของแท็บที่เปิดอยู่ (อีกแท็บยังไม่ได้โหลด จึงไม่แสดงตัวเลข)
  const tabCount = (k: Tab) => (k === tab && !loading && !current?.error ? (k === "holdings" ? holdings.length : k === "report" ? rows.length : undefined) : undefined);

  const strong = (v: number) => <strong className="font-semibold text-foreground tabular-nums">{loading ? "…" : v.toLocaleString("th-TH")}</strong>;
  const summary = tab === "holdings" ? (
    <>{t("toolControl.summary.teams")} {strong(teamsHolding)} · {t("toolControl.summary.items")} {strong(piecesHeld)}</>
  ) : (
    <>{t("toolControl.summary.rows")} {strong(rows.length)}</>
  );

  return (
    <div className="flex-1 overflow-y-auto print:p-0 print:overflow-visible">
      <div className="px-4 md:px-8 py-6 flex flex-col gap-5 print:hidden">
        <ListPageHeader
          module={t("nav.group.inventory")}
          title={t("toolControl.title")}
          description={t("toolControl.subtitle")}
          help={<TourReplayButton variant="title" onClick={tour.start} />}
          actions={(
            <button
              type="button"
              data-tour="tool-print"
              onClick={() => setShowPrint(true)}
              disabled={loading || (tab === "holdings" ? holdings.length === 0 : rows.length === 0)}
              className={btn.secondary}
            >
              <Printer size={16} /> {t("toolControl.print")}
            </button>
          )}
        />

        <ListCard>
          <div data-tour="tool-tabs">
            <ListTabs<Tab>
              tabs={tabKeys.map((k) => ({ key: k, label: tabLabel[k], count: tabCount(k) }))}
              active={tab}
              onChange={setTab}
              ariaLabel={t("toolControl.title")}
            />
          </div>

          {tab === "issue" ? (
            <ToolIssueCard
              departments={departments}
              teams={teams}
              workTypes={workTypes}
              showToast={toast.show}
              onDone={() => setRetryToken((n) => n + 1)}
            />
          ) : (
            <>
              <div data-tour="tool-filters">
                <ListToolbar count={summary}>
                  <SelectBox aria-label={t("toolControl.filter.department")} value={departmentId} className="w-full sm:w-[180px]"
                    onChange={(e) => { setDepartmentId(e.target.value); setTeamId(""); }}>
                    <option value="">{t("toolControl.filter.all")}</option>
                    {activeDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </SelectBox>
                  <SelectBox aria-label={t("toolControl.filter.team")} value={teamId} className="w-full sm:w-[180px]"
                    onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">{t("toolControl.filter.allTeams")}</option>
                    {teamsOfDepartment.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                  </SelectBox>
                  <SelectBox aria-label={t("toolControl.filter.workType")} value={workTypeCode} className="w-full sm:w-[240px]"
                    onChange={(e) => setWorkTypeCode(e.target.value)}>
                    <option value="">{t("toolControl.filter.allWorkTypes")}</option>
                    {workTypes.map((w) => <option key={w.id} value={w.code}>{w.code} — {w.name}</option>)}
                  </SelectBox>
                  {tab === "report" && (
                    <span className="flex items-center gap-1.5">
                      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t("toolControl.filter.from")} className={`${field.input} w-[150px]`} />
                      <span className="text-[#8a97ad]" aria-hidden="true">–</span>
                      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t("toolControl.filter.to")} className={`${field.input} w-[150px]`} />
                    </span>
                  )}
                </ListToolbar>
              </div>

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status" aria-live="polite">
                  <Loader2 size={16} className="animate-spin" /> {t("toolControl.loading")}
                </div>
              ) : current?.error ? (
                <LoadErrorState message={t("toolControl.loadError")} retryLabel={t("toolControl.retry")} onRetry={() => setRetryToken((n) => n + 1)} />
              ) : tab === "holdings" ? (
                holdings.length === 0 ? (
                  <ListEmpty title={t("toolControl.empty.holdings")} hint={t("toolControl.empty.holdingsHint")} />
                ) : (
                  <div data-tour="tool-holdings" className="overflow-x-auto">
                    <table className="w-full min-w-[1000px] table-fixed">
                      <thead>
                        <tr className={table.head}>
                          <th className={`${table.th} w-[140px]`}>{t("toolControl.col.department")}</th>
                          <th className={`${table.th} w-[140px]`}>{t("toolControl.col.team")}</th>
                          <th className={table.th}>{t("toolControl.col.product")}</th>
                          <th className={`${table.th} w-[80px]`}>{t("toolControl.col.unit")}</th>
                          <th className={`${table.th} w-[88px] text-right`}>{t("toolControl.col.issued")}</th>
                          <th className={`${table.th} w-[88px] text-right`}>{t("toolControl.col.returned")}</th>
                          <th className={`${table.th} w-[88px] text-right`}>{t("toolControl.col.held")}</th>
                          <th className={`${table.th} w-[200px]`}>{t("toolControl.col.lastRequisition")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map((h) => (
                          <tr key={`${h.departmentId}|${h.teamId}|${h.productId}`} className={ROW_CLS}>
                            <td className={`${table.td} truncate ${h.departmentName ? "text-foreground" : "text-[#8a97ad]"}`}>{h.departmentName || "—"}</td>
                            <td className={`${table.td} truncate font-medium ${h.teamName ? "text-foreground" : "text-[#8a97ad]"}`}>{h.teamName || "—"}</td>
                            <td className={table.td}>
                              <span className="flex items-center gap-2.5 min-w-0">
                                <span className="font-mono text-[12.5px] font-medium text-[#3d5173] flex-shrink-0">{h.productCode}</span>
                                <span className="truncate" title={h.productName}>{h.productName}</span>
                              </span>
                            </td>
                            <td className={`${table.td} text-[#3d5173] truncate`}>{h.unit || "—"}</td>
                            <td className={`${table.td} text-right text-[#3d5173] tabular-nums`}>{h.issued.toLocaleString("th-TH")}</td>
                            <td className={`${table.td} text-right text-[#3d5173] tabular-nums`}>{h.returned.toLocaleString("th-TH")}</td>
                            <td className={`${table.td} text-right font-bold tabular-nums`}>{h.held.toLocaleString("th-TH")}</td>
                            <td className={table.td}>
                              <span className="block font-mono text-[12.5px] font-medium truncate">{h.lastSourceLabel || "—"}</span>
                              <span className="block text-xs text-muted-foreground">{formatQuoteDateThai(h.lastMovementAt)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : rows.length === 0 ? (
                <ListEmpty title={t("toolControl.empty.report")} hint={rangeLabel} />
              ) : (
                <>
                  {current?.truncated && <p className="px-5 pt-3 text-xs text-[#8a5a00]">{t("toolControl.truncated")}</p>}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px] table-fixed">
                      <thead>
                        <tr className={table.head}>
                          <th className={`${table.th} w-[110px]`}>{t("toolControl.col.date")}</th>
                          <th className={`${table.th} w-[150px]`}>{t("toolControl.col.requisition")}</th>
                          <th className={`${table.th} w-[110px]`}>{t("toolControl.col.department")}</th>
                          <th className={`${table.th} w-[110px]`}>{t("toolControl.col.team")}</th>
                          <th className={`${table.th} w-[170px]`}>{t("toolControl.col.workType")}</th>
                          <th className={table.th}>{t("toolControl.col.product")}</th>
                          <th className={`${table.th} w-[80px]`}>{t("toolControl.col.kind")}</th>
                          <th className={`${table.th} w-[104px] text-right`}>{t("toolControl.col.qty")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} className={ROW_CLS}>
                            <td className={`${table.td} text-[#3d5173] whitespace-nowrap`}>{formatQuoteDateThai(r.createdAt)}</td>
                            <td className={`${table.td} font-mono text-[12.5px] font-medium truncate`}>{r.sourceLabel || "—"}</td>
                            <td className={`${table.td} text-[#3d5173] truncate`}>{r.departmentName || "—"}</td>
                            <td className={`${table.td} font-medium truncate`}>{r.teamName || "—"}</td>
                            <td className={`${table.td} truncate ${r.workTypeName ? "text-[#3d5173]" : "text-[#8a97ad]"}`} title={r.workTypeName}>{r.workTypeName || "—"}</td>
                            <td className={table.td}>
                              <span className="flex items-center gap-2.5 min-w-0">
                                <span className="font-mono text-[12.5px] font-medium text-[#3d5173] flex-shrink-0">{r.productCode}</span>
                                <span className="truncate" title={r.productName}>{r.productName}</span>
                              </span>
                            </td>
                            <td className={table.td}>
                              <Pill tone={r.qty > 0 ? "amber" : "green"}>{t(r.qty > 0 ? "toolControl.kind.issue" : "toolControl.kind.return")}</Pill>
                            </td>
                            <td className={`${table.td} text-right font-semibold tabular-nums whitespace-nowrap`}>
                              {Math.abs(r.qty).toLocaleString("th-TH")} <span className="text-[13px] font-normal text-muted-foreground">{r.unit}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </ListCard>
      </div>

      {/* ใบพิมพ์อยู่ใน DOM ตลอด (Ctrl+P ได้ใบเดียวกับปุ่ม) — พิมพ์ตามแท็บและตัวกรองที่เปิดอยู่
          แท็บจ่าย/คืนไม่มีอะไรให้พิมพ์ จึงพิมพ์ยอดถือครองแทน */}
      <ToolReportPrintDocument
        mode={tab === "report" ? "report" : "holdings"}
        holdings={holdings}
        rows={rows}
        companyHeader={companyHeader}
        printedAt={today()}
        filterLabel={filterLabel}
        rangeLabel={rangeLabel}
      />
      <Toast message={toast.message} />
    </div>
  );
}
