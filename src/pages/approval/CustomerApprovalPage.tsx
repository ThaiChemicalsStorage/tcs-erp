import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from "lucide-react";
import { SignaturePad } from "../../components/SignaturePad";
import {
  fetchCustomerApprovalPublic, respondCustomerApprovalPublic,
  type CustomerApprovalPublicData,
} from "../../lib/serviceReports";
import { ApiError } from "../../lib/apiClient";
import { btn, field } from "../../components/ui/styles";

/**
 * Public customer-approval page (added 2026-08-10) — rendered WITHOUT the app shell or a session:
 * `src/main.tsx` branches here for the `/approve` path before the auth gate ever runs. The
 * capability key in the URL is the entire authorization (see
 * api/_lib/serviceReportHandler.ts "Customer approval"). Thai-only on purpose, like the printed
 * documents — the reader is the customer, not an ERP user with a language preference.
 * Mobile-first: the link usually arrives in LINE and opens on a phone.
 */
export default function CustomerApprovalPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const reportId = params.get("report") ?? "";
  const key = params.get("key") ?? "";

  // ลิงก์ที่ไม่มีพารามิเตอร์ครบเป็นสถานะที่รู้ได้ตั้งแต่ render แรก — ไม่ต้องผ่าน effect
  const linkMissing = !reportId || !key;
  const [data, setData] = useState<CustomerApprovalPublicData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(!linkMissing);

  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [signature, setSignature] = useState<{ dataUrl: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectName, setRejectName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (linkMissing) return;
    fetchCustomerApprovalPublic(reportId, key)
      .then(setData)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "ไม่พบลิงก์อนุมัติ หรือลิงก์ถูกยกเลิกแล้ว"))
      .finally(() => setLoading(false));
  }, [reportId, key, linkMissing]);

  const submit = async (payload: Parameters<typeof respondCustomerApprovalPublic>[2]) => {
    setSubmitting(true);
    setSubmitError("");
    try {
      setData(await respondCustomerApprovalPublic(reportId, key, payload));
      setMode("idle");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "ส่งคำตอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 size={16} className="animate-spin" /> กำลังโหลดเอกสาร...</div>
      </div>
    );
  }
  if (linkMissing || loadError || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="bg-card border border-border rounded-xl p-6 max-w-sm flex flex-col items-center gap-3 text-center" role="alert">
          <span className="w-11 h-11 rounded-full bg-[#fdf3e0] text-[#8a5a00] flex items-center justify-center"><AlertTriangle size={20} /></span>
          <p className="text-sm text-foreground">{linkMissing ? "ลิงก์ไม่ถูกต้อง กรุณาติดต่อเจ้าหน้าที่" : loadError || "ไม่พบลิงก์อนุมัติ"}</p>
        </div>
      </div>
    );
  }

  const { report, approval, companyName, companyLogoDataUrl } = data;
  const pending = approval.status === "pending" && !approval.expired;
  const sectionHead = "px-5 py-4 border-b border-[#eef1f6]";
  const sectionTitle = "text-base font-semibold text-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      {/* หัวหน้า: แบรนด์บริษัทผู้ออกรายงาน (บอร์ด CustomerApproval) — ยังเป็นหน้าแบบมือถือก่อน ตามที่เจ้าของเลือก */}
      <header className="bg-[#0b1d3a] px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3.5 flex-wrap">
          {companyLogoDataUrl && <img src={companyLogoDataUrl} alt={companyName || "TCS ERP"} className="h-11 w-11 object-contain rounded-full bg-white p-0.5 flex-shrink-0" />}
          <div className="flex-1 min-w-0 flex flex-col leading-snug">
            <p className="text-[#e3c56f] text-[12.5px] font-semibold truncate">{companyName || "TCS ERP"}</p>
            <h1 className="text-white text-lg font-semibold">รายงานบริการ <span className="font-mono font-medium">{report.id}</span></h1>
          </div>
          {pending && (
            <span className="text-[13px] text-[#c5d3e8] inline-flex items-center gap-2">
              <Clock size={15} /> ลิงก์ใช้ได้ถึง {approval.expiresAt.slice(0, 10)}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-5 mt-5 flex flex-col gap-4">
        {/* สถานะปัจจุบันของการอนุมัติ */}
        {approval.status === "approved" && (
          <section className="bg-card border border-[#b5dcc6] rounded-xl px-5 py-5 flex items-start gap-3" role="status">
            <span className="w-11 h-11 rounded-full bg-[#e6f4ec] text-[#1b7f4f] flex items-center justify-center flex-shrink-0"><CheckCircle2 size={20} /></span>
            <p className="text-[15px] font-semibold text-[#1b7f4f] pt-2">อนุมัติรายงานนี้เรียบร้อยแล้ว{approval.signedName ? ` โดย ${approval.signedName}` : ""} — ขอบคุณครับ</p>
          </section>
        )}
        {approval.status === "rejected" && (
          <section className="bg-card border border-[#f0c2c2] rounded-xl px-5 py-5 flex items-start gap-3" role="status">
            <span className="w-11 h-11 rounded-full bg-[#fcebeb] text-[#b93636] flex items-center justify-center flex-shrink-0"><XCircle size={20} /></span>
            <p className="text-[15px] font-semibold text-[#b93636] pt-2">ท่านแจ้งไม่อนุมัติรายงานนี้แล้ว — เจ้าหน้าที่ได้รับเหตุผลของท่านและจะติดต่อกลับ</p>
          </section>
        )}
        {approval.status === "pending" && approval.expired && (
          <section className="bg-[#fdf3e0] border border-[#f0d9a8] rounded-xl p-4 flex items-start gap-2.5" role="alert">
            <Clock size={18} className="text-[#8a5a00] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#8a5a00]">ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่</p>
          </section>
        )}

        {/* ข้อมูลงาน */}
        <section className="bg-card border border-border rounded-xl">
          <div className={sectionHead}><h2 className={sectionTitle}>ข้อมูลงานบริการ</h2></div>
          <dl className="px-5 pt-4 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
            {/* Field order matches the editor form (ServiceReportEditor.tsx) so the same record
                reads the same way to the engineer who filled it in and the customer who receives
                it. Empty values drop out — most of these are optional, and a customer-facing page
                should never show a labelled blank. `mono` marks a value meant to be read
                character-by-character rather than as prose (DESIGN.md, Numbers/Codes); the printed
                Service Report renders อ้างอิงโปรเจกต์ the same way. */}
            {([
              ["ชื่อบริษัท", report.customerSnapshot.companyName],
              ["ผู้ติดต่อ", report.customerSnapshot.contactName],
              ["สถานที่ให้บริการ", report.serviceLocation],
              // The customer's own reference for this job — often the only thing that ties our
              // SR number to a PO/project on their side, so it is worth the row even though the
              // field is optional in the editor.
              ["อ้างอิงโปรเจกต์/รหัสงาน", report.projectOrJobCode, "mono"],
              ["ระบบที่ให้บริการ", report.serviceSystemName],
              ["ประเภทบริการ", report.serviceType],
              ["วันที่เข้าบริการ", report.inspectionDate],
              ["วันที่ออกรายงาน", report.reportDate],
              ["ผู้เข้าตรวจสอบ", [report.engineerName, ...report.additionalInspectorNames].filter(Boolean).join(", ")],
            ] as [string, string, "mono"?][]).filter(([, v]) => v).map(([label, value, mono]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={`text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ผลการตรวจเช็ค */}
        <section className="bg-card border border-border rounded-xl">
          <div className={sectionHead}><h2 className={sectionTitle}>ผลการตรวจเช็ค</h2></div>
          <div className="px-5 pt-4 pb-5 flex flex-col gap-5">
            {report.templateSnapshot.sections.map((section) => {
              const sectionValue = report.checklist.find((s) => s.key === section.key);
              if (section.isOptionalAddon && !(sectionValue?.included ?? false)) return null;
              return (
                <div key={section.key} className="flex flex-col gap-2.5">
                  <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="h-9 px-3.5 bg-[#f8f9fc] border-b border-border flex items-center text-[12.5px] font-semibold text-[#3d5173]">
                      <span className="flex-1">รายการตรวจ</span>
                      <span className="text-right">ผล</span>
                    </div>
                    <div className="divide-y divide-[#eef1f6]">
                      {section.groups.map((group) => {
                        const groupValue = sectionValue?.groups.find((g) => g.key === group.key);
                        return group.items.map((item) => {
                          const value = groupValue?.items.find((it) => it.key === item.key);
                          const status = value?.status ?? "not_selected";
                          return (
                            <div key={`${group.key}-${item.key}`} className="px-3.5 py-2.5 text-sm flex flex-col gap-1">
                              <div className="flex items-start justify-between gap-3">
                                <span className="text-foreground pt-0.5">{group.title !== item.label ? `${group.title} — ${item.label}` : item.label}</span>
                                {item.kind === "measurement" ? (
                                  <span className="font-mono text-[13px] font-medium text-foreground whitespace-nowrap pt-0.5">{value?.measurementValue || "-"}</span>
                                ) : status === "normal" ? (
                                  <span className="h-[26px] px-2.5 rounded-full bg-[#e6f4ec] text-[#1b7f4f] text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#1b7f4f]" />ปกติ</span>
                                ) : status === "abnormal" ? (
                                  <span className="h-[26px] px-2.5 rounded-full bg-[#fcebeb] text-[#b93636] text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"><span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[#b93636]" />ผิดปกติ</span>
                                ) : (
                                  <span className="text-muted-foreground text-xs whitespace-nowrap pt-0.5">-</span>
                                )}
                              </div>
                              {/* รายละเอียด/รูป แสดงทุกสถานะ ไม่ใช่เฉพาะ "ผิดปกติ" — ช่างแนบรูปกับรายการที่
                                  ติ๊ก "ปกติ" ได้ ถ้ากรองด้วย status ลูกค้าจะไม่มีวันเห็นรูปพวกนั้นเลย */}
                              {value?.abnormalDetail && (
                                <p className={`text-[13px] ${status === "abnormal" ? "text-[#b93636]" : "text-muted-foreground"}`}>{value.abnormalDetail}</p>
                              )}
                              {(value?.photos ?? []).length > 0 && (
                                <div className="grid grid-cols-3 gap-2 mt-1">
                                  {value!.photos.map((p) => (
                                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" aria-label={`เปิดรูป ${p.fileName}`}>
                                      {/* object-contain ไม่ใช่ cover — รูปถ่ายหน้างานส่วนใหญ่เป็นแนวตั้ง
                                          พอ cover ลงกรอบเตี้ยกว้าง หัวกับท้ายรูปจะโดนเฉือนทิ้ง */}
                                      <img src={p.url} alt={p.fileName} loading="lazy" className="rounded-lg border border-border w-full h-20 object-contain bg-[#eef1f6]" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {(report.overallCustomerSummary || report.overallRemark) && (
          <section className="bg-card border border-border rounded-xl px-5 py-5 flex flex-col gap-4">
            {report.overallCustomerSummary && (
              <div className="flex flex-col gap-1">
                <h2 className="text-xs text-muted-foreground">สรุปภาพรวมการให้บริการ</h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.overallCustomerSummary}</p>
              </div>
            )}
            {report.overallCustomerSummary && report.overallRemark && <div className="h-px bg-[#eef1f6]" />}
            {report.overallRemark && (
              <div className="flex flex-col gap-1">
                <h2 className="text-xs text-muted-foreground">หมายเหตุ</h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.overallRemark}</p>
              </div>
            )}
          </section>
        )}

        {/* ส่วนตอบรับ */}
        {pending && (
          <section className="bg-card border border-border rounded-xl flex flex-col">
            <div className={`${sectionHead} flex flex-col gap-1`}>
              <h2 className="text-[15px] font-semibold">{mode === "reject" ? "ไม่อนุมัติ / แจ้งแก้ไข" : "การอนุมัติรายงาน"}</h2>
              <p className="text-[13px] text-[#3d5173]">กรุณาตรวจสอบรายงานด้านบน แล้วลงลายเซ็นเพื่ออนุมัติ หรือแจ้งเหตุผลหากไม่อนุมัติ (ลิงก์ใช้ได้ถึง {approval.expiresAt.slice(0, 10)})</p>
            </div>

            {mode === "idle" && (
              <>
                <div className="px-5 py-5 flex flex-col gap-4">
                  <SignaturePad
                    dataUrl={signature?.dataUrl ?? ""}
                    signerName={signature?.name ?? report.customerSnapshot.contactName}
                    signedAt={null}
                    allowUpload={false}
                    onConfirm={(sig) => setSignature(sig)}
                    onClear={() => setSignature(null)}
                  />
                  {submitError && <p role="alert" className={field.error}>{submitError}</p>}
                </div>
                <div className="px-5 pt-4 pb-5 border-t border-[#eef1f6] flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => signature && submit({ decision: "approved", signatureDataUrl: signature.dataUrl, signedName: signature.name })}
                    disabled={!signature || submitting}
                    aria-describedby={!signature ? "approve-why" : undefined}
                    className={`${btn.primary} w-full`}
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} อนุมัติรายงาน
                  </button>
                  {!signature && <p id="approve-why" className={field.help}>ลงลายเซ็นและกด "ยืนยันลายเซ็น" ก่อน จึงจะกดอนุมัติได้</p>}
                  <button
                    type="button"
                    onClick={() => { setMode("reject"); setSubmitError(""); }}
                    disabled={submitting}
                    className={`${btn.secondary} w-full`}
                  >
                    ไม่อนุมัติ / แจ้งแก้ไข
                  </button>
                </div>
              </>
            )}

            {mode === "reject" && (
              <>
                <div className="px-5 py-5 flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="reject-name" className={field.label}>ชื่อผู้แจ้ง</label>
                    <input
                      id="reject-name" type="text" value={rejectName}
                      onChange={(e) => setRejectName(e.target.value)}
                      placeholder={report.customerSnapshot.contactName || "ชื่อ-นามสกุล"}
                      className={`${field.input} w-full`}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="reject-reason" className={field.label}>เหตุผลที่ไม่อนุมัติ / สิ่งที่ต้องแก้ไข <span className="text-[#b93636]">*</span></label>
                    <textarea
                      id="reject-reason" rows={4} value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className={`${field.textarea} w-full resize-y`}
                    />
                  </div>
                  {submitError && <p role="alert" className={field.error}>{submitError}</p>}
                </div>
                <div className="px-5 py-4 border-t border-[#eef1f6] flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMode("idle")}
                    disabled={submitting}
                    className={btn.secondary}
                  >
                    ย้อนกลับ
                  </button>
                  <button
                    type="button"
                    onClick={() => submit({ decision: "rejected", rejectReason, signedName: rejectName.trim() || report.customerSnapshot.contactName })}
                    disabled={!rejectReason.trim() || submitting}
                    className={btn.danger}
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />} ยืนยันไม่อนุมัติ
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2">เอกสารนี้ออกโดยระบบ {companyName || "TCS ERP"} — หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่ที่ดูแลงานของท่าน</p>
      </main>
    </div>
  );
}
