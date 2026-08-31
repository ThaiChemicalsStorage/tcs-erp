import type { Quote, QuoteLine, DiscountMode } from "./quotes";
import type { ScopeOfWork, ScopeOfWorkItem, ScopeOfWorkPaymentConditions } from "./scopeOfWork";
import { formatPaymentMethod, scopePoNumbers, scopeQuotationNumbers } from "./scopeOfWork";
import type { ChecklistGroup } from "./documentRequirements";
import { ADDITIONAL_RECIPIENT_KEY, ADDITIONAL_RECIPIENT_LABEL, DOCUMENT_RECIPIENT_DEPARTMENTS } from "./documentRequirements";
import type { User } from "./users";

// ตัดส่วนท้าย -R<เลข> ของรหัสเอกสารออก เพื่อหารหัสต้นฉบับ
// Strips a trailing -R<digits> revision suffix to get the original document id
export function getRevisionRoot(id: string): string {
  return id.replace(/-R\d+$/, "");
}

// หาลำดับเลขรีวิชันจากรหัสเอกสาร (0 หากเป็นต้นฉบับ ไม่เคยถูกแก้ไขใหม่)
// Extracts the revision number from a document id (0 for an original record)
export function getRevisionNumber(id: string): number {
  const match = id.match(/-R(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// หารหัสของเอกสารต้นฉบับที่ถูกใช้สร้างรีวิชันนี้ (null หากไม่ใช่รีวิชัน)
// Returns the id of the record this revision was rewritten from (null if not a revision)
export function getRevisionPredecessorId(id: string): string | null {
  const n = getRevisionNumber(id);
  if (n === 0) return null;
  const root = getRevisionRoot(id);
  return n === 1 ? root : `${root}-R${n - 1}`;
}

// เปรียบเทียบข้อความเก่ากับใหม่ คืนบรรทัดสรุปหากต่างกัน
// Compares old vs new text, returning a summary line if they differ
function diffText(label: string, oldVal: string, newVal: string): string | null {
  if (oldVal === newVal) return null;
  return `${label}: "${oldVal.trim() || "(ว่าง)"}" → "${newVal.trim() || "(ว่าง)"}"`;
}
// เปรียบเทียบตัวเลขเก่ากับใหม่ คืนบรรทัดสรุปหากต่างกัน
// Compares old vs new numbers, returning a summary line if they differ
function diffNumber(label: string, oldVal: number, newVal: number, fmt: (n: number) => string = (n) => n.toLocaleString("th-TH")): string | null {
  if (oldVal === newVal) return null;
  return `${label}: ${fmt(oldVal)} → ${fmt(newVal)}`;
}
// เปรียบเทียบค่าบูลีนเก่ากับใหม่ คืนบรรทัดสรุปหากต่างกัน
// Compares old vs new booleans, returning a summary line if they differ
function diffBool(label: string, oldVal: boolean, newVal: boolean): string | null {
  if (oldVal === newVal) return null;
  return `${label}: ${oldVal ? "ใช่" : "ไม่ใช่"} → ${newVal ? "ใช่" : "ไม่ใช่"}`;
}
// เพิ่มค่าเข้าไปในลิสต์ผลลัพธ์ถ้าไม่ใช่ null
// Pushes a value onto the results list if it isn't null
function push(out: string[], v: string | null): void {
  if (v) out.push(v);
}
// รวมรายการความเปลี่ยนแปลงเป็นข้อความบูลเล็ต หรือข้อความ "ไม่มีการเปลี่ยนแปลง" หากว่าง
// Joins the diff list into bullet points, or a "no changes" message if empty
function joinOrNone(out: string[]): string {
  return out.length > 0 ? out.map((s) => `• ${s}`).join("\n") : "ไม่มีการเปลี่ยนแปลงจากต้นฉบับ";
}

// ต่อสรุปการแก้ไขของรีวิชันนี้ (เช่น "R2 - ...") เข้ากับประวัติของรีวิชันก่อนหน้า
// (revisionNote ของต้นฉบับ ซึ่งมี "R1 - ..." อยู่แล้วถ้าต้นฉบับเองก็เป็นรีวิชัน) เพื่อให้ได้
// รายการสะสม "R1 - ...", "R2 - ..." ต่อกันไปเรื่อย ๆ ทุกครั้งที่กดสร้างสรุปอัตโนมัติ
// Appends this revision's diff summary (e.g. "R2 - ...") onto the predecessor's revisionNote
// (which already contains "R1 - ..." if the predecessor is itself a revision), producing an
// accumulating "R1 - ...", "R2 - ..." history each time the auto-summary button is pressed.
export function appendRevisionNoteEntry(predecessorRevisionNote: string, revisionNumber: number, summary: string): string {
  const entry = `R${revisionNumber} - ${summary}`;
  return predecessorRevisionNote.trim() ? `${predecessorRevisionNote}\n\n${entry}` : entry;
}

// ป้ายหน่วยของส่วนลดที่ใช้ในข้อความสรุป — ไม่ระบุ = เปอร์เซ็นต์ (ข้อมูลก่อน 2026-08-25)
// The discount unit as it reads in a summary line. An absent mode is percent, matching every
// quotation written before the 2026-08-25 baht-discount option.
function discountUnit(mode: DiscountMode | undefined): string {
  return mode === "amount" ? "บาท" : "%";
}

// เปรียบเทียบรายการสินค้าของใบเสนอราคาเก่ากับใหม่ทีละตำแหน่ง
// Compares old vs new quote line items by array position
function diffQuoteLines(oldLines: QuoteLine[], newLines: QuoteLine[]): string[] {
  const out: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o && !n) { out.push(`ลบรายการที่ ${i + 1}: "${o.description || "(ไม่มีชื่อ)"}"`); continue; }
    if (!o && n) { out.push(`เพิ่มรายการที่ ${i + 1}: "${n.description || "(ไม่มีชื่อ)"}"`); continue; }
    if (!o || !n) continue;
    const label = `รายการที่ ${i + 1} "${n.description || o.description || "-"}"`;
    push(out, diffText(`${label} — ชื่อ`, o.description, n.description));
    push(out, diffText(`${label} — หน่วย`, o.unit, n.unit));
    push(out, diffNumber(`${label} — จำนวน`, o.qty, n.qty));
    push(out, diffNumber(`${label} — ราคาต่อหน่วย`, o.unitPrice, n.unitPrice));
    push(out, diffNumber(`${label} — ส่วนลด (${discountUnit(o.discountMode)})`, o.discount, n.discount));
    push(out, diffText(`${label} — หน่วยส่วนลด`, discountUnit(o.discountMode), discountUnit(n.discountMode)));
  }
  return out;
}

export type QuoteRevisionDiffInput = Pick<
  Quote,
  | "client" | "project" | "address" | "taxId" | "contactName" | "contactPhone" | "contactEmail"
  | "deliveryMethod" | "deliveryAddress" | "poRef" | "paymentTerms" | "issueDate" | "expiryDate"
  | "salesperson" | "jobTypeCode" | "jobTypeName" | "discount" | "discountMode" | "isPotentialOpportunity"
  | "followUpDate" | "remarks" | "lines" | "customerId"
>;

// สร้างข้อความสรุปการเปลี่ยนแปลงของใบเสนอราคาเทียบกับต้นฉบับที่ถูกแก้ไขใหม่ (สำหรับ revisionNote)
// Generates a bullet-list summary of what changed in a quotation vs. the record it was rewritten from
export function generateQuoteRevisionSummary(source: QuoteRevisionDiffInput, current: QuoteRevisionDiffInput): string {
  const out: string[] = [];
  push(out, diffText("ลูกค้า", source.client, current.client));
  push(out, diffText("โครงการ", source.project, current.project));
  push(out, diffText("ที่อยู่", source.address, current.address));
  push(out, diffText("เลขประจำตัวผู้เสียภาษี", source.taxId, current.taxId));
  push(out, diffText("ชื่อผู้ติดต่อ", source.contactName, current.contactName));
  push(out, diffText("เบอร์โทรผู้ติดต่อ", source.contactPhone, current.contactPhone));
  push(out, diffText("อีเมลผู้ติดต่อ", source.contactEmail, current.contactEmail));
  push(out, diffText("วิธีจัดส่ง", source.deliveryMethod, current.deliveryMethod));
  push(out, diffText("สถานที่จัดส่ง", source.deliveryAddress, current.deliveryAddress));
  push(out, diffText("เอกสารใบสั่งซื้อ (PO)", source.poRef, current.poRef));
  push(out, diffText("เงื่อนไขการชำระเงิน", source.paymentTerms, current.paymentTerms));
  push(out, diffText("วันที่ออกใบเสนอราคา", source.issueDate, current.issueDate));
  push(out, diffText("วันหมดอายุ", source.expiryDate, current.expiryDate));
  push(out, diffText("พนักงานขาย", source.salesperson, current.salesperson));
  push(out, diffText("ประเภทงาน", `${source.jobTypeCode} ${source.jobTypeName}`.trim(), `${current.jobTypeCode} ${current.jobTypeName}`.trim()));
  push(out, diffNumber(`ส่วนลดรวม (${discountUnit(source.discountMode)})`, source.discount, current.discount));
  push(out, diffText("หน่วยส่วนลดรวม", discountUnit(source.discountMode), discountUnit(current.discountMode)));
  push(out, diffBool("โอกาสขายที่คาดว่าจะปิดได้ (Potential Opportunity)", source.isPotentialOpportunity, current.isPotentialOpportunity));
  push(out, diffText("วันที่ติดตามงาน", source.followUpDate, current.followUpDate));
  push(out, diffText("หมายเหตุ", source.remarks, current.remarks));
  if ((source.customerId ?? "") !== (current.customerId ?? "")) {
    out.push(current.customerId ? "เปลี่ยนไปเชื่อมโยงกับข้อมูลลูกค้า (Customer) รายการใหม่" : "ยกเลิกการเชื่อมโยงกับข้อมูลลูกค้า (Customer) ที่บันทึกไว้");
  }
  out.push(...diffQuoteLines(source.lines, current.lines));
  return joinOrNone(out);
}

// เปรียบเทียบรายการงานของ Scope of Work เก่ากับใหม่ทีละตำแหน่ง
// Compares old vs new Scope of Work items by array position
function diffScopeItems(oldItems: ScopeOfWorkItem[], newItems: ScopeOfWorkItem[]): string[] {
  const out: string[] = [];
  const max = Math.max(oldItems.length, newItems.length);
  for (let i = 0; i < max; i++) {
    const o = oldItems[i];
    const n = newItems[i];
    if (o && !n) { out.push(`ลบรายการที่ ${i + 1}: "${o.name || "(ไม่มีชื่อ)"}"`); continue; }
    if (!o && n) { out.push(`เพิ่มรายการที่ ${i + 1}: "${n.name || "(ไม่มีชื่อ)"}"`); continue; }
    if (!o || !n) continue;
    const label = `รายการที่ ${i + 1} "${n.name || o.name || "-"}"`;
    push(out, diffText(`${label} — ชื่อ`, o.name, n.name));
    push(out, diffText(`${label} — หน่วย`, o.unit, n.unit));
    push(out, diffNumber(`${label} — จำนวน`, o.quantity ?? 0, n.quantity ?? 0));
    push(out, diffText(`${label} — หมายเหตุ`, o.remark, n.remark));
    push(out, diffText(`${label} — ข้อกำหนด`, o.specifications.map((s) => s.text).join(" | "), n.specifications.map((s) => s.text).join(" | ")));
  }
  return out;
}

// เปรียบเทียบกลุ่มรายการเช็คลิสต์เก่ากับใหม่ (ตัวเลือกที่เพิ่ม/ลบ และหมายเหตุ)
// Compares old vs new checklist groups (added/removed options and notes)
function diffChecklistGroups(oldGroups: ChecklistGroup[], newGroups: ChecklistGroup[]): string[] {
  const out: string[] = [];
  const oldByKey = new Map(oldGroups.map((g) => [g.key, g]));
  for (const ng of newGroups) {
    const og = oldByKey.get(ng.key);
    if (!og) continue;
    const oldChecked = new Set(og.options.filter((o) => o.checked).map((o) => o.key));
    const newChecked = new Set(ng.options.filter((o) => o.checked).map((o) => o.key));
    const labelOf = (key: string) => ng.options.find((o) => o.key === key)?.label ?? key;
    const added = [...newChecked].filter((k) => !oldChecked.has(k));
    const removed = [...oldChecked].filter((k) => !newChecked.has(k));
    if (added.length > 0) out.push(`${ng.title}: เลือกเพิ่ม "${added.map(labelOf).join(", ")}"`);
    if (removed.length > 0) out.push(`${ng.title}: ยกเลิกการเลือก "${removed.map(labelOf).join(", ")}"`);
    if (og.note !== undefined && ng.note !== undefined) push(out, diffText(`${ng.title} — หมายเหตุ`, og.note, ng.note));
  }
  return out;
}

// เปรียบเทียบเงื่อนไขการชำระเงิน (งวดชำระที่เพิ่ม/ลบ/แก้ไข) เก่ากับใหม่
// Compares old vs new payment conditions (installments added/removed/changed)
function diffPaymentConditions(oldPc: ScopeOfWorkPaymentConditions, newPc: ScopeOfWorkPaymentConditions): string[] {
  const out: string[] = [];
  const oldById = new Map(oldPc.installments.map((i) => [i.id, i]));
  const newById = new Map(newPc.installments.map((i) => [i.id, i]));
  for (const inst of newPc.installments) {
    if (!oldById.has(inst.id)) out.push(`เพิ่มงวดชำระเงิน: ${inst.pct ?? "-"}% "${inst.label || "-"}" (${formatPaymentMethod(inst) || "-"})`);
  }
  for (const inst of oldPc.installments) {
    if (!newById.has(inst.id)) out.push(`ลบงวดชำระเงิน: ${inst.pct ?? "-"}% "${inst.label || "-"}" (${formatPaymentMethod(inst) || "-"})`);
  }
  for (const inst of newPc.installments) {
    const prev = oldById.get(inst.id);
    if (!prev) continue;
    const label = `งวดชำระเงิน "${inst.label || prev.label || "-"}"`;
    push(out, diffNumber(`${label} — เปอร์เซ็นต์`, prev.pct ?? 0, inst.pct ?? 0));
    push(out, diffText(`${label} — ชื่องวด`, prev.label, inst.label));
    push(out, diffText(`${label} — วิธีชำระ`, formatPaymentMethod(prev), formatPaymentMethod(inst)));
  }
  push(out, diffText("รายละเอียดการชำระเงิน", oldPc.description, newPc.description));
  push(out, diffText("หมายเหตุการชำระเงิน", oldPc.notes, newPc.notes));
  return out;
}

// เปรียบเทียบผู้รับเอกสารตามแผนกเก่ากับใหม่ (แปลง id เป็นชื่อจริง)
// Compares old vs new document recipients by department (resolving ids to real names)
function diffDocumentRecipients(oldRec: Record<string, string[]>, newRec: Record<string, string[]>, users: User[]): string[] {
  const out: string[] = [];
  const nameOf = (userId: string) => users.find((u) => u.id === userId)?.fullName ?? userId;
  for (const dept of DOCUMENT_RECIPIENT_DEPARTMENTS) {
    const oldIds = new Set(oldRec[dept.key] ?? []);
    const newIds = new Set(newRec[dept.key] ?? []);
    const added = [...newIds].filter((id) => !oldIds.has(id));
    const removed = [...oldIds].filter((id) => !newIds.has(id));
    if (added.length > 0) out.push(`ผู้รับเอกสารแผนก ${dept.label}: เพิ่ม "${added.map(nameOf).join(", ")}"`);
    if (removed.length > 0) out.push(`ผู้รับเอกสารแผนก ${dept.label}: ลบ "${removed.map(nameOf).join(", ")}"`);
  }
  // "ผู้รับเพิ่มเติม" is not a department — phrased without the แผนก prefix
  const oldExtra = new Set(oldRec[ADDITIONAL_RECIPIENT_KEY] ?? []);
  const newExtra = new Set(newRec[ADDITIONAL_RECIPIENT_KEY] ?? []);
  const addedExtra = [...newExtra].filter((id) => !oldExtra.has(id));
  const removedExtra = [...oldExtra].filter((id) => !newExtra.has(id));
  if (addedExtra.length > 0) out.push(`${ADDITIONAL_RECIPIENT_LABEL}: เพิ่ม "${addedExtra.map(nameOf).join(", ")}"`);
  if (removedExtra.length > 0) out.push(`${ADDITIONAL_RECIPIENT_LABEL}: ลบ "${removedExtra.map(nameOf).join(", ")}"`);
  return out;
}

// สร้างข้อความสรุปการเปลี่ยนแปลงของ Scope of Work เทียบกับต้นฉบับที่ถูกแก้ไขใหม่ (สำหรับ revisionNote)
// Generates a bullet-list summary of what changed in a Scope of Work vs. the record it was rewritten from
export function generateScopeOfWorkRevisionSummary(source: ScopeOfWork, current: ScopeOfWork, users: User[]): string {
  const out: string[] = [];
  push(out, diffText("วันที่", source.issueDate, current.issueDate));
  push(out, diffText("วันที่ส่งของ/ส่งแบบอนุมัติ", source.deliveryDate, current.deliveryDate));
  push(out, diffText("รหัส Drawing", source.drawingCode, current.drawingCode));
  // เทียบเลขทั้งชุดเป็นข้อความเดียว ไม่ต้องแยกทีละแถว — คนอ่านสรุปการแก้ไขอยากรู้ว่า "เลขชุดนี้
  // กลายเป็นชุดนี้" ไม่ใช่ว่าแถวที่ 2 ถูกแทรกหรือถูกเลื่อน
  push(out, diffText("เอกสารใบสั่งซื้อเลขที่ (PO)", scopePoNumbers(source).join(", "), scopePoNumbers(current).join(", ")));
  push(out, diffText("เลขใบเสนอราคา", scopeQuotationNumbers(source).join(", "), scopeQuotationNumbers(current).join(", ")));
  push(out, diffText("รหัสอ้างอิงท้ายงาน", source.secondaryCode, current.secondaryCode));
  push(out, diffText("สถานที่ส่งของ", source.deliveryLocation, current.deliveryLocation));
  push(out, diffText("ชื่อผู้ติดต่อส่งของ", source.shippingContact, current.shippingContact));
  push(out, diffText("เบอร์โทรผู้ติดต่อส่งของ", source.shippingPhone, current.shippingPhone));
  push(out, diffText("ชื่อผู้ติดต่อวางบิล", source.billingContact, current.billingContact));
  push(out, diffText("เบอร์โทรผู้ติดต่อวางบิล", source.billingPhone, current.billingPhone));
  push(out, diffText("หมายเหตุ", source.remarks, current.remarks));
  push(out, diffText("ผู้ขาย", source.seller.name, current.seller.name));
  push(out, diffText("ผู้อนุมัติ", source.approver.name, current.approver.name));
  out.push(...diffScopeItems(source.items, current.items));
  out.push(...diffChecklistGroups(source.checklistGroups, current.checklistGroups));
  out.push(...diffPaymentConditions(source.paymentConditions, current.paymentConditions));
  out.push(...diffDocumentRecipients(source.documentRecipients, current.documentRecipients, users));
  return joinOrNone(out);
}
