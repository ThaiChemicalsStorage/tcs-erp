# Module: เอกสารรออนุมัติ (Pending Approvals)

> Added 2026-08-31. Asked for by the owner on 2026-08-28:
> *"เพิ่มหน้าเอกสารรออนุมัติทุกอย่าง เพราะแบบเฮดคนนึงต้องอนุมัติหลายแผนก"*

## Purpose

One inbox answering **"what is still waiting on me?"**, across every department.

Before this, an approver had to remember which of ten document pages might be holding something for
them, open each one, and filter it by hand — no route in the app filtered by `status` at all. The
companion change (see [Notifications.md](./Notifications.md)) makes a submission *ring the bell*;
this page is what you look at when you missed or dismissed the bell.

## Layers

| Layer | Path |
|---|---|
| Page | `src/pages/pendingApprovals/PendingApprovalsPage.tsx` (nav group **หลัก**, next to Dashboard) |
| Client lib | `src/lib/pendingApprovals.ts` — `PendingApprovalItem`, `fetchPendingApprovals()`, `daysWaiting()` |
| Handler | `api/_lib/pendingApprovals.ts` (`handlePendingApprovals`), mounted in `api/handlers/customers.ts` |
| Collections | None of its own — it reads ten existing ones |
| Permissions | **None of its own.** See "No new permission" below. |

Mounted on `api/handlers/customers.ts` because it reads across nearly every collection in the
system, so no handler file genuinely owns it, and that slot is lighter than `quotes.ts`.

## The ten categories

| `kind` | Pending status | Gated by |
|---|---|---|
| `quotation` | `"รออนุมัติ"` | `quotations:approve` |
| `scopeOfWork` | `"PendingApproval"` | `scopeOfWork:finalize` |
| `deliveryOrder` | `"PendingApproval"` | `deliveryOrder:finalize` |
| `materialRequisition` | `"PendingApproval"` | `materialRequisition:finalize` |
| `jobOrder` | `"PendingApproval"` | `jobOrder:finalize` |
| `purchaseRequest` | `"PendingApproval"` | `purchaseRequest:finalize` |
| `purchaseOrder` | `"PendingApproval"` | `purchaseOrder:finalize` |
| `productionOrder` | `"PendingApproval"` | `productionOrder:finalize` |
| `costControl` | `"PendingApproval"` | `costControl:finalize` |
| `productRequest` | `"Pending"` | `productRequest:review` |

**"รออนุมัติ" is spelled three different ways** in this database, because the three groups of
modules were built months apart: `PendingApproval` (eight types), `รออนุมัติ` (quotations store the
status in Thai) and `Pending` (product requests). Collapsing them into one word would be a
full-database migration touching live documents; the translation happens in this handler instead.
A regression here reads as a whole category silently missing from the inbox.

## Gated by the approve permission, not the view permission

The page answers "what is waiting on **me**". Someone who can read a purchase order but cannot
approve one has nothing to do with it, and putting it in their inbox would make the inbox
untrustworthy. Holding none of the ten returns `[]` and hides the menu — not a `403`.

## No ownership filter, deliberately

Unlike `searchDocuments.ts`, this route does **not** apply `buildOwnershipClause`. Two reasons:

1. The caller already holds the approve permission for that document type, which is a stronger
   grant than "see other people's records".
2. Filtering by `createdBy` would show an approver only the documents *they themselves wrote* —
   the exact opposite of what the page is for.

## No new permission

A `pendingApprovals:view` permission would be a permission an admin has to go and tick in order to
open a page that grants no authority the user does not already have — and forgetting to tick it is
exactly what left the "จัดซื้อ" and "BD" nav groups invisible to everyone for three days
(see [CHANGELOG.md](../CHANGELOG.md) 2026-08-31b). So the menu is opened by `anyPermission` instead,
a field added to `NavCandidate` in `src/lib/navResolution.ts`: visible if the user holds **any** of
the ten approve permissions. **No RBAC migration is needed for this module.**

The trap `tests/navResolution.test.ts` now guards: `visibleNavItems` and `effectiveNav` used to
test permissions in two separate expressions. A rule added to one and not the other produces a page
that is reachable by URL but absent from its owner's menu. Both now share one predicate.

## No approve button on this page

Clicking a row deep-links to the document; the approve button stays where it has always been. Each
document type has its own pre-approval conditions — Scope of Work validates completeness first,
Production Order injects the approver's name into the form, Purchase Request marks its Project item
fulfilled afterwards. A combined approve button here would mean lifting all of that into a second
place, which is how two copies start disagreeing.

## Known gaps

1. **`waitingSince` is `updatedAt`, not a real submission time**, for nine of the ten categories —
   no document in this system records when it was submitted. It is close, because submitting is the
   last write to a document that is now locked, but it drifts for anything edited after submission.
   **Quotations are the exception**: they keep `approvalHistory`, so their `submitted` entry is the
   real thing, and the handler uses it. Fixing the other nine means having the shared approval
   engine write a `submittedAt` on `submit-approval` and reading that instead. Recorded in
   [TODO.md](../TODO.md).
2. **No per-category "oldest waiting" alert.** The row turns amber past three days, which is a
   visual cue, not a business rule — nobody has stated an SLA.
3. **Capped at 100 rows per category** (`PER_KIND_LIMIT`), with no pagination. A hundred pending
   documents of one type means something is already wrong; the cap exists so the page cannot be
   made unusable by it.
