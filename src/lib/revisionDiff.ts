/**
 * Auto-generates a human-readable, editable starting draft for `revisionNote` — added 2026-07-23,
 * per direct user request ("อยากได้แบบ Comment auto...ว่าแก้ตรงไหนไปสามารถทำได้ไหม...ให้ตรวจดูว่า
 * แก้ตรงไหนไปละเป็นข้อความ auto ไปก่อนละค่อยแบบถ้าผู้ใช้อยากเพิ่มหรืออยากแก้ก็สามารถแก้เองได้"):
 * compares a rewritten Quotation/Scope of Work against the record it was rewritten from and
 * produces a Thai bullet-list summary of every field that differs. Explicitly user-triggered (a
 * button in the editor calls `generateQuoteRevisionSummary()`/`generateScopeOfWorkRevisionSummary()`
 * and places the result into the already-editable `revisionNote` textarea) — never run
 * automatically/silently, so it can never clobber a user's own edits to that field without them
 * choosing to regenerate.
 *
 * Pure, framework-agnostic TS (no JSX, no browser globals) — safe to value-import from both the
 * Vite frontend bundle and the Node serverless API bundle, same convention as
 * src/lib/documentRequirements.ts already follows (this module isn't currently used server-side,
 * but keeping it import-safe costs nothing and avoids a future trap).
 */

import type { Quote, QuoteLine } from "./quotes";
import type { ScopeOfWork, ScopeOfWorkItem, ScopeOfWorkPaymentConditions } from "./scopeOfWork";
import { formatPaymentMethod } from "./scopeOfWork";
import type { ChecklistGroup } from "./documentRequirements";
import { DOCUMENT_RECIPIENT_DEPARTMENTS } from "./documentRequirements";
import type { User } from "./users";

/** Strips a trailing `-R<digits>` revision suffix (e.g. `QT-2567-0041-R2` → `QT-2567-0041`, same
 * for a Scope of Work's `scopeNumber`). Deliberately duplicated from `getRevisionRoot()` in
 * `api/_lib/quoteRevisions.ts` rather than imported — `api/_lib/*` isn't part of the Vite frontend
 * bundle, and this is the same "small deliberate duplication" precedent already used elsewhere
 * (e.g. `isWorkflowActionAllowed()` in `api/_lib/quoteWorkflow.ts` vs. `quotes.tsx`'s
 * `workflowTransitions`). Ids/scope numbers never otherwise end in `-R<digits>`. */
export function getRevisionRoot(id: string): string {
  return id.replace(/-R\d+$/, "");
}

