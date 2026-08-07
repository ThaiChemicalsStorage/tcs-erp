import type { ServiceReport } from "../../lib/serviceReports";
import type { CompanyHeaderInfo } from "../../lib/storage";
import type { User } from "../../lib/users";
import { formatQuoteDateThai as fmtThaiDate } from "../../lib/quotes";
import { BrandMark } from "../../components/BrandMark";
import { FacebookIcon, LineAppIcon } from "../../components/PrintSocialIcons";

/**
 * Printable Service Report (added 2026-08-06, pulled forward from the Phase 3 roadmap per direct
 * user request). Same technique as ScopeOfWorkPrintDocument.tsx/DeliveryOrderPrintDocument.tsx:
 * a `hidden print:table` full-width table with `@media print { @page { margin: 0 } }` to suppress
 * the browser's own date/URL/title header-footer, compensating with padding instead (repeats every
 * page via `<thead>`/table padding). No PDF library exists in this app — this is browser-native
 * print CSS, per DESIGN.md's "formal print documents use the reference-form look, not the
 * navy/gold app chrome" rule.
 *
 * Canonical per-item detail layout ("SERVICE ITEM n" blue-bar block) follows the real Oil Mist
 * Filter report reference (`public/Report Oil Mist Filter M - ...pdf`); the report-info field set
 * reconciles that reference with the Phayont Marine reference's field labels — see
 * docs/MODULES/Service.md for the full PDF-to-field mapping.
 */

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-[10px] leading-[1.7]">
      <span className="text-[#5a7299] flex-shrink-0 w-[100px]">{label}</span>
      <span className={`flex-1 border-b border-dotted border-[#0b1d3a]/25 min-h-[13px] ${mono ? "font-mono" : ""}`}>{value || " "}</span>
    </div>
  );
}

/** Print-safe checkbox cell — a filled/outline square rather than color alone, so the ปกติ/ผิดปกติ
 * distinction survives a black-and-white printer. Two independent cells (not one combined mark),
 * matching the paper reference form's (public/รายการตรวจเช็ค.pdf) two-column checkbox layout. */