/** The revision number encoded in an id/scopeNumber, or `0` for an original (never-rewritten) record. */
export function getRevisionNumber(id: string): number {
  const match = id.match(/-R(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

/** The id/scopeNumber of the record this one was rewritten from, or `null` if this isn't a
 * revision at all (`getRevisionNumber` is `0`). Revision numbers are atomically, sequentially
 * reserved per root (`nextRevisionNumber()`/`nextScopeRevisionNumber()` server-side) — so `-R{n}`'s
 * predecessor is always exactly `-R{n-1}` (or the bare root, for `-R1`), never a gap to guess at. */
export function getRevisionPredecessorId(id: string): string | null {
  const n = getRevisionNumber(id);
  if (n === 0) return null;
  const root = getRevisionRoot(id);
  return n === 1 ? root : `${root}-R${n - 1}`;
}

function diffText(label: string, oldVal: string, newVal: string): string | null {
  if (oldVal === newVal) return null;
  return `${label}: "${oldVal.trim() || "(ว่าง)"}" → "${newVal.trim() || "(ว่าง)"}"`;
}
function diffNumber(label: string, oldVal: number, newVal: number, fmt: (n: number) => string = (n) => n.toLocaleString("th-TH")): string | null {
  if (oldVal === newVal) return null;
  return `${label}: ${fmt(oldVal)} → ${fmt(newVal)}`;
}
function diffBool(label: string, oldVal: boolean, newVal: boolean): string | null {
  if (oldVal === newVal) return null;
  return `${label}: ${oldVal ? "ใช่" : "ไม่ใช่"} → ${newVal ? "ใช่" : "ไม่ใช่"}`;
}
function push(out: string[], v: string | null): void {
  if (v) out.push(v);
}
function joinOrNone(out: string[]): string {
  return out.length > 0 ? out.map((s) => `• ${s}`).join("\n") : "ไม่มีการเปลี่ยนแปลงจากต้นฉบับ";
}

function diffQuoteLines(oldLines: QuoteLine[], newLines: QuoteLine[]): string[] {
  // Matched by array position, not `id` — Rewrite/Duplicate always regenerate every line's `id`
  // (see `cloneLines()` in api/handlers/quotes.ts), so an id-based match would report every line
  // as both "removed" and "added" even when genuinely unchanged. Position-based matching is exact
  // for the common case (in-place edits, trailing add/remove) and only approximate if the user
  // reordered/inserted mid-list — a documented simplification, not a full list-diff algorithm.
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
    push(out, diffNumber(`${label} — ส่วนลด (%)`, o.discount, n.discount));
  }
  return out;
}

/** Exactly the fields `generateQuoteRevisionSummary()` below reads — a `Pick`, not the full
 * `Quote`, so callers can pass either a fetched `Quote` (the source) or the live in-progress
 * `QuoteDraftFields` (the current, possibly-unsaved edit state `QuoteDocument.tsx` already builds
 * for its own save payload) without assembling a fully-composed `Quote` object just for this. */
export type QuoteRevisionDiffInput = Pick<
  Quote,
  | "client" | "project" | "address" | "taxId" | "contactName" | "contactPhone" | "contactEmail"
  | "deliveryMethod" | "deliveryAddress" | "poRef" | "paymentTerms" | "issueDate" | "expiryDate"
  | "salesperson" | "jobTypeCode" | "jobTypeName" | "discount" | "isPotentialOpportunity"
  | "followUpDate" | "remarks" | "lines" | "customerId"
>;

/** Compares `current` against `source` (the record it was rewritten from) and returns a Thai
 * bullet-list summary of every changed field — an editable starting draft for `revisionNote`, not
 * a final answer. Covers every field actually editable in `QuoteDocument.tsx` (see
 * `QuoteDraftFields` in quotes.ts): header fields and a line-by-line diff of `lines`. Deliberately
 * excludes pure workflow/provenance fields (`status`, `approvalHistory`, `amount` — derived from
 * `lines`, `createdByUserId`/`updatedBy`, `templateSnapshot`) since those aren't things a user
 * edits when rewriting a quote. */
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
  push(out, diffNumber("ส่วนลดรวม (%)", source.discount, current.discount));
  push(out, diffBool("โอกาสขายที่คาดว่าจะปิดได้ (Potential Opportunity)", source.isPotentialOpportunity, current.isPotentialOpportunity));
  push(out, diffText("วันที่ติดตามงาน", source.followUpDate, current.followUpDate));
  push(out, diffText("หมายเหตุ", source.remarks, current.remarks));
  if ((source.customerId ?? "") !== (current.customerId ?? "")) {
    out.push(current.customerId ? "เปลี่ยนไปเชื่อมโยงกับข้อมูลลูกค้า (Customer) รายการใหม่" : "ยกเลิกการเชื่อมโยงกับข้อมูลลูกค้า (Customer) ที่บันทึกไว้");
  }
  out.push(...diffQuoteLines(source.lines, current.lines));
  return joinOrNone(out);
}

function diffScopeItems(oldItems: ScopeOfWorkItem[], newItems: ScopeOfWorkItem[]): string[] {
  // Same array-position matching rationale as diffQuoteLines() above — Rewrite/Duplicate regenerate
  // every item's `id` (see handleRewrite()/handleDuplicate() in api/_lib/scopeOfWorkHandler.ts).
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

function diffChecklistGroups(oldGroups: ChecklistGroup[], newGroups: ChecklistGroup[]): string[] {
  const out: string[] = [];
  const oldByKey = new Map(oldGroups.map((g) => [g.key, g]));
  for (const ng of newGroups) {
    const og = oldByKey.get(ng.key);
    if (!og) continue; // every group is server-generated up front; shouldn't happen in practice
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

function diffPaymentConditions(oldPc: ScopeOfWorkPaymentConditions, newPc: ScopeOfWorkPaymentConditions): string[] {
  // Installment ids ARE preserved through Rewrite/Duplicate (paymentConditions passes through the
  // `...rest` spread untouched — see handleRewrite()/handleDuplicate()), so id-based matching is
  // reliable here, unlike quote lines/scope items above.
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
  return out;
}

/** Same shape/purpose as `generateQuoteRevisionSummary()` above, for Scope of Work. Covers every
 * field editable in `ScopeOfWorkDocument.tsx`: header fields, items, checklist groups, payment
 * conditions/installments, document recipients (resolved to real names via `users`), seller/
 * approver names, and remarks. Excludes pure workflow/provenance fields (`status`, `version`,
 * `createdBy`/`updatedBy`, `quotationSalesperson` — frozen provenance, not user-editable). */
export function generateScopeOfWorkRevisionSummary(source: ScopeOfWork, current: ScopeOfWork, users: User[]): string {
  const out: string[] = [];
  push(out, diffText("วันที่", source.issueDate, current.issueDate));
  push(out, diffText("วันที่ส่งของ/ส่งแบบอนุมัติ", source.deliveryDate, current.deliveryDate));
  push(out, diffText("รหัส Drawing", source.drawingCode, current.drawingCode));
  push(out, diffText("เอกสารใบสั่งซื้อเลขที่ (PO)", source.customerPoNumber, current.customerPoNumber));
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