function PrintCheckboxCell({ active, variant }: { active: boolean; variant: "normal" | "abnormal" }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-3 h-3 border leading-none ${
        active ? "border-[#0b1d3a] bg-[#0b1d3a] text-white" : "border-[#0b1d3a]/40 text-transparent"
      }`}
    >
      <span className="text-[7px] font-bold">{variant === "normal" ? "✓" : "✕"}</span>
    </span>
  );
}

function photoGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  return "grid-cols-2";
}

export function ServiceReportPrintDocument({ serviceReport, companyHeader, engineerUser }: {
  serviceReport: ServiceReport;
  companyHeader: CompanyHeaderInfo;
  engineerUser?: User;
}) {
  const r = serviceReport;
  const abnormalItems: { sectionTitle: string; groupTitle: string; label: string; abnormalDetail: string; photos: typeof r.checklist[number]["groups"][number]["items"][number]["photos"] }[] = [];
  for (const section of r.templateSnapshot.sections) {
    const sectionValue = r.checklist.find((s) => s.key === section.key);
    if (section.isOptionalAddon && !(sectionValue?.included ?? false)) continue;
    for (const group of section.groups) {
      const groupValue = sectionValue?.groups.find((g) => g.key === group.key);
      for (const item of group.items) {
        const itemValue = groupValue?.items.find((it) => it.key === item.key);
        if (itemValue?.status === "abnormal") {
          abnormalItems.push({ sectionTitle: section.title, groupTitle: group.title, label: item.label, abnormalDetail: itemValue.abnormalDetail, photos: itemValue.photos ?? [] });
        }
      }
    }
  }
  let serviceItemNumber = 0;

  return (
    <>
      <style>{"@media print { @page { margin: 0 } }"}</style>
      <table className="hidden print:table w-full border-collapse text-[#0b1d3a]" style={{ fontSize: "10.5px", padding: "0 12mm" }}>
        <colgroup>
          <col style={{ width: "50%" }} />
          <col style={{ width: "50%" }} />
        </colgroup>
        <thead>
          <tr>
            <td colSpan={2} className="pt-[12mm] px-0 pb-0">
              <div className="flex items-start gap-3 mb-2">
                {companyHeader.logoDataUrl ? (
                  <img src={companyHeader.logoDataUrl} alt={companyHeader.name} className="w-11 h-11 rounded-full object-contain border border-[#0b1d3a]/15 bg-white p-0.5 flex-shrink-0" />
                ) : (
                  <BrandMark size={44} variant="mark" theme="dark" className="flex-shrink-0" />
                )}
                <div>
                  <p className="font-bold text-[12px]">{companyHeader.name}</p>
                  {companyHeader.address.trim() && <p className="text-[9.5px] text-[#5a7299] leading-snug">{companyHeader.address}</p>}
                  {(companyHeader.phone.trim() || companyHeader.email.trim()) && (
                    <p className="text-[9.5px] text-[#5a7299]">
                      {companyHeader.phone.trim() && <>โทรศัพท์ : {companyHeader.phone}</>}
                      {companyHeader.phone.trim() && companyHeader.email.trim() && "  "}
                      {companyHeader.email.trim() && <>E-mail : {companyHeader.email}</>}
                    </p>
                  )}
                  {(companyHeader.facebookName.trim() || companyHeader.lineId.trim() || companyHeader.website.trim()) && (
                    <div className="flex items-center gap-1.5 text-[9.5px] text-[#5a7299] mt-0.5">
                      {companyHeader.facebookName.trim() && <span className="flex items-center gap-1"><FacebookIcon size={10} /> {companyHeader.facebookName}</span>}
                      {companyHeader.lineId.trim() && <span className="flex items-center gap-1"><LineAppIcon size={10} /> {companyHeader.lineId}</span>}
                      {companyHeader.website.trim() && <span>{companyHeader.website}</span>}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-center font-bold text-[15px] tracking-widest pb-2 mb-2 border-b-2 border-[#0b1d3a]" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>
                SERVICE REPORT / รายงานสรุปงานบริการ
              </p>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-3">
                <div className="space-y-1">
                  <Field label="Report No." value={r.id} mono />
                  <Field label="ลูกค้า / โรงงาน" value={r.customerSnapshot.companyName} />
                  <Field label="สถานที่" value={r.serviceLocation} />
                  <Field label="ระบบที่ Service" value={r.serviceSystemName} />
                  <Field label="ผู้เข้าตรวจสอบ" value={[engineerUser?.fullName, ...r.additionalInspectorNames].filter(Boolean).join(", ")} />
                </div>
                <div className="space-y-1">
                  <Field label="วันที่เข้า Service" value={fmtThaiDate(r.inspectionDate)} />
                  <Field label="วันที่ออกรายงาน" value={fmtThaiDate(r.reportDate)} />
                  <Field label="ผู้ติดต่อหน้างาน" value={[r.onSiteContactName, r.onSiteContactPhone].filter(Boolean).join(" · ")} />
                  <Field label="อ้างอิงโปรเจกต์" value={r.projectOrJobCode} mono />
                  <Field label="รอบ PM ถัดไป" value={r.nextPmDate ? fmtThaiDate(r.nextPmDate) : ""} />
                </div>
              </div>
            </td>
          </tr>
          {r.overallCustomerSummary.trim() && (
            <tr>
              <td colSpan={2} className="pb-2">
                <div className="bg-[#1a3a6b] text-white px-2 py-1 text-[10.5px] font-semibold mb-1">สรุปภาพรวมสำหรับลูกค้า</div>
                <p className="text-[10px] whitespace-pre-line leading-relaxed px-0.5">{r.overallCustomerSummary}</p>
              </td>
            </tr>
          )}
          <tr className="bg-[#1a5fb4] text-white">
            <th colSpan={2} className="px-2 py-1.5 text-[10px] font-semibold text-left">รายการตรวจเช็ค / Inspection Checklist</th>
          </tr>
        </thead>
        {r.templateSnapshot.sections.map((section) => {
            const sectionValue = r.checklist.find((s) => s.key === section.key);
            if (section.isOptionalAddon && !(sectionValue?.included ?? false)) return null;
            return (
              <tbody key={section.key} style={{ breakInside: "avoid" }}>
                <tr><td colSpan={2} className="px-2 pt-2 pb-0.5 font-bold text-[10.5px] border-b border-[#0b1d3a]/20">{section.title}</td></tr>
                {section.groups.map((group) => {
                  const groupValue = sectionValue?.groups.find((g) => g.key === group.key);
                  return (
                    <tr key={group.key}>
                      <td colSpan={2} className="px-2 pb-1.5">
                        <table className="w-full border-collapse mt-1">
                          <colgroup>
                            <col />
                            <col style={{ width: "9mm" }} />
                            <col style={{ width: "9mm" }} />
                          </colgroup>
                          <thead>
                            <tr className="border-b border-[#0b1d3a]/30">
                              <th className="text-left py-0.5 pr-2 text-[9.5px] font-semibold text-[#5a7299]">{group.title}</th>
                              <th className="text-center py-0.5 text-[8px] font-semibold text-[#5a7299]">ปกติ</th>
                              <th className="text-center py-0.5 text-[8px] font-semibold text-[#5a7299]">ผิดปกติ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item) => {
                              const itemValue = groupValue?.items.find((it) => it.key === item.key);
                              return (
                                <tr key={item.key} className="border-b border-[#0b1d3a]/10">
                                  <td className="py-1 pr-2 text-[9.5px] leading-[1.4]">
                                    {/* Same display-only dash as the on-screen checklist
                                        (ServiceChecklistItemControl.tsx) — never stored in the
                                        label. Uses this document's own literal ink color and a
                                        tighter margin rather than the app's design tokens, per the
                                        print-document convention. */}
                                    <span className="text-[#5a7299] mr-1" aria-hidden="true">-</span>
                                    {item.label}
                                    {item.kind === "measurement" && item.unit && <span className="text-[#5a7299]"> ({item.unit})</span>}
                                  </td>
                                  {item.kind === "measurement" ? (
                                    <td colSpan={2} className="py-1 text-[9.5px] font-mono text-center text-[#5a7299]">{itemValue?.measurementValue || "-"}</td>
                                  ) : (
                                    <>
                                      <td className="py-1 text-center"><PrintCheckboxCell active={itemValue?.status === "normal"} variant="normal" /></td>
                                      <td className="py-1 text-center"><PrintCheckboxCell active={itemValue?.status === "abnormal"} variant="abnormal" /></td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}

        <tbody>
          {abnormalItems.map((it) => {
            serviceItemNumber += 1;
            return (
              <tr key={`${it.sectionTitle}-${it.groupTitle}-${it.label}-${serviceItemNumber}`} style={{ breakInside: "avoid" }}>
                <td colSpan={2} className="pb-3">
                  {/* Heading lives inside the first item's cell (not its own row) so breakInside:avoid
                      can never strand it alone at the bottom of a page while the item jumps to the next. */}
                  {serviceItemNumber === 1 && (
                    <p className="text-[10.5px] font-bold pt-3 pb-1.5">รายละเอียดรายการที่พบความผิดปกติ / Abnormal Findings</p>
                  )}
                  <div className="bg-[#1a3a6b] text-white px-2 py-1 text-[10px] font-semibold">SERVICE ITEM {serviceItemNumber} / {it.label}</div>
                  <div className="border border-[#0b1d3a]/20 border-t-0 px-2 py-2 space-y-1.5">
                    <p className="text-[9.5px]"><span className="text-[#5a7299]">หมวด: </span>{it.sectionTitle} — {it.groupTitle}</p>
                    <p className="text-[9.5px] whitespace-pre-line"><span className="font-semibold">ผลการตรวจ / สิ่งที่พบ: </span>{it.abnormalDetail}</p>
                    {it.photos.length > 0 && (
                      <div className={`grid ${photoGridClass(it.photos.length)} gap-1.5 pt-1`}>
                        {it.photos.map((p) => (
                          <img key={p.id} src={p.url} alt={p.fileName} className="w-full h-[42mm] object-cover border border-[#0b1d3a]/15" style={{ breakInside: "avoid" }} />
                        ))}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {r.overallRemark.trim() && (
            <tr>
              <td colSpan={2} className="pt-4">
                <p className="text-[10.5px] font-semibold mb-1">หมายเหตุ</p>
                <p className="text-[10px] whitespace-pre-line leading-relaxed">{r.overallRemark}</p>
              </td>
            </tr>
          )}

          <tr>
            <td colSpan={2} className="pt-5 pb-[12mm]" style={{ breakInside: "avoid" }}>
              <table className="w-full border-collapse border border-[#0b1d3a]/20">
                <thead>
                  <tr className="bg-[#1a5fb4] text-white">
                    <th className="px-2 py-1 text-[10px] font-semibold border-r border-white/20">ผู้ตรวจสอบ / Service Engineer</th>
                    <th className="px-2 py-1 text-[10px] font-semibold">ผู้รับทราบ / Customer</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 align-bottom h-20 relative border-r border-[#0b1d3a]/20">
                      <div className="h-10 flex items-end justify-center">
                        {engineerUser?.signatureDataUrl && <img src={engineerUser.signatureDataUrl} alt="" className="max-h-9 max-w-[80%] object-contain" />}
                      </div>
                      <div className="border-t border-[#0b1d3a]/30 mt-1 pt-1 text-center">
                        <p className="text-[10px]">{engineerUser?.fullName || " "}</p>
                        <p className="text-[9px] text-[#5a7299]">{fmtThaiDate(r.reportDate) || "..... / ..... / ....."}</p>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-bottom h-20 relative">
                      {/* Mirrors the engineer column exactly. An unsigned report still prints the
                          blank ruled lines it always did, so it stays usable as a paper sign-off
                          sheet when the customer wasn't on site (signing is optional by design). */}
                      <div className="h-10 flex items-end justify-center">
                        {r.customerSignatureDataUrl && <img src={r.customerSignatureDataUrl} alt="" className="max-h-9 max-w-[80%] object-contain" />}
                      </div>
                      <div className="border-t border-[#0b1d3a]/30 mt-1 pt-1 text-center">
                        <p className="text-[10px]">{r.customerSignedName || " "}</p>
                        <p className="text-[9px] text-[#5a7299]">
                          {(r.customerSignedAt && fmtThaiDate(r.customerSignedAt.slice(0, 10))) || "..... / ..... / ....."}
                        </p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}
