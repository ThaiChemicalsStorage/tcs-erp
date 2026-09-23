# Database

## Current State: MongoDB Atlas (real database, live)

As of 2026-07-09 this project has a **real database**: MongoDB — self-hosted on the production VPS since the ~2026-08-07 cutover (MongoDB Atlas before that) — accessed exclusively from the backend (`api/`, run by the Express server in `server/`) via a module-scope singleton connection (`api/_lib/mongodb.ts`). The frontend never talks to MongoDB directly — it calls the REST API (see [API.md](./API.md)), which reads/writes these collections. `MONGODB_URI` lives only in `.env` (the server's own, or a developer's local one), never committed to the repo.

This supersedes the pre-2026-07-09 `localStorage`-only persistence described lower in this file's Migration Notes — that description is now historical (it documents what the client-side shapes looked like before the migration, useful context for how each collection got its current shape) rather than current state.

### MongoDB collections

| Collection | `_id` | Shape | Notes |
|---|---|---|---|
| `users` | MongoDB `ObjectId` | server-only `UserFields` (see below) | Includes `passwordHash` — never sent to the client; `toPublicUser()` (`api/_lib/collections.ts`) strips it (plus the legacy 2026-08-07 `emailAppPasswordEnc`, whose feature was removed the same day) before any response. |
| `roles` | `key: string` (e.g. `"super_admin"`, or `"role_<ObjectId>"` for custom roles) | `Role` (unchanged shape from the old client-side type) | Seeded from `defaultRoles` (`src/lib/roles.ts`) via `api/_lib/rbacSeed.ts` on first run (`seedDefaultRolesIfEmpty()`), called from the Setup Wizard and from `GET /api/roles`. |
| `users` | MongoDB `ObjectId` | server-only `UserFields` (see below) | Includes `passwordHash` — never sent to the client. `toPublicUser()` (`api/_lib/collections.ts`) strips it before any response. |
| `roles` | `key: string` (e.g. `"super_admin"`, or `"role_<ObjectId>"` for custom roles) | `Role` (unchanged shape from the old client-side type) | Seeded from `defaultRoles` (`src/lib/roles.ts`) via `api/_lib/rbacSeed.ts` on first run (`seedDefaultRolesIfEmpty()`), called from the Setup Wizard and from `GET /api/roles`. **Since 2026-08-07** those same two call sites also run `bootstrapRbac()`, which inserts any *later-added* default role a provisioned database is missing (`syncDefaultRoles()` — additive only, never rewrites an existing role's permissions) and applies pending permission backfills — see `rbac_migrations` below. |
| `company` | fixed string `"singleton"` | `Company` (unchanged shape) | Always exactly one document; `GET /api/company` falls back to `defaultCompany` merged with the stored doc if it doesn't exist yet. |
| `products` | MongoDB `ObjectId` | `Product` minus `id` (Mongo `_id` takes its place) | `withStringId()` maps `_id` → `id: string` for the client response. |
| `categories` | MongoDB `ObjectId` | `ProductCategory` minus `id` | Same `withStringId()` mapping. |
| `notifications` | MongoDB `ObjectId` | `Notification` minus `id` | `GET /api/notifications` filters server-side to `recipientUserId === <the caller>` — the collection holds every user's notifications, but a user can only ever read their own via the API. |
| `audit_log` | MongoDB `ObjectId` | `AuditLogEntry` minus `id` | `POST /api/audit-log` always derives `userId`/`userName`/`roleName` from the authenticated session, never trusting those fields from the request body. |
| `quotes` | **the business ID string itself** (e.g. `"Q#260814-0001"`), not an `ObjectId` | `Quote` minus `id` (the business ID is `_id`) | `nextQuoteId()` in `api/handlers/quotes.ts` reserves the next sequence number atomically via the `counters` collection, keyed per Bangkok-local calendar day (`quote_{YYMMDD}`) — resets to 1 each new day. **2026-08-14, format changed** from the old `QT-{Buddhist year}-NNNN` (yearly-reset, hardcoded year constant). |
| `job_types` | MongoDB `ObjectId` | `code: string; name: string; isActive: boolean` + audit fields | **Added 2026-07-10** for the Executive Dashboard/CRM pass — Job Type master data, one per quotation. See "Job Type" entity section below. |
| `company_profiles` | MongoDB `ObjectId` | *(unused — see below)* | Orphaned. Built 2026-07-13 for the now-removed Company Profiles module; **no code reads or writes this collection anymore** as of 2026-07-14, but any existing documents were deliberately left in place (no destructive cleanup) — see [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) and "`CompanyProfile`" below. |
| `customers` | MongoDB `ObjectId` | `Customer` minus `id` (see below) | **Redefined + wired 2026-07-14** — customer master data, selected on the Quotation form to autofill the Customer Information section. Has its own dedicated `api/handlers/customers.ts` serverless function (previously shared `company-profiles.ts`'s function slot; that file was deleted 2026-07-14 along with the rest of the Company Profiles module, freeing the slot) — see [ARCHITECTURE.md](./ARCHITECTURE.md) "Serverless function count." **2026-08-10**: gained `lineUserId` (the linked LINE chat for Service-Report approval pushes, exposed to clients) and server-only `linePairing {code, expiresAt}` (the outstanding 24-hour pairing code, stripped by `toPublicCustomer()` — leaking it would let a signed-in user hijack the pairing). |
| `dashboard` (virtual — no collection) | — | — | `GET /api/dashboard` (`api/dashboard/index.ts`) is a read-only aggregation over `customers`/`leads`/`quotes`/`products`/`categories`/`audit_log`/`notifications`/`job_types`-derived fields already embedded on `quotes` — it doesn't own or write any collection of its own. See Dashboard KPI section below and [MODULES/Dashboard.md](./MODULES/Dashboard.md) for the full breakdown. **2026-09-07**: the closing-probability section reads `quotes.approvalHistory` of the trailing-12-month closed set (`api/_lib/dashboardAnalytics.ts`, pure); nothing is persisted — stage probabilities are recomputed on every request. |
| `quotation_templates` | MongoDB `ObjectId` | `QuotationTemplate` minus `id` | **Added 2026-07-14** — reusable Job-Type-scoped quotation content (sections/items/editable parameters/default terms) extracted from a real Excel workbook, applied via the new Create Quotation wizard. See "`QuotationTemplate`" below and [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md). |
| `scope_of_works` | MongoDB `ObjectId` | `ScopeOfWork` minus `id` | **Added 2026-07-15** — a printable job document generated from an existing quotation, reproducing the reference "Scope Of Work PQ202607-174-LI-SK..." PDF's structure (`public/`). Stores its own independent snapshot of every quotation-derived field; editing it never touches the source quotation. See "`ScopeOfWork`" below and [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md). |
| `delivery_orders` | MongoDB `ObjectId` | `DeliveryOrder` minus `id` | **Added 2026-07-23** — a printable "ใบส่งมอบสินค้าและบริการ" document generated from an existing Scope of Work, reproducing the reference "ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM..." PDF's structure (`public/`), one printed page per payment installment. **2026-09-03**: gained `attachments` (`DocumentAttachment[]`, shared engine — bytes live in `document_attachment_files` under `docType: "delivery-orders"`); written only by the dedicated attachment routes, never by `PATCH`, and not inherited by a Rewrite. See "`DeliveryOrder`" below and [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md). |
| `service_templates` | MongoDB `ObjectId` | `ServiceTemplate` minus `id` | **Added 2026-08-06 (Phase 1)** — master Service Checklist templates (sections → groups → items), seeded idempotently from the company's real `public/รายการตรวจเช็ค.pdf` and `public/Service.xlsx` reference files. `templateCode` is the stable natural key (unique index), e.g. `"SVC-AIRPOLLUTION-STD"`. See "`ServiceTemplate`" below and [MODULES/Service.md](./MODULES/Service.md). |
| `service_reports` | **the business ID string itself** (e.g. `"SR-2569-0001"`), not an `ObjectId` | `ServiceReport` minus `id` (the business ID is `_id`) | **2026-08-10**: gained `customerApproval` (`{status: pending\|approved\|rejected, tokenHash, sentAt/sentBy/sentByName, expiresAt, sentViaLine, respondedAt, rejectReason, signedName}`) backing the remote customer-approval link/LINE flow — `tokenHash` (SHA-256 of the capability token) is server-only, stripped by `toServiceReport()`. **2026-08-07**: gained `customerSignatureDataUrl` (base64 PNG, `""` when unsigned) / `customerSignedName` / `customerSignedAt` (ISO or `null`) for on-site customer sign-off — `customerSignedAt` is server-stamped, never client-supplied. Documents predating these fields are normalized on read by `toServiceReport()`, so `undefined` never reaches a client that would read it as signed. The engineer's signature is deliberately **not** stored here — it's read live from their profile `signatureDataUrl`. **Added 2026-08-06 (Phase 1)** — field service checklist + report, created directly against a Customer (not derived from a quotation). Freezes the chosen `ServiceTemplate`'s structure onto `templateSnapshot` at creation time — editing the master template afterward never retroactively changes an already-created report. See "`ServiceReport`" below and [MODULES/Service.md](./MODULES/Service.md). |
| `receiving_reports` | **the business ID string itself** (e.g. `"RR-202609-0001"`) | `ReceivingReport` minus `id` | **Added 2026-09-03** — the Store department's ใบรับสินค้า, created from an approved Purchase Order — or, **since 2026-09-23, blank** (`purchaseOrderId: ""`, vendor and lines typed by Store). `receiveCode` (`RR`/`RX`/`RI`) is the number prefix, one counter per code, and becomes the payable's `entryType`. **One PO = one RR**, enforced by a unique *partial* index on `purchaseOrderId` where `isDeleted: false` **and `purchaseOrderId > ""`** (index name `purchaseOrderId_1_linked`; the pre-2026-09-23 `purchaseOrderId_1` counted every blank report as the same empty PO and is dropped lazily by the handler). `lines` are a snapshot of the PO's lines at creation; `batches` holds one entry per round of receiving, each carrying its vendor invoice number, the `stockMovementIds` it wrote and the `apEntryId` it posted, so a round can be reversed exactly. `printCount` (2026-09-23) is bumped by `POST /:id/print` for the FM-ST-01 form's "พิมพ์ครั้งที่". Received/outstanding quantities and values are **never stored** — computed on read by `receivingReportTotals()` (`src/lib/receivingReport.ts`), shared by the client and the server. See [MODULES/Store.md](./MODULES/Store.md). |
| `store_receipts` | business ID string, prefix = receipt code (`JD-202609-0001`, one monthly counter per code: `store_receipt_{code}_YYYYMM`) | `StoreReceipt` minus `id` (`src/lib/storeReceipt.ts`) | **Added 2026-09-23** — ใบรับคืน / รับเข้าคลังของสโตร์. `receiptCode` is one of 15 (`src/lib/storeCodes.ts`) and decides the behaviour: **return** (JD/J1/J2/J3/JP/JB/JS/JC/JT — lines reference a *paired* Final store requisition via `sourceRequisitionId` + `lines[].sourceLineId`), **receive** (FG/FP/GC/JN — catalog lines with `unitCost`), **adjust** (JU/TK — `qty` is the target balance, `reason` required). Shared ร่าง→รออนุมัติ→อนุมัติ fields. Stock changes only at `POST /:id/post` (once, `stock:adjust`), which stamps `postedAt/postedBy/postedByName/stockMovementIds`; a return also adds its quantities to the source requisition lines' `returnQty`. Soft-deleted via `isDeleted`; posted documents cannot be deleted. |
| `vendor_bill_receipts` | business ID string (`BR-202609-0001`, monthly counter `vendor_bill_YYYYMM`) | `VendorBill` minus `id` (`src/lib/vendorBill.ts`) | **Added 2026-09-23** — ใบรับวางบิลของสโตร์. Stores the vendor snapshot, `billDate`, `creditDays`, `paymentDate`, `remarks` and **only `apEntryIds`** — every amount, date and paid status is read from `ap_entries` on each read, so the "จ่ายแล้ว / เงินคงค้าง" columns always match what Accounting ticked. An AP entry may sit on **one** non-deleted bill (checked in the handler; index on `apEntryIds`), must belong to the bill's vendor, and a receiving round whose entry is on a bill cannot be reversed. No approval, no status; soft-deleted via `isDeleted`. ⚠️ Deliberately **not** the `bill_receipts` collection left behind by the Purchasing BR removed on 2026-08-28. |
| `ap_entries` | `ObjectId` | `ApEntry` minus `id` | **Added 2026-09-03** — the payable ledger behind both ทะเบียนเจ้าหนี้ and ทะเบียนภาษีซื้อ. One row per receiving round, written **only** by `POST /api/receiving-reports/:id/receipts`; there is deliberately no manual-create route, because a hand-keyed payable is how the register and the stock ledger start disagreeing with nothing to flag it. Accounting may change `status`/`paymentRef` and nothing else — a wrong amount is corrected by reversing the receipt, which rolls back stock and payable together. `entryType` is the receiving report's code — `"RR"` ซื้อเชื่อ-วัตถุดิบ / `"RX"` โรงงาน / `"RI"` โครงการ (since 2026-09-23; older rows are all `"RR"`); the company's other AP transaction codes (RM/RD/RO…, see [MODULES/Accounting.md](./MODULES/Accounting.md)) have no source document in this system yet. Month filtering keys on `invoiceDate`, not the posting date. |
| `rbac_migrations` | **the migration id string** (e.g. `"service-permissions-2026-08-06"`) | `{appliedAt: string; appliedRoleKeys: string[]}` | **Added 2026-08-07** — one row per applied RBAC permission backfill (`RBAC_MIGRATIONS`, `api/_lib/rbacSeed.ts`). Presence means "already applied, never apply again": that once-only property is what lets a permission an admin revokes in Role Management *stay* revoked, unlike a re-sync-on-every-boot scheme. Written after the grants (`$addToSet`, idempotent) so a crash or a concurrent instance costs only a redundant no-op write. See [RBAC.md](./RBAC.md) "Rollout". |
| `service_checklist_photo_files` | MongoDB `ObjectId` | `{serviceReportId, photoId, downloadKey, fileName, contentType, size, data: Binary, createdAt}` | **Added 2026-08-06**, same day as Phase 1 (pulled forward from the original Phase 2 roadmap) — photo attachments on Abnormal checklist items, same Binary-in-Mongo + unauthenticated capability-URL pattern as `scope_attachment_files` below, sized for camera photos (4 MB/photo, 6 photos/item). Metadata lives on the matching checklist item inside `service_reports.checklist`, never carried in this collection. |
| `departments` | MongoDB `ObjectId` | `DepartmentFields`: `{name, code, isActive, createdAt/updatedAt/createdBy/updatedBy}` | **Wired 2026-08-14** — moved out of the schema-prep section below (existed since 2026-07-09 but had no API routes/UI until now). `GET/POST/PATCH /api/departments` (`api/_lib/departmentsHandler.ts`, mounted inside `api/handlers/roles.ts`) + `src/pages/admin/DepartmentManagementPage.tsx`, gated by the new `departments:manage` permission. `code` is a unique slug, auto-generated (`DEPT_<ObjectId>`) if the admin doesn't supply one — not exposed in the admin UI. `User.department` still joins by `name` as free text (unchanged join to `Quote.salesperson`), now sourced from this collection's live list instead of the hardcoded `DOCUMENT_RECIPIENT_DEPARTMENTS` constant in User Management's form (that constant is untouched and still drives Scope of Work's document-recipient routing — an unrelated concern, see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md)). See [RBAC.md](./RBAC.md) "Departments + Teams + Tiered Visibility". |
| `teams` | MongoDB `ObjectId` | `TeamFields`: `{name, departmentId, isActive, createdAt/updatedAt/createdBy/updatedBy}` | **Added 2026-08-14** — sub-grouping within a department (Sales is the only department with any today: 2 teams, each with its own team lead). `departmentId` references `departments._id` as a string; team name only needs to be unique within its own department (enforced by the handler, not a DB index). `GET/POST/PATCH /api/teams` (same file/mount as `departments` above), gated by `teams:manage`. `User.teamId` (new optional field, `""` = no team) is set via a `<select>` in User Management scoped to whichever department is currently chosen. See [RBAC.md](./RBAC.md) "Departments + Teams + Tiered Visibility". |
| `ar_milestones` | MongoDB `ObjectId` | `ArMilestoneFields` (`api/_lib/collections.ts`) | **Added 2026-08-17 (Accounting Phase 1)** — one billing milestone per opened Scope of Work installment (lazily created, composite key `{scopeOfWorkId, installmentId}` unique index). Frozen snapshot of pct/label/paymentType/days + `totalContractValueExVat` (pulled transitively through the source Quotation); `billingStatus` lifecycle `not_billed → billed/work_open → closed` mirrors the real Flow's ยังไม่ได้วางบิล/วางบิล/งานยังไม่จบ/จบ. See [MODULES/Accounting.md](./MODULES/Accounting.md). |
| `ar_documents` | MongoDB `ObjectId` | `ArDocumentFields` (`api/_lib/collections.ts`) | **Added 2026-08-17, `docType` `"RE"` added 2026-08-18** — one row per issued accounting document, discriminated by `docType` `AR\|IV\|BI\|RE`; **never deleted** — `status: "cancelled"` (+reason/by/at) is the only exit, and cancelled rows stay visible/auditable forever. `docNo` = atomic Buddhist-year `{PREFIX}{YY}{MM}{SEQ}` (see `counters` below); `docDate` Gregorian ISO (the `month=` API filter matches its prefix); an RE's line carries `linkedArDocumentId` → its AR/IV tax invoice (the once-per-invoice duplicate guard). `stockDeducted: boolean` (added 2026-08-18, IV only in practice) tracks whether any `stock_movements` row has been cut against it. `isManual: boolean` (added 2026-08-18) marks a freestanding AR/IV (+ companion BI) created with `scopeOfWorkId`/`milestoneId` both `""` via `POST /api/ar-documents/manual` — see [MODULES/Accounting.md](./MODULES/Accounting.md) "Manual Tax Invoice Creation". |
| `ar_attachment_files` | MongoDB `ObjectId` | `{milestoneId, attachmentId, checklistKey, fileName, contentType, size, data: Binary, createdAt, createdBy}` | **Added 2026-08-17** — checklist-evidence uploads per billing milestone (≤2 MB × ≤5), deliberately separate from `scope_attachment_files` (different cap/permission model; session+`ar:view`-gated download, not a capability URL). |
| `document_attachment_files` | `ObjectId` | `DocumentAttachmentFileFields` (`api/_lib/collections.ts`) | **Added 2026-08-27** — shared attachment bytes for any document type, keyed by `docType` + `docId` instead of a module-specific id. Same shape and same 2 MB/5-file discipline as `scope_attachment_files`; created so Job Order attachments would not become a **third** parallel implementation alongside Scope of Work and Accounting. **Scope of Work still uses its own collection** — migrating it is tracked in [TODO.md](./TODO.md). See [MODULES/Project.md](./MODULES/Project.md). |
| `product_requests` | `ObjectId` | `ProductRequestFields` (`api/_lib/collections.ts`, = `ProductRequest` minus `id`) | **Added 2026-08-27** — คำขอเพิ่มสินค้า: another department asks for a product that is not in the catalog, Stores assigns the code on approval and a real `products` row is created then. `assignedProductCode` is **never writable by the requester** — the create/update routes do not read `code` at all (see [MODULES/Product.md](./MODULES/Product.md)). Statuses `Pending`/`Approved`/`Rejected`; soft-deleted via `isDeleted`. |
| `stock_movements` | MongoDB `ObjectId` | `StockMovementFields` (`api/_lib/collections.ts`) | **Added 2026-08-18** — append-only ledger of every `Product.stockQty` change (`kind: "receive"\|"deduct"\|"adjust"`, signed `delta`, `balanceAfter` snapshot). Deliberately **shared, document-agnostic infrastructure** (`sourceType: "manual"\|"ar_document"`, optional `sourceId`/`sourceLabel`) — not an Accounting-only private stock number, so a future ใบเบิกของ (Material Requisition)/PR module (the "Project" department's parallel workstream, see the coordination note at the top of [CLAUDE.md](./CLAUDE.md)) can write into this same collection instead of inventing a second, competing stock-quantity system. `applyStockMovement()` (`api/_lib/stockHandler.ts`) is the **only** code path allowed to change `Product.stockQty` — an atomic `findOneAndUpdate` with `stockQty: {$gte: -delta}` on deductions rejects an over-deduction in the same query (no separate read-then-write race window, no Mongo transaction needed). Indexes: `{productId:1, createdAt:-1}`, `{sourceType:1, sourceId:1}`. See [MODULES/Product.md](./MODULES/Product.md) "Stock" and [MODULES/Accounting.md](./MODULES/Accounting.md). |
| `projects` | MongoDB `ObjectId` | `ProjectFields` (`src/lib/project.ts` minus `id`) | **API routes added Stage 3, 2026-08-18** — see "Project module" below and [API.md](./API.md) "Project." No UI yet. |
| `material_requisitions` | business ID string (e.g. `"MR-2569-0001"`, atomic per-Buddhist-year counter; **since 2026-09-23 a store requisition's id is prefixed by its issue code, e.g. `PD-202609-0001`, one counter per code** — `ownerDepartment: "store"` + `issueCode` + `storeReference`) | `MaterialRequisitionFields` (`src/lib/materialRequisition.ts` minus `id`) | **API routes added Stage 3, 2026-08-18** — see "Project module" below and [API.md](./API.md) "Project." No UI yet. |
| `job_orders` | business ID string (e.g. `"JO-2569-0001"`) | `JobOrderFields` (`src/lib/jobOrder.ts` minus `id`) | **API routes added Stage 3, 2026-08-18** — see "Project module" below and [API.md](./API.md) "Project." No UI yet. |
| `purchase_requests` | business ID string (e.g. `"PR-2569-0001"`; since 2026-09-23 the prefix is the requesting department code `PR`/`FD`/`ED`/`SD`, stored as `requestCode`, one counter per code) | `PurchaseRequestFields` (`src/lib/purchaseRequest.ts` minus `id`) | **API routes added Stage 3, 2026-08-18** — see "Project module" below and [API.md](./API.md) "Project." No UI yet. |
| `production_orders` | business ID string (e.g. `"SC-2026-08-009"`, atomic per-**Gregorian**-year+month counter) | `ProductionOrderFields` (`src/lib/productionOrder.ts` minus `id`) | **Added 2026-08-20** — ใบสั่งผลิต (FM-PD-02) for the Production department. Unlike the three documents above it is generated **directly from an approved Scope of Work**, not a Project item, so it has no `projectId`. Its numbering deliberately uses the Gregorian year to match the real form, unlike every other document in this database — see [MODULES/Production.md](./MODULES/Production.md). **2026-08-27**: gained `documentNumber` — the number actually printed on the form, seeded equal to `_id` and editable while Draft, with a unique index. The `_id` stays immutable because `material_requisitions`/`purchase_requests` reference it via `productionOrderId`. Legacy rows are backfilled to `_id` on first write (`ensureProductionOrderNumberIndex()`), since a unique index over many missing values would otherwise fail with E11000. |
| `purchase_orders` | business ID string (`"PO-2569-0001"`, atomic per-**Buddhist**-year counter) | `PurchaseOrderFields` (`src/lib/purchaseOrder.ts` minus `id`) | **Added 2026-08-28** — ใบสั่งซื้อ for the Purchasing module. Created from an approved `purchase_requests` document (lines copied as a snapshot, never a live reference) or blank. Uses the shared ร่าง→รออนุมัติ→อนุมัติ fields (`api/_lib/documentApproval.ts`) and `{root}-R{n}` rewrites. `documentNumber` is separately editable and uniquely indexed — the index is created **lazily by the handler**, since `ensureIndexes()` only runs from the Setup Wizard. Soft-deleted via `isDeleted`. |
| `vendors` | ObjectId | `VendorFields` (`api/_lib/collections.ts`) | **Added 2026-08-31** — ทะเบียนผู้ขายของฝ่ายจัดซื้อ. `code` (รหัสผู้ขาย) is optional but **unique when set**: upper-cased on write, guarded by a case-insensitive `$regex` check for the readable 409 plus a `unique` **partial** index (`code` present and non-empty) for the concurrent-insert race. A purchase order still stores `vendorName` as a plain string — the register supplies suggestions and auto-fill, it never constrains what can be typed. Soft-deleted via `isDeleted`; archived vendors stop appearing in the dropdown but old documents keep the name they already stored. |
| `code_entries` | ObjectId | `CodeEntryFields` (`api/_lib/collections.ts`) | **Added 2026-08-31** — ทะเบียนรหัสของใบ PR/PO. **Two unrelated registers in one collection**, separated by `kind`: `department` (`G143`, what a purchase request line's แผนก box holds) and `account` (the 479-row chart of accounts, `5230-15`). Uniqueness is on **`{ kind, code }`, not `code` alone** — the sets are unrelated, so the same string may legitimately exist in both; codes are upper-cased on write so the case-insensitive `$regex` check and the unique index agree. The four account-only fields (`category`/`level`/`isControl`/`parentCode`) are the sole difference between the two kinds; `isControl: true` marks a grouping account that cannot be posted to and is filtered out of the PR/PO dropdowns. Documents store the code **as a plain string** — the register supplies suggestions, it never constrains what can be typed. Soft-deleted via `isDeleted`. |
| `goods_receipts` | — | — | **Added 2026-08-28, module removed the same day.** ใบตรวจรับสินค้า was built and withdrawn on the owner's instruction; the code is gone but **the collection was deliberately left in MongoDB** (never written to outside a local test), following the Company Profiles precedent that code removal never drops a collection. See [MODULES/Purchasing.md](./MODULES/Purchasing.md) "Removed 2026-08-28". |
| `bill_receipts` | — | — | **Added 2026-08-28, module removed the same day** — same story as `goods_receipts` above. |
| `material_requisition_templates` | ObjectId | `MaterialRequisitionTemplateFields` (`src/lib/materialRequisitionTemplate.ts` minus `id`) | **Added 2026-09-02** — ชุดรายการวัสดุที่ตั้งชื่อไว้ กดเรียกลงใบเบิกได้ทั้งชุด · soft-delete (`isDeleted`) ไม่ลบแถวจริง เพื่อให้ audit log ย้อนหลังอ่านชื่อออก · ไม่มีสิทธิ์ของตัวเอง ใช้ `materialRequisition:view`/`:edit` |
| `cost_controls` | business ID string (`"CC-2569-0001"`, atomic per-Buddhist-year counter) | `CostControlFields` (`src/lib/costControl.ts` minus `id`) | **Added 2026-08-28** — Cost Control ของแผนก BD, transcribed from the company's own Excel form (FM-SL-06 Rev.02). Lines carry `kind` (`group`/`item`/`sub`) **as a stored field**, because in the source sheet a group heading and a descriptive sub-line are textually identical and differ only by cell colour. **No total of any kind is stored, and since 2026-08-31 none is derived either** — the list route sends no total at all; cost lives only on `lines` (`lineTotalCost()` = จำนวน × ต้นทุน per row). **2026-08-31**: the five markup fields (`operatingCost`/`operatingPct`/`bubbleCost`/`bubblePct`/`entertainmentCost`) and `sellingPrice` were removed from the type along with all profit/margin arithmetic, at the owner's instruction — documents written before that keep those keys in MongoDB (**no cleanup was run, nothing reads them**), and the API now ignores them on write, the way it ignores any unknown key. Uses the shared approval fields and `{root}-R{n}` rewrites. **2026-08-31**: gained `scopeOfWorkId` — a real FK to `scope_of_works`, `""` when standalone, normalized on read (no migration script). It sits **beside** `jobOrder`, which still holds the Scope of Work number as **text, not a foreign key** — the text is what people type and what the Excel header carries; the FK is what grants a Scope's document recipients sight of this document (see RBAC.md, Cost Control's third visibility path). Non-unique index by design — one Scope may carry several cost sheets, the same non-enforced convention `deliveryOrders`/`projects` use. Soft-deleted via `isDeleted`. |

### Schema-prep collections (added 2026-07-09, mostly not wired to routes/UI yet)

Per the 2026-07-09 production-readiness pass, every collection below exists with real indexes ahead of the feature that will use it (`api/_lib/collections.ts`), seeded where noted (`api/_lib/systemSeed.ts`, called once from the Setup Wizard alongside `seedDefaultRolesIfEmpty()`). **None of these have API routes or UI built on top of them yet** except where called out — they're schema/index scaffolding only, so that future features don't start from an empty, un-indexed collection.

| Collection | Purpose | Seeded? | Indexes |
|---|---|---|---|
| `permissions` | Mirrors `ALL_PERMISSIONS` (`src/lib/permissions.ts`) as documents — forward-looking scaffolding for an eventual admin-configurable permission registry. RBAC still checks the hardcoded TS union, **not** this collection. | Yes, from `ALL_PERMISSIONS`/`PERMISSION_LABELS`/`PERMISSION_GROUPS`/`SUPER_ADMIN_ONLY_PERMISSIONS` | `{ key: 1 }` unique |
| `sessions` | **Written for real since 2026-08-31** (was scaffolding nobody touched). One row per session; the JWT carries a matching `sid` claim, so a session can finally be revoked before its natural expiry. Logging in **revokes every other live session for that user** — the owner's "1 user จำกัดเข้าได้แค่ 1 คน". Rows are marked `revokedAt`/`revokedReason`, **not deleted**, so the evicted device can be told it was superseded rather than merely expired. `expiresAt` changed from `string` to **`Date`** — the pre-existing TTL index could never have purged anything against a string. | No | `{ tokenId: 1 }` unique, `{ userId: 1 }`, TTL index `{ expiresAt: 1 }` (`expireAfterSeconds: 0`, auto-purges) — created lazily by `api/_lib/auth.ts`, since `ensureIndexes()` only runs from the Setup Wizard |
| `login_attempts` | **Live (2026-07-29)** — login rate limiting: one doc per FAILED `POST /api/auth/login` attempt (`{identifier, ip, createdAt: Date}` — a real BSON `Date`, unlike this codebase's usual ISO strings, because TTL indexes require one). ≥5 failures/identifier or ≥20/IP within 15 min → 429; success deletes the identifier's docs. See [RBAC.md](./RBAC.md) Known Gaps. | Yes | TTL index `{ createdAt: 1 }` (`expireAfterSeconds: 900`), `{ identifier: 1, createdAt: 1 }`, `{ ip: 1, createdAt: 1 }` — also declared defensively at runtime (`ensureLoginAttemptIndexes()`, api/handlers/auth.ts) since `ensureIndexes()` only runs from the Setup Wizard |
| `positions` | Position/level list. **Not** wired into `User.position` (still free text, unchanged). | Yes, generic starter list (พนักงาน, หัวหน้างาน, ผู้จัดการ, ผู้จัดการทั่วไป, กรรมการผู้จัดการ) | `{ code: 1 }` unique |
| `customer_contacts` | Secondary contacts beyond a customer's primary contact — **still schema-only**, no API/UI (unrelated to the 2026-07-14 `customers` rewrite below, which uses `Quote`'s own single-contact shape instead of this table). | No | `{ customerId: 1 }` |
| `leads` | CRM lead/pipeline record, 9-stage `LeadStage` (ลูกค้าใหม่ → ... → ปิดการขายสำเร็จ/เสียโอกาส), `convertedToCustomerId` link. Resolves the open "Lead vs Customer: one entity or two?" question from `MODULES/Customer.md`/`Lead.md` — this pass builds them as **two separate collections**. `GET /api/dashboard`'s `totalLeads` KPI counts this. | No | `{ salesOwnerId: 1 }`, `{ stage: 1 }`, `{ deletedAt: 1 }` |
| `lead_activities` | Append-only lead timeline (stage changes, notes, calls, emails, meetings) — same immutable-event-log shape as `audit_log`/embedded `approvalHistory`, no `updatedAt`/`deletedAt`. | No | `{ leadId: 1, createdAt: -1 }` |
| `product_templates` | Reusable presets for fast product creation, independent of the live `products` catalog. **Semantics not fully settled** — treat as a starting interpretation, confirm before building UI against it. | No | `{ categoryId: 1 }`, `{ isActive: 1 }` |
| `quotation_comments` | General discussion thread on a quote — distinct from `approvalHistory` (which is transition-specific, not freeform). | No | `{ quoteId: 1, createdAt: 1 }` |
| `quotation_tags` | Quote-level tag *registry* (name + color) — distinct from the existing embedded per-line `QuoteLine.tags` (free chip strings). | No | `{ name: 1 }` unique |
| `notification_types` | Mirrors the hardcoded `NotificationType` union (`src/lib/notifications.ts`) as documents — same "scaffolding, not read by any live code path" treatment as `permissions`. | Yes | `{ key: 1 }` unique |
| `system_settings` | Singleton (`_id: "singleton"`, like `company`) — application config (`defaultPageSize`, `maintenanceMode`, `sessionDurationDays`), distinct from `company`'s business identity. Defaults mirror current hardcoded behavior (`sessionDurationDays: 7` matches `SESSION_DAYS` in `api/_lib/auth.ts`) so future wiring is a no-op migration — nothing reads from this collection yet. | Yes (upsert-once) | none beyond default `_id` |
| `uploads` | Forward-looking scaffolding for real blob storage. Nothing writes to it today — every current upload (logo/stamp/profile picture/signature) is inline base64 on its parent document (see `Company`/`User` below); that has a practical 16MB Mongo document ceiling, tracked in TODO.md. | No | `{ uploadedByUserId: 1 }`, `{ purpose: 1 }` |
| `attachments` | Polymorphic file-to-entity link (`entityType`/`entityId` → `uploadId`), for when `uploads` is wired up. | No | `{ entityType: 1, entityId: 1 }` |

**Deliberately not built as separate collections** (decisions recorded here per the prod-readiness spec's request for `quotation_items`/`quotation_approvals`/`quotation_status_history`):
- **`quotation_items`** — stays embedded as `Quote.lines` (`QuoteLine[]`). Always read/written together with its parent quote (every render, every edit); extracting it would touch `LineItemsEditor.tsx`, `computeTotals()`, and the handler's field-whitelisting logic for no clear benefit.
- **`quotation_approvals`** — stays embedded as `Quote.approvalHistory`. Same reasoning: always read together with its parent, small/bounded array.
- **`quotation_status_history`** — not built at all, **redundant with `approvalHistory`**: every workflow action already records a status transition (`workflowTransitions[action].to` in `api/_lib/quoteWorkflow.ts`), so `approvalHistory` already *is* the complete status history.

### What does NOT persist server-side (in-memory only, resets on reload)

- Everything that's plain component `useState` (which view is open, form drafts before Save, UI toggles like "show archived", the notification-panel open/closed state). This is unchanged by the backend migration — it was always ephemeral UI state, never meant to persist.

## Entity Descriptions (current, real shapes)

These map closely onto the pre-migration client-side TypeScript shapes — most fields are unchanged. Differences from the old `localStorage`-era shapes are called out per entity below.

### `Company` (`src/lib/storage.ts`)
```ts
interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;       // added 2026-08-04 — was always "" on CompanyHeaderInfo before this, no Settings field existed
  facebookName: string;  // added 2026-08-04 — display name of the company's Facebook page, e.g. "Thai Chemicals Storage Company Limited"
  lineId: string;        // added 2026-08-04 — Line handle, e.g. "@thaichemicals"
  taxId: string;
  logoDataUrl: string;   // base64 data URL, "" if none, 1MB client-side cap
  stampDataUrl: string;  // base64 data URL, "" if none, 1MB client-side cap
  vatRate: number;               // editable, NOT yet read by computeTotals() — see TODO.md
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  termsAndConditions: string;    // default value for the quotation remarks textarea when set
  updatedAt: string;              // ISO datetime, added 2026-07-09 — set server-side on every PUT
  updatedBy: string;              // → User.id, added 2026-07-09 — set server-side, not client-writable
}
```
Single record (not a list) — there is only ever one company, matching this app's single-company (not multi-tenant) design. Editable only by Super Admin (`company:manage`, hardcoded — see [RBAC.md](./RBAC.md)). `logoDataUrl`/`stampDataUrl` are rendered into the quotation PDF header/signature block — see [MODULES/Quotation.md](./MODULES/Quotation.md). If `logoDataUrl` is empty, quote/print headers and the app's own branding (sidebar/login/loading/favicon) fall back to the static official logo (`public/logo.png`, via `components/BrandMark.tsx`) — see ARCHITECTURE.md/UI_GUIDELINES.md. `website`/`facebookName`/`lineId` (2026-08-04) feed the letterhead's social-info line on all 3 printed documents (Quotation/Scope of Work/Delivery Order) — see [MODULES/Settings.md](./MODULES/Settings.md) and each document's MODULES page.

### `User` (`src/lib/users.ts`, client-facing) / `UserFields` (`api/_lib/collections.ts`, server-only storage schema)
```ts
type UserStatus = "active" | "inactive";

// Client-facing type — src/lib/users.ts. Never includes a password field.
interface User {
  id: string;             // Mongo _id.toString()
  employeeId: string;      // enforced unique
  fullName: string;
  username: string;        // enforced unique, used for login
  email: string;           // enforced unique, used for login
  phone: string;
  department: string;      // still a plain string field (no DB-level enum/FK) — the User create/edit
                            // form's <select> sources its options from the now-wired `departments`
                            // collection (2026-08-14, see below) by department NAME, same free-text
                            // join Quote.salesperson/the Dashboard's department filter already use.
                            // A record whose value doesn't match any current department name is kept
                            // as a selectable "legacy value" option, never silently overwritten.
                            // ScopeOfWorkDocument.tsx's recipient picker separately exact-matches
                            // against the UNRELATED DOCUMENT_RECIPIENT_DEPARTMENTS constant (Purchase/
                            // Project/Factory/Technic/Service/Accounting) — see MODULES/ScopeOfWork.md
                            // "Document Recipients"; the two department lists are deliberately not
                            // the same one.
  teamId: string;          // "" = no team (added 2026-08-14). References a `teams._id` — always a
                            // sub-grouping WITHIN whatever `department` this user has. Powers the
                            // `viewTeam` visibility tier on Quotations/Scope of Work/Delivery Order —
                            // see RBAC.md "Departments + Teams + Tiered Visibility".
  position: string;        // free text, suggestions only — deliberately independent of roleKey
  roleKey: string;         // → Role.key
  status: UserStatus;
  profilePictureDataUrl: string;
  signatureDataUrl: string;    // rendered on quotations this user prepared/approved
  createdAt: string;
  updatedAt: string;
}

// Server-only DB storage schema — api/_lib/collections.ts.
// UserFields = Omit<User, "id"> & { passwordHash: string; emailAppPasswordEnc?: string }.
// toPublicUser() strips passwordHash and maps _id -> id before any response reaches the client.
// emailAppPasswordEnc is LEGACY (2026-08-07, existed for a few hours): the per-user encrypted
// Gmail App Password for the same-day-removed email-sending feature. No code writes or reads it
// anymore; toPublicUser() still strips it defensively from old documents. Safe to $unset en masse.
```
`passwordHash` is a **real bcrypt hash** (`bcryptjs`, cost 10) — the old client-side `hashPassword()` non-cryptographic checksum function is gone entirely, deleted, not just deprecated. `User[]` (a MongoDB collection now, not a `localStorage` array) is real multi-account support. The "current user" is real React state in `App.tsx` (`currentUser`), populated on boot from `GET /api/auth/session` and kept in sync via `updateUsers`/`updateCurrentUser` — no longer derived via `.find()` against a separately-tracked session id.

### `Role` (`src/lib/roles.ts`) / `Permission` (`src/lib/permissions.ts`)
```ts
type Permission =
  | "dashboard:view"
  | "quotations:view" | "quotations:create" | "quotations:edit" | "quotations:delete"
  | "quotations:approve" | "quotations:reject" | "quotations:export"
  | "products:view" | "products:create" | "products:edit" | "products:delete" | "products:export"
  | "users:manage" | "roles:manage" | "company:manage" | "auditLog:view";

interface Role {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSuperAdmin: boolean;  // bypasses every permission check
  isSystem: boolean;      // built-in (Super Admin/Administrator) — undeletable, read-only permission matrix
}
```
7 default roles ship in `defaultRoles` (`src/lib/roles.ts`) — 6 until 2026-08-07, when `service_engineer` was added — seeded into the `roles` MongoDB collection on first run by `api/_lib/rbacSeed.ts`'s `seedDefaultRolesIfEmpty()`, with later additions reaching an already-provisioned database via `syncDefaultRoles()` (see the `roles`/`rbac_migrations` rows above); admins can add custom ones (`key: "role_<ObjectId>"`). `roles:manage`/`company:manage` cannot be granted to any role but the Super Admin role itself (`isPermissionLockedToSuperAdmin()`), enforced both client-side (UI) and server-side (`api/handlers/roles.ts` filters these out of any create/edit payload).

### `Notification` (`src/lib/notifications.ts`)
```ts
// quotation_won/lost/cancelled added 2026-07-10 (fifth pass); scope_of_work_document_sent added
// 2026-07-23 — the first type not tied to the quotation approval workflow at all, see
// MODULES/ScopeOfWork.md "Document Recipients".
type NotificationType =
  | "quotation_submitted" | "quotation_approved" | "quotation_rejected"
  | "quotation_high_value" | "quotation_customer_accepted" | "quotation_customer_rejected"
  | "quotation_won" | "quotation_lost" | "quotation_cancelled"
  | "scope_of_work_document_sent";

interface Notification {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  description: string;
  module: string;
  relatedQuoteId?: string;
  // relatedScopeId/relatedScopeNumber added 2026-07-23 — same naming convention as
  // AuditLogEntry.relatedScopeId/.relatedScopeNumber below.
  relatedScopeId?: string;
  relatedScopeNumber?: string;
  createdAt: string;
  read: boolean;
}
```
All notifications (for every user) live in one `notifications` collection, but `GET /api/notifications` filters **server-side** to `recipientUserId === <the authenticated caller>` — a genuine improvement over the pre-migration behavior, where the client held every user's notifications in memory and only filtered client-side for display (a real, if low-stakes, data exposure). Notification creation now only happens inside `api/handlers/quotes.ts`'s workflow handler, as a side effect of a status transition (querying `users`/`roles` server-side to determine recipients) — there is deliberately no generic "create notification for arbitrary user" endpoint, to prevent spam/spoofing. Index added 2026-07-09: `{ recipientUserId: 1, createdAt: -1 }`, serving both the filter and the feed sort order (was previously an unindexed `find`).

### `AuditLogEntry` (`src/lib/auditLog.ts`)
```ts
interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  module: string;
  action: string;
  details: string;
  createdAt: string;
  relatedQuoteId?: string;              // added 2026-07-13, seventh same-day pass
  relatedCustomerName?: string;         // added 2026-07-13, seventh same-day pass
  relatedCompanyProfileId?: string;     // orphaned field — see below
  relatedCompanyProfileName?: string;   // orphaned field — see below
  relatedTemplateId?: string;           // added 2026-07-15
  relatedTemplateName?: string;         // added 2026-07-15
  relatedJobTypeCode?: string;          // added 2026-07-15
}
```
Append-only — `logAudit()` has no corresponding update/delete function, so there is no code path to alter history from the UI (including for Super Admin). `POST /api/audit-log` (`api/audit-log/index.ts`) always derives `userId`/`userName`/`roleName` from the authenticated session server-side, never trusting those fields from the request body — a genuine integrity improvement over the pre-migration `localStorage` array, where a client could have written an entry claiming to be any user. Index added 2026-07-09: `{ createdAt: -1 }` (was previously an unindexed `find().sort().limit(1000)`). Index added 2026-07-13 (seventh same-day pass): `{ action: 1, createdAt: -1 }`, serving the Sales Activity Analytics query (now scans all 5 tracked `action` values, commonly with no `userName` filter — "All Sales" selected — which the existing `{ userName: 1, createdAt: -1 }` index can't serve alone).

`relatedCompanyProfileId`/`relatedCompanyProfileName` (added 2026-07-13, tenth same-day pass) are **orphaned as of 2026-07-14** — they were only ever written by `writeCompanyProfileAuditEntry()` inside the now-deleted `api/handlers/company-profiles.ts` (see [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) "Removed"). Nothing writes them anymore; kept on the type only so the historical `audit_log` entries that already have them still type-check and render without special-casing. `POST /api/audit-log` still rejects the `"โปรไฟล์บริษัท"` module outright (prevents a client from forging *new* entries for a module that no longer exists) — same lockout pattern as `"ใบเสนอราคา"`.

`relatedQuoteId`/`relatedCustomerName` (2026-07-13, seventh same-day pass): optional structured fields, set only by `writeQuoteAuditEntry()` (`api/handlers/quotes.ts`) on quote-workflow entries (Created/Updated/Duplicated/every workflow transition) — the quotation number and customer name were already present in the entry's free-text `details` string, but the Dashboard's Recent Activity table needs them as real fields to render as a clickable link/column instead of parsing prose. Backward-compatible: older entries and every non-quote module (Users/Roles/Settings/Login) simply lack these fields, and `ActivityTimeline.tsx` renders "—" when absent.

`relatedTemplateId`/`relatedTemplateName`/`relatedJobTypeCode` (added 2026-07-15): same optional/backward-compatible structured-field pattern, set by `writeTemplateAuditEntry()` (`api/_lib/quotationTemplatesHandler.ts`) on every Quotation Template lifecycle event (module `"Template ใบเสนอราคา"`) — Created/Updated/Duplicated/Activated/Deactivated/Archived/Unarchived/Imported. `relatedTemplateId` is omitted on the "Templates Imported" bulk-import entry (no single template to point at).

### `Product` / `ProductCategory` (`src/lib/products.ts`)
```ts
interface ProductCategory {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;       // ISO datetime, added 2026-07-09
  updatedAt: string;       // ISO datetime, added 2026-07-09
  createdBy: string;       // → User.id, added 2026-07-09
  updatedBy: string;       // → User.id, added 2026-07-09
}

interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;      // → ProductCategory.id
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
  archived: boolean;       // the soft-delete flag — no separate deletedAt field
  stockQty: number;        // added 2026-08-18 — current on-hand quantity, see "Stock" below
  avgCost?: number;        // added 2026-09-03 — moving average, the basis of stock value
  lastCost?: number;       // added 2026-09-09 — unit cost of the latest receipt that carried a price
  lastCostAt?: string;     // added 2026-09-09 — when that receipt happened (ISO datetime)
  createdAt: string;       // ISO datetime
  updatedAt: string;       // ISO datetime
  createdBy: string;       // → User.id, added 2026-07-09
  updatedBy: string;       // → User.id, added 2026-07-09
}
```
Indexes added 2026-07-09: `products` gets `{ categoryId: 1 }` and `{ archived: 1 }`; `categories` gets `{ name: 1 }` (non-unique — existing data wasn't verified duplicate-free before adding it, so it's not enforced as a constraint).

### `StockMovement` (`src/lib/stock.ts`) — added 2026-08-18

```ts
type StockMovementKind = "receive" | "deduct" | "adjust";
type StockMovementSourceType = "manual" | "ar_document";

interface StockMovement {
  id: string;
  productId: string;
  productCode: string;   // denormalized snapshot — see below
  productName: string;   // denormalized snapshot — see below
  kind: StockMovementKind;
  delta: number;          // signed effect on Product.stockQty (negative for "deduct")
  balanceAfter: number;   // Product.stockQty immediately after this movement — an audit snapshot, not re-derived
  reason: string;
  sourceType: StockMovementSourceType;
  sourceId?: string;      // set only when sourceType === "ar_document" — the ArDocument _id this was cut against
  sourceLabel?: string;   // denormalized, e.g. the AR document's docNo, so the log reads without a join
  createdAt: string;
  createdBy: string;
}
```

`productCode`/`productName` are a **snapshot at movement time**, not a live join — same rationale as `Quote.jobTypeCode`/`jobTypeName` above: a Product's code/name may change later, but the movement log should always show what they were when the movement happened. `Product.stockQty` only ever changes via `applyStockMovement()` (`api/_lib/stockHandler.ts`), which both the manual Stock page (`POST /api/stock-movements`, `src/pages/stock/StockPage.tsx`) and Accounting's IV stock-cutting action (`POST /api/ar-documents/:id/stock-deduction`, `src/pages/accounting/ArStockPanel.tsx`) call — so every balance change is always traceable through a row in `stock_movements`. See [MODULES/Product.md](./MODULES/Product.md) "Stock" for the full feature writeup and [MODULES/Accounting.md](./MODULES/Accounting.md) for the IV-specific integration.

### `JobType` (`src/lib/jobTypes.ts`) — added 2026-07-10

```ts
interface JobType {
  id: string;
  code: string;     // e.g. "TA", "STA", "OTHER" — the value stored on Quote.jobTypeCode
  name: string;
  isActive: boolean; // soft-deactivate only, same pattern as ProductCategory.archived
  createdAt: string;
  updatedAt: string;
  createdBy: string;  // → User.id
  updatedBy: string;  // → User.id
}
```
Master data for classifying every quotation by the kind of work it represents. Seeded with 13 defaults on first use (`DEFAULT_JOB_TYPES` in `api/_lib/systemSeed.ts`: TA, STA, LI, SC, BF, GA, BI, VT, WTP, OTHER TA, OTHER SC, OTHER BF, OTHER) via `seedJobTypesIfEmpty()`. Unlike the other 2026-07-09 seed functions, this one is **also** called defensively from `GET /api/jobtypes` itself (not only from the Setup Wizard's one-time bootstrap) — since `ensureIndexes()`/seeding only run from `handleSetup()`, which is permanently blocked once any user exists, a collection added after the production database was already provisioned needs its own self-healing seed path, following the same precedent `GET /api/roles` already uses for `seedDefaultRolesIfEmpty()`. `POST`/`PATCH /api/jobtypes` require `company:manage` (Super Admin only, matching the "company-wide configuration data" precedent used for bank/VAT/T&C settings); `GET` only requires `quotations:view`. No new `Permission` was added — see [RBAC.md](./RBAC.md).

`Quote.jobTypeCode`/`jobTypeName` are a **snapshot**, not a live reference — same rationale as `QuoteLine` never referencing `Product` live: renaming a Job Type later must not rewrite historical quotes.

### `QuotationTemplate` (`src/lib/quotationTemplates.ts`) — added 2026-07-14, extended 2026-07-15

```ts
type TemplateItemType = "item" | "subItem" | "specification";
interface TemplateItem {
  id: string; itemType: TemplateItemType; itemCode: string; name: string; description: string;
  quantity: number | null; unit: string; subDetails: string[]; productId?: string;
  // Added 2026-07-15 — informational only, never read when applying a template to a quote.
  productSnapshot?: { code: string; name: string; unit: string; defaultPrice: number };
  sortOrder: number;
}
// 2026-07-21: `specifications`/`editableParameters`(+its `TemplateEditableParameter` type)/
// `internalNotes`/`visibleToCustomer` were removed entirely (unused UI, direct user request — see
// CHANGELOG.md). Real pre-existing `specifications` content is folded into `subDetails` instead —
// once, defensively, by `TemplateEditorView.tsx` (on load) and `applyTemplate.ts` (on apply) reading
// a no-longer-typed raw field, so old MongoDB documents that still carry it (no migration script
// ran) don't lose that content. `editableParameters`/item-level `internalNotes`/`visibleToCustomer`
// have no such fallback — any old documents' values for those three are simply ignored going
// forward. Every item is now always treated as customer-visible (no more hide-from-customer gate).
interface TemplateSection { id: string; title: string; description: string; sortOrder: number; items: TemplateItem[]; }
interface TemplateTermLine { type: "paymentTerm" | "warrantyTerm" | "taxNote"; text: string; }
// Added 2026-07-15 — "excel_import" for the 5 workbook seeds, "manual" for anything created/duplicated via Template Management.
type TemplateSourceType = "excel_import" | "manual";
interface QuotationTemplate {
  id: string; templateCode: string; templateName: string; jobTypeCode: string; jobTypeName: string;
  description: string; version: string; sourceType: TemplateSourceType; sourceFileName: string; sourceSheetName: string; sourceHash: string;
  sourceWorkbookHash?: string;  // added 2026-07-15 (second Codex-review fix pass) — SHA-256 of the real workbook sheet's raw content, computed by api/_lib/templateWorkbookParser.ts; independent of sourceHash (which only reflects the hand-transcribed seed), absent on manual templates
  sections: TemplateSection[]; defaultTerms: TemplateTermLine[]; internalNotes: string[];
  isActive: boolean; isDeleted: boolean; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string;
}
```

Backs the Create Quotation wizard's Job Type → Template → Preview flow — see
[MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) for the full business flow, the
Excel-row classification rules used to extract the seed content, and the 5 seeded templates
(`SC-WET-SCRUBBER`/`SC-ACTIVATED-CARBON`/`BF-BAG-FILTER`/`TA-FRP-TANK`/`LI-FRP-LINING`).
`internalNotes` (template-level; the item-level equivalent was removed 2026-07-21, see the
`TemplateItem` interface above) holds real internal-staff review comments extracted from the source
workbook — never copied into a quotation, never printed, and never projected by the Global Search
endpoint (see "Global Search" below). `sourceHash` is a SHA-256 hash over the content-relevant fields, used by the idempotent
import (`upsertQuotationTemplates()`, `api/_lib/quotationTemplatesHandler.ts`) to decide
insert/skip/update by the stable `templateCode` natural key.

Indexes (`ensureIndexes()`, `api/_lib/collections.ts`): `templateCode` (unique), `jobTypeCode`,
`isActive`, `isDeleted`. Seed data lives in `api/_lib/templateSeedData.ts`
(`QUOTATION_TEMPLATE_SEEDS`); `seedQuotationTemplatesIfEmpty()` runs defensively from
`GET /api/quotation-templates` whenever the collection is empty, the same self-healing pattern
`seedJobTypesIfEmpty()` established for `job_types` (see above) — `ensureIndexes()`'s one-time
Setup Wizard bootstrap path is unreachable on an already-provisioned deployment.

**Seed content corrected 2026-07-14 (Codex review fix pass, no schema/field-shape change):**
`SC-ACTIVATED-CARBON`'s and `BF-BAG-FILTER`'s "Main Ducting" item was missing a real source
specification row ("Exhaust Duct, Elbow, Flange, Damper and accessories", re-verified against the
source workbook and restored as the item's first `specifications` entry), and 9 real,
non-placeholder literal values (`Brand`/`Material`/`Static Pressure`) were reclassified from
`editableParameters` to plain `specifications` text — see CHANGELOG.md for the full writeup. Both
changes only touch seed *content*, not the `QuotationTemplate` shape above. Since `sourceHash` is
computed over the content-relevant fields, both templates' hash changed — per the idempotent-import
explanation above, the next `POST /api/quotation-templates/import` run against a live database will
report these two as `updated` (an `$set`-update by the stable `templateCode` key), not
`created`/duplicated; the other 3 templates are untouched and will report `skipped`.

**2026-07-15, Template Management pass**: `sourceType`/`productSnapshot` fields added (see above).
Templates created via `POST /api/quotation-templates` or `POST /api/quotation-templates/:id/duplicate`
always get `sourceType: "manual"`, `sourceFileName: ""`/`sourceSheetName: ""` (a duplicate keeps its
source's `sourceFileName`/`sourceSheetName` for provenance, but its own `sourceType` still flips to
`"manual"` — the moment a template is duplicated it can diverge from its original, so it stops being
import-tracked). Editing an existing template's content via `PATCH` never touches
`sourceType`/`sourceFileName`/`sourceSheetName` — an edited `excel_import` template stays labeled
`excel_import`. `version` is never auto-bumped by a content edit; see
[MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) "Versioning" for the practical
rule actually implemented (quote-level snapshotting, not a version-history collection, is what
guarantees existing quotations never change).

**2026-07-15, second Codex-review fix pass**: `sourceWorkbookHash` added (see above) — set on every
`excel_import` template from `api/_lib/templateWorkbookParser.ts`'s real per-sheet fingerprint of
the actual `.xlsx` file, refreshed on every import run. `upsertQuotationTemplates()` compares the
newly-computed hash against the previously-stored one and adds a `TemplateImportReport` warning when
they diverge with `sourceHash` (the seed-content hash) unchanged — i.e. "the workbook itself changed
but nobody has re-transcribed `templateSeedData.ts` yet." `TA-FRP-TANK`/`LI-FRP-LINING` share one
sheet (`"FRP Tank and LI"`) and therefore share one `sourceWorkbookHash` too — a whole-sheet-level
fingerprint, not a row-range-level one. Also this pass: `Quote.templateSnapshot` added (see the
`Quote` schema below) and template item product links (`productId`/`productSnapshot`) are now
resolved/rebuilt server-side from a real `products` record rather than trusted from the client.

**2026-07-20, rolled back**: a generic `TemplateDynamicField` schema (dropdown/radio/checkboxGroup/
text/number, conditional `visibleWhen`, checkboxGroup Included/Excluded generation) plus
`QuotationTemplate.defaultNotes`/`.conditions` and matching `Quote.notes`/`vatConditionText`/
`warrantyText`/`deliveryDays`/`QuoteLine.dynamicFields` fields were added and used to rebuild
`LI-FRP-LINING` as a "v2.0" — this entire schema addition was `git revert`ed the same day per an
explicit rollback request. `LI-FRP-LINING` is back to its original v1.0 content described above; the
schema shapes documented in this file reflect the current (reverted) state, not that removed
addition. See `docs/CHANGELOG.md` "Revert FRP Lining v2.0 / generic Dynamic Fields system" for the
full writeup and MongoDB-compatibility handling.

### `CompanyProfile` — REMOVED 2026-07-14

The `CompanyProfile`/`BankAccount` client types (`src/lib/companyProfiles.ts`), the
`CompanyProfileFields` server type and `companyProfilesCollection()` accessor
(`api/_lib/collections.ts`), and every route/index/invariant that used to be documented in this
section were deleted along with the rest of the Company Profiles module — this ERP only ever needs
one issuer company (Settings → Company Info), so a module for managing several was unused scope.
See [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) for the full removal writeup.

**The `company_profiles` MongoDB collection itself, and any documents already in it, were
deliberately left untouched** — no code reads or writes it anymore, but no destructive database
cleanup was performed as part of this removal. The field shape, default-profile invariant design
(partial unique index on `isDefault`), and index list that used to live in this section are
preserved in git history (`git log -- docs/DATABASE.md`) and in `docs/CHANGELOG.md`'s dated entries
if ever needed for reference against those old documents.

Quote documents saved between 2026-07-13 and 2026-07-14 (the brief window a "Company Profile issues
this quote" feature existed) may still carry a stray, unread `issuerCompanyId`/
`issuerCompanySnapshot` pair — harmless, not backfilled/cleaned up. See TODO.md.

### `Customer` (`src/lib/customers.ts`) — redefined + wired 2026-07-14

```ts
interface Customer {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  projectName: string;
  deliveryAddress: string;
  isActive: boolean;
  isDeleted: boolean;   // soft-delete/archive, same convention as CompanyProfile.isDeleted
  createdAt: string;
  updatedAt: string;
  createdBy: string;    // → User.id
  updatedBy: string;    // → User.id
}
```

Customer master data — who a quotation is issued *to*, selected via the Quotation form's Customer
selector (`src/pages/quotation/CustomerSelector.tsx`) to autofill the Customer Information section
instead of retyping it. Managed via a dedicated admin page (`src/pages/customers/CustomersPage.tsx`,
`customers:view/create/edit/archive` permissions).

**This replaces the earlier (2026-07-09) CRM-flavored `CustomerFields` shape**
(`companyName`/`contactName`/`position`/`phone`/`email`/`address`/`taxId`/`source`/`salesOwnerId`/
`notes`/`status`/`deletedAt`) — that shape had zero API routes/UI/live data (schema-only scaffolding,
per the earlier version of this doc), so this is a clean redefinition, not a migration. The new shape
intentionally mirrors exactly what the Quotation form's Customer Information section collects
(`deliveryMethod`/`projectName`/`deliveryAddress`, not `position`/`source`/`salesOwnerId`/`notes`),
and uses `isActive`/`isDeleted` booleans (matching `CompanyProfile`'s convention) instead of the old
`status: "active"|"inactive"` + `deletedAt: string|null` pair.

Indexes (created defensively inside `api/_lib/customersHandler.ts`, same lazy-on-first-request
pattern as `company_profiles`'/`job_types`' indexes): `{ isDeleted: 1 }`, `{ isActive: 1 }`,
`{ companyName: 1 }`. No seed data — starts empty, per the "no fake customer data" requirement.

**API**: `api/handlers/customers.ts` — its own dedicated handler file as of 2026-07-14. It
originally (2026-07-14, earlier the same day) shared the `company-profiles` serverless function
(`vercel.json` rewrote `/api/customers[/:path*]` to `/api/handlers/company-profiles`, which checked
the raw pathname first and delegated to `handleCustomers()` before falling through to its own
company-profile path parsing) — Vercel Hobby's 12-function cap was already reached by
`company-profiles.ts` at the time. Once the whole Company Profiles module (including that file) was
removed later the same day, the freed function slot went to giving `customers.ts` its own dedicated
file, which is the thin wrapper it is today (see [ARCHITECTURE.md](./ARCHITECTURE.md)); the actual
logic still lives in `api/_lib/customersHandler.ts`'s `handleCustomers()`, unchanged by either move.

`GET /api/customers` returns every customer to a `customers:view` holder (including archived, for
the admin list's own "show archived" toggle), or just active/non-deleted customers to a caller who
only holds `quotations:create` — the same "manage vs. pick-for-a-quotation" carve-out the
now-removed Company Profiles module established for `companyProfiles:view` vs. that same
permission.

### `ScopeOfWork` (`src/lib/scopeOfWork.ts`) — added 2026-07-15, fixed against an independent Codex review the same day

```ts
type ScopeOfWorkStatus = "Draft" | "Final";
// contactName added 2026-07-15, Codex review High Priority fix (was previously dropped entirely).
interface ScopeOfWorkCustomerSnapshot { companyName: string; contactName: string; address: string; taxId: string; phone: string; email: string; projectName: string; }

// ── quotes.contacts (2026-09-07) ────────────────────────────────────────────────────────────────
// interface QuoteContact { id: string; name: string; position: string; phone: string; email: string }
// Quote.contacts?: QuoteContact[]   — every contact person on the quotation, max 10.
// ABSENT on every document written before 2026-09-07; no migration. Readers call quoteContactsOf(),
// which turns the legacy trio into one contact. The legacy trio contactName/contactPhone/contactEmail
// is ALWAYS equal to contacts[0] and is written by the server (applyContactMirror in
// api/handlers/quotes.ts) — never by the client — so Scope of Work / AR / search keep reading it.
// customerSnapshot does NOT carry contacts (it mirrors the nine Customer-master fields).
// ChecklistOption/ChecklistGroup moved to src/lib/documentRequirements.ts on 2026-07-16 (re-exported
// here for compatibility). Quotation briefly gained its own `checklistGroups` field the same day,
// then had it removed again later the same day per an explicit business decision ("make Quotation
// fields optional, remove Document Requirements and Delivery") — this shared type/model still
// exists and is still fully used by Scope of Work, just no longer by Quotation.
interface ChecklistOption { key: string; label: string; checked: boolean; }
interface ChecklistGroup { key: string; title: string; selectionType: "single" | "multiple"; options: ChecklistOption[]; note?: string; }
interface ScopeOfWorkSpecLine { id: string; text: string; }
interface ScopeOfWorkItem {
  id: string; name: string; specifications: ScopeOfWorkSpecLine[]; quantity: number | null;
  unit: string; remark: string; isSectionHeader?: boolean;
}
// installments replaced the previous fixed {downPaymentPct, finalPaymentPct, method} pair on
// 2026-07-23 — arbitrarily many rows, each with its own label/paymentType/days, so a genuine
// 3+-installment plan with mixed payment terms is representable. paymentType is a structured
// Cash/Credit dropdown (not free text, per a same-day follow-up request), days an optional integer
// day count applying to either type. A pre-2026-07-23 record (either the very first fixed pair, or
// the same-day intermediate shape with a free-text `method` string) is read-compatible via
// normalizePaymentConditions() in src/lib/scopeOfWork.ts until next saved.
type ScopeOfWorkPaymentType = "" | "Cash" | "Credit";
interface ScopeOfWorkPaymentInstallment { id: string; pct: number | null; label: string; paymentType: ScopeOfWorkPaymentType; days: number | null; }
interface ScopeOfWorkPaymentConditions { installments: ScopeOfWorkPaymentInstallment[]; description: string; notes: string; }
interface ScopeOfWorkSignatory { name: string; userId: string; date: string; }
interface ScopeOfWork {
  id: string; scopeNumber: string; yearMonth: string; jobSequence: number; secondaryCode: string;
  quotationId: string; quotationNumber: string; jobTypeCode: string; jobTypeName: string;
  // quotationSalesperson added 2026-07-15, Codex review High Priority fix — frozen copy of
  // quote.salesperson, distinct from the editable `seller` signatory below.
  quotationSalesperson: string;
  issueDate: string; deliveryDate: string; drawingCode: string; customerPoNumber: string;
  // additionalQuotationNumbers/additionalPoNumbers added 2026-08-31 — one Scope of Work can cover
  // more than one quotation and more than one customer PO. **The singular fields above stay the
  // "primary" number** and are the only ones anything else keys off: `quotationNumber` is
  // server-derived from the source quotation, `customerPoNumber` is what the dashboard's "ยังไม่มี
  // PO" count (`$in: [null, ""]` — which does NOT match `[]`) and the list badge test, and what
  // `POST /refresh` re-pulls from `Quote.poRef`. The editor presents both as one list and always
  // writes the first entry into the singular field, so a blank primary genuinely means "no number".
  // **Optional with no migration**: a record written before 2026-08-31 has no such key at all and
  // reads back as [] via `normalizeScope()`/`toListItem()`, exactly like `attachments` before it.
  additionalQuotationNumbers: string[]; additionalPoNumbers: string[];
  customerSnapshot: ScopeOfWorkCustomerSnapshot; deliveryLocation: string;
  shippingContact: string; shippingPhone: string; billingContact: string; billingPhone: string;
  checklistGroups: ChecklistGroup[]; items: ScopeOfWorkItem[];
  paymentConditions: ScopeOfWorkPaymentConditions;
  // documentRecipients added 2026-07-23: documentsToSend option key -> picked User.id[]. Since
  // 2026-08-07 the checklist-independent "additional" key ("ผู้รับเพิ่มเติม", any user, always sent)
  // is also valid — full key list is ALL_RECIPIENT_KEYS. See MODULES/ScopeOfWork.md "Document Recipients".
  documentRecipients: Record<string, string[]>;
  // documentRecipientMessage added 2026-07-23 (same-day third pass): free text, rendered above the
  // auto-generated summary in the "ส่งอีเมลแจ้งผู้รับเอกสาร" email. Unlike revisionNote below, this
  // IS carried over on Duplicate/Rewrite (via ...rest, same as documentRecipients itself). See
  // MODULES/ScopeOfWork.md "Document Recipients".
  documentRecipientMessage: string;
  // revisionNote added 2026-07-23: free text, always "" on create/Duplicate/fresh Rewrite, never
  // inherited from the source record. See MODULES/ScopeOfWork.md "Revision Note".
  revisionNote: string;
  remarks: string;
  seller: ScopeOfWorkSignatory; approver: ScopeOfWorkSignatory;
  status: ScopeOfWorkStatus; version: number;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; isDeleted: boolean;
}
```

**2026-07-15, Codex review fix pass** (0 Critical, 3 High Priority found and fixed — see
`docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status"): `customerSnapshot.contactName` and the new
top-level `quotationSalesperson` field close the review's "quotation contact/salesperson dropped
from the snapshot" finding; `secondaryCode` is now required (non-empty) at creation time, closing
the "job code's 4th segment always blank" finding; `GET /api/search` gained a `scopeOfWorks` result
group, closing the "no Global Search integration" finding. See
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) for the full writeup.

A printable job document generated from an existing quotation, reproducing the printed structure of
the reference PDF ("Scope Of Work PQ202607-174-LI-SK บริษัท เค ไทย ไฮดรอลิค จำกัด.pdf", `public/`) —
see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) for the full PDF-to-field mapping, checklist
group definitions, and scope-number format. Created from `POST /api/scope-of-works {quotationId}`,
which copies (never live-references) the quotation's customer info/items/Job Type/PO into
`customerSnapshot`/`items`/`jobTypeCode`/`customerPoNumber` — editing a Scope of Work never modifies
its source quotation, and later edits to the quotation/customer/product master data never silently
change an already-created Scope of Work (an explicit "อัปเดตข้อมูลจากใบเสนอราคา" action, `POST
/:id/refresh`, re-pulls only the quotation-derived fields on demand).

`scopeNumber` is **typed manually by the user since 2026-07-29** (owner decision, completely
free-form — no format guardrails): required non-blank at creation and on Duplicate, unique across
all records (friendly 409 pre-check + the unique index as the race-safe backstop; soft-deleted
records still block their number's reuse), editable **while Draft only**, and permanently locked
once Final; Rewrite still auto-appends `-R{n}` to whatever was typed. The pre-2026-07-29
auto-generated format (`PQ{yearMonth}-{jobSequence}-{jobTypeCode}-{secondaryCode}`, e.g.
`PQ202607-174-LI-SK`) survives unchanged on old records. `yearMonth`/`jobSequence` are **legacy
fields**: real values on old records, `""`/`0` on new ones (the atomic `scope_{yearMonth}` monthly
counter is retired; its documents in `counters` are orphaned, harmless). `secondaryCode` is now an
optional free-text legacy reference field (`รหัสอ้างอิงท้ายงาน`), blank on new records — no longer
part of the number, and editing it (or moving `issueDate` across a month boundary) no longer
recomputes anything. See "Scope Number / Job Code" in
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

`checklistGroups` reproduces the reference PDF's printed checkbox/radio groups (Safety, TOR/
Requirement from customer, เอกสารส่งถึง, ปจ.2, งานขนส่ง, Logo, Name plate, Test Report — split into
`testReportType`/`testReportLevel`, เงื่อนไขการวางบิล, เงื่อนไขการส่งมอบงาน) as a reusable,
Job-Type-agnostic structure (`buildDefaultChecklistGroups()`, now in `src/lib/documentRequirements.ts`)
— every option starts unchecked except two Job-Type-driven suggestions the spec explicitly named
(`LI` → `testReportType.frpLining`, `TA` → `testReportType.frpTank`), both still freely editable. A
`PATCH` can only toggle `checked`/set a group's optional `note` — group/option `key`s, `title`s, and
`selectionType` are always matched against the record's own already-persisted structure, never
trusted from the client, so a direct API call can't inject a new group or rename a label.

**2026-07-16, required-field validation pass**: 8 of these 11 groups (`safety`, `transportation`,
`logo`, `billingConditions`, `documentsToSend`, `namePlate`, `deliveryDocFormat`, `pj2`) are now
mandatory — at least one option must be checked before Finalize/Print (`validateChecklistGroups()`,
`src/lib/documentRequirements.ts`); `torRequirement`/`testReportType`/`testReportLevel` remain
optional. A plain "อื่น ๆ" option was added to `safety`/`transportation`/`namePlate`/
`documentsToSend` (Logo already had "Etc.") so the spec's "selecting Other requires a detail" rule
has something to validate against — selecting it (or, for `safety`, its "TOR" option) makes the
group's `note` required too. See "Required-Field Validation" in
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

**2026-07-16, Codex review fix pass (same day)**: fixed 2 High Priority defects the review found —
(1) each of the four groups above now also initializes `note: ""` in `buildDefaultChecklistGroups()`
(previously only Logo did, so `ChecklistGroupCard` — which only renders its detail input when
`note !== undefined` — never actually showed the input for the other three, making the "Other
requires detail" rule unsatisfiable from the normal UI even though the validator already enforced
it); `withDefaultChecklistGroups()` also backfills the missing `note` onto an already-saved record.
(2) Creating a Scope of Work briefly deep-copied the source quotation's own `checklistGroups`
(checked options + notes) instead of resetting to `buildDefaultChecklistGroups()`. **Superseded
later the same day**: Quotation's `checklistGroups` field was removed entirely (see the Quote
interface below and "Deliberate scope decisions" in CHANGELOG.md) — `deriveFromQuotation()` now
always calls `buildDefaultChecklistGroups(jobTypeCode)`, the same as before either of these two
same-day changes. See "Snapshot Behavior" in [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

`items` starts as a 1:1 copy of the source quotation's `QuoteLine[]` (`mapLineToScopeItem()`) —
`description`→`name`, `subDetails[]` → `specifications: ScopeOfWorkSpecLine[]`, `qty`/`unit` →
`quantity`/`unit`, `isSectionHeader` preserved for template-section dividers. **2026-07-21**:
`QuoteLine.notes`/`.specifications` were removed entirely (see the `QuoteLine` interface above) —
`remark` now starts blank instead of seeding from `line.notes`, and the former `specifications`
(string, newline-split) source is gone, but its content already reaches `subDetails` upstream (see
`applyTemplate.ts`/[MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md)), so no
customer-visible data is actually lost. **Deliberately never copies** `unitPrice`/`discount`/`tags` — Scope
of Work never shows pricing (no unit price/discount/VAT/grand total anywhere in the document or its
print output). Fully independently editable afterward (add/remove/duplicate/reorder items, add
specification lines) — never writes back to the quotation.

Indexes (`ensureIndexes()`, `api/_lib/collections.ts`): `scopeNumber` (unique — since 2026-07-29
**the** uniqueness mechanism for the now-manually-typed numbers), `quotationId`, `status`,
`isDeleted`. The old `{yearMonth, jobSequence}` unique index is no longer created and is dropped
defensively at runtime by `ensureScopeNumberIndexes()` (`api/_lib/scopeOfWorkHandler.ts`) — new
records all write `{"", 0}` there, which that index would reject from the second record onward
(the same function also defensively *creates* the unique `scopeNumber` index, since the
Setup-Wizard-only `ensureIndexes()` never runs on an already-provisioned deployment).

### `DeliveryOrder` (`src/lib/deliveryOrder.ts`) — added 2026-07-23

```ts
interface DeliveryOrderItem {
  id: string; name: string; quantity: number | null; unit: string;
  specifications: { id: string; text: string }[];
}
interface DeliveryOrderInstallment {
  id: string;              // mirrors the source ScopeOfWorkPaymentInstallment's id
  pct: number | null; label: string; paymentType: "" | "Cash" | "Credit"; days: number | null;
  itemIds: string[];        // which DeliveryOrderItem ids are ticked for this installment's page
  documentNumber: string;   // "เลขที่" — blank by default
  issueDate: string;        // "วันที่" — blank by default, yyyy-mm-dd
  remark: string;           // "Remark:" footer, auto-drafted, freely editable
}
interface DeliveryOrder {
  id: string; scopeOfWorkId: string; scopeNumber: string; quotationId: string;
  customerCompanyName: string; customerAddress: string;
  items: DeliveryOrderItem[]; installments: DeliveryOrderInstallment[];
  status: "Draft" | "Final"; version: number;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; isDeleted: boolean;
}
```

A printable document generated from an existing Scope of Work, reproducing the printed structure of
the reference PDF ("ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM บริษัท อีจ.pdf", `public/`) — see
[MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md) for the full writeup. Created from `POST
/api/delivery-orders {scopeOfWorkId}`, which snapshots (never live-references) the Scope of Work's
customer info (itself already sourced from the Quotation) and items into `customerCompanyName`/
`customerAddress`/`items` — editing a Delivery Order never modifies its source Scope of Work, and
later edits to the Scope of Work never silently change an already-created Delivery Order (an
explicit "อัปเดตข้อมูลจาก Scope of Work" action, `POST /:id/refresh`, re-pulls on demand and
reconciles `installments` against the Scope of Work's current payment schedule by installment `id`).
No uniqueness constraint on `scopeOfWorkId` — same non-enforced "usually just one" convention Scope
of Work itself has relative to its own quotation.

Indexes (`ensureIndexes()`, `api/_lib/collections.ts`): `scopeOfWorkId`, `status`, `isDeleted`.

### `Quote` / `QuoteLine` / `SubDetail` (`src/lib/quotes.ts`)
```ts
type QuoteStatus =
  | "ร่าง"              // Draft
  | "รออนุมัติ"          // Pending Approval
  | "อนุมัติแล้ว"        // Approved
  | "ส่งให้ลูกค้าแล้ว"    // Sent to Customer
  | "ลูกค้ายอมรับ"       // Customer Accepted
  | "ปิดการขายสำเร็จ"    // Won
  | "ลูกค้าปฏิเสธ"       // Customer Rejected
  | "เสียโอกาส"          // Lost
  | "ยกเลิก";            // Cancelled (reachable from Draft/Pending/Approved)
type QuoteInterest = "น่าสนใจ" | "ไม่น่าสนใจ" | null;

type ApprovalAction = "submitted" | "approved" | "rejected" | "sent_to_customer"
  | "customer_accepted" | "customer_rejected" | "marked_won" | "marked_lost" | "cancelled";

interface ApprovalHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  action: ApprovalAction;
  comment: string;    // required for rejected/customer_rejected/cancelled, optional otherwise
  createdAt: string;
}

interface SubDetail {
  id: string;
  text: string;
}

interface QuoteLine {
  id: number;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;    // line-level discount — % or baht, per `discountMode`
  discountMode?: DiscountMode;  // added 2026-08-25; "percent" | "amount". ABSENT MEANS "percent"
  tags: string[];
  subDetails: SubDetail[];  // pinned rows in the editor; a product's Product.specifications or a
                             // Quotation Template item's specifications fold in here on add/apply
  isSectionHeader?: boolean;  // added 2026-07-14 — a non-priced section-divider line, copied from a QuotationTemplate section title
}
// 2026-07-21: `notes: string` and `specifications: string` were removed entirely — an unused
// feature, per direct user request (see CHANGELOG.md). Old documents in MongoDB may still carry
// these two fields with real string values (no migration/deletion ran), but the app no longer reads
// or writes them anywhere — accepted, not a bug. `Quote.remarks` (below, a document-level field) is
// unrelated and unaffected.

interface Quote {
  id: string;                 // "Q#260814-0001" style (Bangkok-local YYMMDD + daily sequence), generated by nextQuoteId()
  client: string;
  date: string;                 // display string, not a real Date
  valid: string;                 // display string, not a real Date
  amount: number;                 // snapshot of computed total at last save — VAT-included grand total; no separate pre-tax field is stored, see "Dashboard KPI/chart aggregation" below
  status: QuoteStatus;
  salesperson: string;          // real per-quote field; defaults to the signed-in user's name on new quotes
  interest: QuoteInterest;
  lines: QuoteLine[];
  discount: number;               // quote-level "ส่วนลดพิเศษ" — % or baht, per `discountMode`
  discountMode?: DiscountMode;    // added 2026-08-25; "percent" | "amount". ABSENT MEANS "percent"
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  deliveryAddress: string;
  project: string;
  poRef: string;
  paymentTerms: string;
  issueDate: string;    // yyyy-mm-dd
  expiryDate: string;   // yyyy-mm-dd
  remarks: string;       // real per-quote field now (see Known Issues below) — defaults to Company.termsAndConditions only for brand-new quotes
  jobTypeCode: string;               // added 2026-07-10, → JobType.code, "" = unclassified (incl. every quote created before this field existed)
  jobTypeName: string;               // added 2026-07-10, snapshot of JobType.name at save time
  isPotentialOpportunity: boolean;   // added 2026-07-10 — sales-marked "likely to close", feeds Dashboard's Expected Sales KPI/forecast
  followUpDate: string;              // added 2026-07-10, yyyy-mm-dd, "" = no follow-up scheduled
  revisionNote: string;              // added 2026-07-23, free text, always "" on create/Duplicate/fresh Rewrite, never inherited from the source — see MODULES/Quotation.md "Business Flow" item 6b
  createdByUserId: string;             // → User.id, "" for legacy/seed quotes (any editor treated as owner)
  updatedBy: string;                   // → User.id, added 2026-07-09 — set server-side on every plain edit or workflow action, "" until first edit
  approvalHistory: ApprovalHistoryEntry[];  // append-only
  customerId?: string;                  // added 2026-07-14, → Customer.id; set when a saved customer is selected on the Quotation form
  customerSnapshot?: CustomerSnapshot;  // added 2026-07-14 — server-built copy of the submitted Customer Information fields, never client-constructed; shape below
  quotationTemplateId?: string;         // added 2026-07-14, → QuotationTemplate.id; set only at create time via the Create Quotation wizard, never editable afterward
  quotationTemplateName?: string;       // added 2026-07-14 — server-derived snapshot of QuotationTemplate.templateName at create time, never client-writable
  quotationTemplateVersion?: string;    // added 2026-07-14 — server-derived snapshot of QuotationTemplate.version at create time, never client-writable
  templateSnapshot?: {                  // added 2026-07-15 (second Codex-review fix pass) — real structured copy, server-built, frozen at create time, never read by any rendering path (PDF/editor still only read `lines`)
    sections: TemplateSection[];
    defaultTerms: TemplateTermLine[];
    internalNotes: string[];            // deliberately included here (unlike `lines`) — pure internal audit record, gated by the same quote permissions, never rendered
    sourceHash: string;
    capturedAt: string;
  };
  // checklistGroups (a "ข้อกำหนดเอกสารและการส่งมอบ" section) briefly existed here 2026-07-16, then
  // was removed the same day per an explicit business decision — see "Required-Field Validation" in
  // MODULES/Quotation.md and CHANGELOG.md. A quote saved during that ~1-day window may still carry
  // a stray checklistGroups property in MongoDB; it's simply never read by any current code path.
}

// The frozen-at-save-time copy stored on Quote.customerSnapshot (src/lib/customers.ts) — built
// server-side from the quotation's own Customer Information field values (client/contactName/
// contactPhone/contactEmail/address/taxId/deliveryMethod/project/deliveryAddress), whether they came
// from an autofilled Customer or were typed manually. Field names mirror Customer's own field names.
interface CustomerSnapshot {
  companyName: string; contactName: string; phone: string; email: string; address: string;
  taxId: string; deliveryMethod: string; projectName: string; deliveryAddress: string;
}
```
**`discountMode` (added 2026-08-25, both on `Quote` and on each `QuoteLine`)** is deliberately
**optional with no migration**: every quotation written before 2026-08-25 has no such field, and an
absent `discountMode` is read as `"percent"` everywhere — the unit those numbers already meant — so
historical totals are byte-identical to what they were. It is only ever written when the client
actually chose a unit (`POST /api/quotes` spreads it in conditionally), so untouched old documents
stay untouched. Line-level and document-level modes are independent of each other. The single
implementation of the resulting math is `src/lib/quoteMath.ts`, re-exported by
`api/_lib/quoteAmounts.ts` — see [MODULES/Quotation.md](./MODULES/Quotation.md) "Discount unit
(% / ฿)". Bounds differ per unit (`api/_lib/quoteValidation.ts`): a percentage is capped at 100, a
baht amount is bounded like any other money field, and an over-large baht discount clamps the base
to zero rather than producing a negative total.

All document fields below `discount` were hardcoded placeholder text on the form until 2026-07-08 (see [CHANGELOG.md](./CHANGELOG.md)) — they are now real, per-quote, controlled data. Empty ones are auto-hidden in the print/PDF view rather than printing a blank row (see [UI_GUIDELINES.md](./UI_GUIDELINES.md) Print/PDF section). `createdByUserId`/`approvalHistory` were added 2026-07-08 for the approval workflow — see [RBAC.md](./RBAC.md). `contactEmail`/`deliveryMethod`/`deliveryAddress`/`project`/`remarks` were added 2026-07-09 for the print/PDF redesign — `remarks` in particular fixes a latent bug where the "หมายเหตุ / เงื่อนไข" textarea was `defaultValue`-only (uncontrolled, never saved); it's now a real controlled field like the rest. `updatedBy` was added 2026-07-09 for the production-readiness audit-field requirement — deliberately excluded from `QuoteUpdateFields` (the client-writable field set), only ever set server-side from the authenticated session. `customerId`/`customerSnapshot` (added 2026-07-14, replacing the short-lived `issuerCompanyId`/`issuerCompanySnapshot` pair from 2026-07-13) are set by `POST /api/quotes` and (Draft-only, for `customerId` specifically) `PATCH /api/quotes/:id`/`POST /api/quotes/:id/workflow` — see `resolveCustomerIdUpdate()`/`buildCustomerSnapshot()` in `api/handlers/quotes.ts`, and [MODULES/Customer.md](./MODULES/Customer.md). `quotationTemplateId`/`quotationTemplateName`/`quotationTemplateVersion` (added 2026-07-14) are frozen provenance metadata set only by `POST /api/quotes` when a quote is created from the Create Quotation wizard's Preview step — the client sends only `quotationTemplateId`; `quotationTemplateName`/`quotationTemplateVersion` are always re-derived server-side from the matched `quotation_templates` record (`validateQuotationTemplate()` in `api/_lib/quoteValidation.ts`, mirroring `validateJobType()`), never trusted from the client, and structurally excluded from `PATCH /api/quotes/:id`'s field whitelist so they can never change after creation. All three are optional — a quote created without the wizard (or before this feature existed) simply has them `undefined`. `QuoteLine.isSectionHeader` (added 2026-07-14) similarly defaults to `undefined`/falsy on every pre-existing line — see [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) "Template → Quote Snapshot Semantics." `checklistGroups` existed briefly (added 2026-07-16, removed the same day per an explicit business decision to make Quotation fields optional and remove its "ข้อกำหนดเอกสารและการส่งมอบ" section) — see "Required-Field Validation" in [MODULES/Quotation.md](./MODULES/Quotation.md) and CHANGELOG.md.

Indexes added 2026-07-09 (`quotes` had none beyond default `_id` before this): `{ status: 1 }`, `{ createdByUserId: 1 }` (already used for ownership checks), `{ issueDate: 1 }` (needed for the Dashboard's monthly revenue aggregation — see below). Added 2026-07-10: `{ jobTypeCode: 1 }`, `{ salesperson: 1 }`, `{ followUpDate: 1 }`, serving the Dashboard filters/grouping; later the same day, `{ isPotentialOpportunity: 1 }` and `{ client: 1 }` (Expected Sales/forecast filtering and customer-analytics grouping, respectively — both already-hot query paths that had no supporting index). No soft-delete field — the `ยกเลิก` (Cancelled) terminal workflow status already serves that role, so a `createdAt`/`updatedAt`/`isDeleted`/`department` index (all requested by a generic Dashboard index checklist) would be moot: `Quote` has no `createdAt`/`updatedAt` fields (`issueDate`/`date`/`updatedBy` serve that role instead) and no `isDeleted`/`department` field at all (`User.department`, itself free text, is what Dashboard department filtering actually joins against — see below).

**Compound indexes added 2026-07-10 (Codex review, third pass)**: `{ salesperson: 1, issueDate: 1 }`, `{ status: 1, issueDate: 1 }`, `{ followUpDate: 1, status: 1 }`, `{ isPotentialOpportunity: 1, status: 1, expiryDate: 1 }` on `quotes` — every real Dashboard query combines two or more of these fields, which the pre-existing single-field indexes couldn't serve efficiently on their own. Also `audit_log` gained `{ userName: 1, createdAt: -1 }`, supporting the newly filter-aware Activity Timeline query (see below).

**Local-dev index provisioning caveat**: `ensureIndexes()` in `api/_lib/collections.ts` only ever runs from the one-time Setup Wizard bootstrap (`api/handlers/auth.ts`), which is permanently unreachable on an already-provisioned deployment — so any index added there after go-live never actually gets created against a live production database. Every index added in the second and third 2026-07-10 passes is instead created defensively (idempotent `createIndex`, once per warm serverless instance) directly inside `GET /api/dashboard`'s handler — the same pattern `seedJobTypesIfEmpty()` already uses for the same reason (see its comment in `api/_lib/systemSeed.ts`). Any *new* Dashboard-only index should follow this pattern, not `ensureIndexes()`, unless a real re-provisioning path is built.

### `counters` — added 2026-07-10

Backs atomic sequence generation (`nextQuoteId()` in `api/handlers/quotes.ts`), replacing the previous scan-all-`_id`s-then-max+1 approach flagged by the 2026-07-10 Codex review as race-prone under concurrent creates. One document per sequence, keyed by a literal string `_id` (e.g. `"quote_2567"`):
```ts
interface CounterFields {
  _id: string;   // sequence name, e.g. "quote_2567"
  seq: number;
}
```
Lazily bootstrapped from the current max existing `_id` (via `$max`, idempotent under a concurrent-bootstrap race) the first time it's needed after this fix shipped — not backfilled by a migration script, since the bootstrap is self-healing on first use.

Also backs the same-collection Scope of Work per-month job sequence (`scope_{yearMonth}`, see the
`scope_of_works` section above) and, **added 2026-07-22**, the Quotation Rewrite/Revision feature's
per-chain revision number (`quote_revision_{rootQuoteId}`, e.g. `"quote_revision_Q#260814-0001"`) —
`nextRevisionNumber()` in `api/handlers/quotes.ts`, same `findOneAndUpdate($inc, upsert)` idiom, no
bootstrap needed since it's a brand-new counter namespace with no pre-existing `-R`-suffixed quotes
to reconcile against. Note there is **no new field anywhere on `Quote`** for the revision
relationship — the new quote's `_id` itself (`{root}-R{n}`) is the only record of which quote it's a
revision of; the root is recovered by stripping a trailing `-R\d+` suffix, never stored separately.

**2026-07-22, same day**: the `-R\d+` suffix parsing (`getRevisionRoot()`/`getRevisionNumber()`) was
extracted into a shared `api/_lib/quoteRevisions.ts` so `api/dashboard/index.ts` could reuse it too —
every Dashboard quote-count/-value aggregate now collapses a rewrite chain (root + every `-R{n}`) to
one entry (its latest revision) via `dedupeQuotesByRevisionChain()` before counting/summing, fixing a
real double-counting bug a user reported directly. See
[MODULES/Dashboard.md](./MODULES/Dashboard.md) "Revision Chain De-duplication."

**2026-08-17/18**: also backs the Accounting document numbering — one counter per prefix per
Bangkok-local **Buddhist-year** month: `ar_{yy}{mm}` / `iv_{yy}{mm}` / `bi_{yy}{mm}` /
`re_{yy}{mm}` (RE added 2026-08-18), e.g. `"ar_6908"` → `AR6908002`. `nextArDocNumber()` in
`api/_lib/documentNumbering.ts`, same `findOneAndUpdate($inc, upsert)` idiom; the month rollover is
safe because the key string itself changes. Covered by `tests/api/arNumbering.test.ts`.

### Dashboard KPI/chart aggregation (`GET /api/dashboard`, added 2026-07-09, majorly expanded 2026-07-10, completed against the full business spec later the same day)

Read-only, no collection of its own — see [MODULES/Dashboard.md](./MODULES/Dashboard.md) for the full widget-by-widget breakdown. Key data-model notes:
- Accepts `?from=yyyy-mm-dd&to=yyyy-mm-dd&salesperson=<name|all>&department=<name|all>` query params — `from`/`to` filter against `Quote.issueDate` (lexicographic string comparison), `salesperson` is an exact match against the free-text `Quote.salesperson` field, `department` resolves to the set of `User.fullName` whose `User.department` matches (free-text join — see MODULES/Dashboard.md caveats) and composes with an also-selected `salesperson` via `$and` rather than one silently overwriting the other.
- Almost every section is computed by fetching the filtered `quotes` set **once** (a lean projection — as of 2026-07-14 including `lines`/`discount`, see the pre-tax note below) and reducing it in plain JS, rather than a dozen separate fine-grained aggregation pipelines — deliberate, matching the pre-existing `revenueByMonth`/`categoryBreakdown` post-processing style, and appropriate at this data volume (one internal company's quotations, not big-data scale). Revisit if data volume ever justifies moving this to pure `$group` pipelines or a cache layer.
- **Every monetary total is pre-tax (before VAT)** (2026-07-14, P'Keng/P'Kee requirement; **reworked the same day** to compute from an authoritative source). `Quote.amount` is the persisted VAT-included grand total (see the `amount` field note below) — `Quote` has no separate stored pre-tax/subtotal field, so the before-VAT figure is recomputed directly from each quote's own `lines`/`discount` via the shared `computeQuoteAmountBeforeVat()` (`api/_lib/quoteAmounts.ts`, also used by `api/_lib/quoteValidation.ts` to derive the persisted `amount` on create/edit) — **not** by dividing `amount` back down by a fixed VAT rate, which the first version of this pass did (`preTaxAmount(amount) = amount / 1.07`, since replaced). Applied once to the filtered `docs` array right after fetch — every downstream KPI/pipeline/salesPerformance/customerAnalytics/jobTypeAnalytics/forecast/`approvalDashboard.pendingList` computation derives from `docs`, so this single normalization covers all of them; `revenueTrend`/`revenueByMonth` and `followUps`, which read from separate queries (`wonRevenueDocsRaw`/`followUpDocsRaw`, both also projecting `lines`/`discount` now), call the same helper explicitly at their own read sites. Every quote has carried real `lines`/`discount` data since the 2026-07-08 rewrite, so this should always be computable in practice. **Correction (2026-07-14, Codex review Medium finding)**: an earlier draft of this note overstated that as "no legacy-data fallback case exists" — a doc whose `lines` field is entirely absent (not merely empty) still computes to a silent `$0` via `q.lines ?? []` rather than crashing or falling back to the VAT-included `amount`; see [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Pre-Tax Amount Rule" for the full data-quality note and the `console.warn` telemetry that now flags this if it ever occurs.
- `totalCustomers`/`totalLeads`: `countDocuments({ deletedAt: null })` on `customers`/`leads` — always `0` today (module not built yet), which is correct per the "empty database → display 0" requirement, not a placeholder.
- `wonDeals`/`lostDeals`: quotes with `status: "ปิดการขายสำเร็จ"` / `"เสียโอกาส"`. `ลูกค้าปฏิเสธ` (Customer Rejected) is a distinct terminal status and is **not** counted as "lost" — only quotes actually marked `เสียโอกาส` are.
- `activeQuotations`/`nonActiveQuotations`/`expiredQuotations` (Non-Active added 2026-07-10, second pass): Active = non-terminal status *and* not past `expiryDate`; Non-Active = Cancelled/Customer Rejected, **or** non-terminal-but-expired; Expired = the narrower "still non-terminal but past its own expiry date" subset (kept as its own KPI alongside the broader Non-Active bucket, not replaced by it). **Lost is deliberately excluded from Non-Active** (fixed 2026-07-13, eighth same-day pass) — it previously counted in both `lostDeals` and `nonActiveQuotations`, which made `QuotationStatusSummary`'s 4-row donut/percentage table double-count Lost quotes (rows summed to more than `totalQuotations`). With Lost excluded, Won + Lost + Active + Non-Active are a true partition of every quote status — see `NON_ACTIVE_OUTCOME_STATUSES`'s comment in `api/dashboard/index.ts`.
- `pendingApprovals` (KPI, added 2026-07-10 second pass): a plain count of quotes with `status: "รออนุมัติ"`, visible to **any** `dashboard:view` holder — distinct from `approvalDashboard.pendingList`, the actionable list gated behind `quotations:approve`.
- `newCustomers`/`repeatCustomers`, and the Customer Analytics section generally, group by the free-text `Quote.client` string — **name variations/typos will undercount repeat customers** until a real `Customer` entity exists that quotes reference by ID instead of free text (tracked in TODO.md). Documented, not silently assumed.
- `salesPerformance`/`customerAnalytics`/`jobTypeAnalytics` each expose **both** `totalValue` (every quotation regardless of outcome) and `revenue` (Won-only) — added 2026-07-10 second pass; previously only the Won subset was exposed, under-reporting the business spec's required "Total Quotation Value" column. `jobTypeAnalytics` is zero-filled against the active `job_types` master list (not just codes present in the current filtered set), so a job type with no quotes this period is a real, visible zero row rather than silently missing; any code on a real quote that isn't in the active master list (deactivated job type, legacy data) is still appended.
- `closingDurationDays()` (feeds `averageClosingTime` and `avgClosingTime`) matches the terminal `marked_won` **or** `marked_lost` approval-history entry (fixed 2026-07-10 second pass — previously Won-only, undercounting the business spec's "average time between quotation creation and Won/Lost status").
- The sales pipeline's stage-to-stage `conversionFromPrevious` uses an explicit predecessor map (`PIPELINE_PREDECESSOR` in `api/dashboard/index.ts`) mirroring `workflowTransitions` in `api/_lib/quoteWorkflow.ts` — **not** simple array-adjacency, since the workflow branches (Sent to Customer → either Customer Accepted or Customer Rejected) and array-adjacent stages aren't always true predecessors.
- `forecast` (thisMonth/thisQuarter/thisYear) is a **live weighted estimate** — open `isPotentialOpportunity` quote value falling in each period, multiplied by the trailing-12-month win rate — recomputed on every request, never stored. No `forecast` collection.
- `salesActivity` (added 2026-07-13, sixth same-day pass; extended with `bySalesperson` in the seventh same-day pass) reads from `audit_log`, bucketed by `categoryForAction()` into 5 categories (created/edited/statusChanged/approvalRequested/approvalCompleted) across weekly/monthly/quarterly/yearly windows. `salesActivity.bySalesperson.{weekly,monthly,quarterly,yearly}` additionally buckets by `(period, salesperson)` for Created/Edited only (the 2 event types the P'Keng/P'Kee requirement names) — built via a nested `Map<period, Map<salesperson, counts>>`, deliberately **not** a joined/split string key (`` `${period} ${salesperson}` ``), since Thai full names routinely contain a space (e.g. "สมชาย ธนากร") which a naive split would silently truncate. Only non-zero `(period, salesperson)` rows are returned — no zero-row explosion across every period × every salesperson. **2026-07-14 (Codex-review fix pass)**: two changes — (1) no longer gated by `auditLog:view` — an independent review found this Critical, since it hid the required section from every default role except those with full audit-log access; it's now computed for any `dashboard:view` caller, same as every other required field, while `activityTimeline` (the literal audit-log feed) correctly keeps its `auditLog:view` gate. (2) the query now bounds `createdAt` by `bangkokDayBoundsUtc(from, to)` whenever a date filter is selected — previously an unconditional full-history scan regardless of the selected range, flagged High Priority. When no date filter is selected, it remains an unbounded rolling scan (same convention as `revenueTrend` below) — periods before `from` (when set) now correctly zero-fill for real instead of the UI caption merely claiming they're excluded.
- `activityTimeline` reads from `audit_log`, now including each entry's `relatedQuoteId`/`relatedCustomerName` when present (2026-07-13, seventh same-day pass); `approvalDashboard` (stat tiles + the actionable `pendingList`) is derived from the filtered quotes' `approvalHistory`. Both are `null` in the response (and hidden entirely by the frontend) when the caller lacks `auditLog:view` / `quotations:approve` respectively — a permission check via `roleHasPermission()`, not a second `requirePermission()` call, layered the same way ownership checks already are elsewhere in the API. `approvalDashboard.canReject` additionally reflects `quotations:reject`, since the two approval-workflow permissions aren't guaranteed to travel together on a custom role. (`salesActivity` used to share this same `auditLog:view` gate — see the note above for why it no longer does.)
- **No soft-delete predicate on Dashboard quote queries — by design, not an oversight** (2026-07-14, Codex-review fix pass, addressing a High Priority finding). `Quote`/`QuoteFields` has **no** `isDeleted` or equivalent field anywhere in its schema — quotations are only ever removed from "active" via the `ยกเลิก` (Cancelled) status, never a soft-delete flag. Every Dashboard quote query (`fullMatch`, `salespersonOnlyMatch`, and the won-revenue/follow-up/client-count/distinct-salesperson queries in `api/dashboard/index.ts`) deliberately has no `isDeleted` filter, since adding one on a field that can never be set would be dead code implying a deletion feature that doesn't exist. If a real soft-delete field is ever added to `Quote`, every one of those queries must be updated together — tracked in TODO.md.
- `revenueTrend` (added 2026-07-10 second pass, replaces the old `revenueByMonth`-only shape as the primary series — `revenueByMonth` itself is kept, derived from `revenueTrend.monthly`, for the one remaining legacy consumer): four bucketings (weekly/monthly/quarterly/yearly) of the same underlying won-quote rows, each zero-filled over a trailing window (12 weeks/12 months/8 quarters/5 years respectively) **ending at the selected date filter's `to` (or today)** — so the date filter does move the query even though the window's *start* isn't independently bounded by `from` (a trend chart collapsed to one selected day would defeat its purpose). Respects the salesperson/department filter.
- `monthlyClosingRate`: win rate (`won / (won + lost)`) per calendar month, trailing 12 months ending at the same anchor as `revenueTrend`, same zero-fill treatment. `winRate` is `null` (not `0`) for a month with no won/lost deals — a real 0% month (deals that all lost) must still render, not be hidden behind an empty state.
- **2026-08-14, VAT toggle + Service summary card — no schema change.** Both are compute/query-only against fields that already existed: the VAT toggle (`?vat=pre|post`) picks between two pure functions over the same `lines`/`discount` fields already read for the pre-tax figure; `serviceSummary` is a handful of `countDocuments()` calls against `service_reports`, an already-existing collection (see "Service Reports" below), gated/scoped exactly like the existing `scopeOfWork`/`deliveryOrder` summary fields. No new collection, field, or index. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "VAT Toggle" and [API.md](./API.md).
- `followUps` (Today/Overdue/Upcoming) fully respects the date-range + salesperson/department filter as of 2026-07-10 second pass (previously date-range-agnostic by design) — a follow-up tied to a quote issued outside the selected reporting window is now excluded, consistent with every other widget.
- **Timezone**: `today`/date-range-preset/month-boundary math (`api/dashboard/index.ts`'s `todayIsoDate()`/`periodEnd()`/`lastNMonthKeys()`, `src/pages/dashboard/dateRanges.ts`) is computed via a fixed +7h (Bangkok, no DST) offset applied once, then read back exclusively through UTC getters/`Date.UTC` — never through a local-timezone `Date` constructor mixed with `.toISOString()`, which shifts every boundary back a day for Thailand. Fixed 2026-07-10 after code review; found via empirical `TZ=Asia/Bangkok` reproduction. `averageApprovalTime`/`averageClosingTime`/`avgClosingTime` (per-salesperson) are `number | null` — `null` means no qualifying quote yet, distinct from a genuine same-day (`0.0`) average; same null-not-zero treatment as `monthlyClosingRate.winRate` above.
- `categoryBreakdown`: real `products` grouped by `categoryId` (archived excluded) — intentionally **not** "revenue by category," since `QuoteLine` has no `categoryId` reference back to `Product` (see Relationships below) and there's no reliable way to compute that without unreliable string-matching.
- `scopeOfWork` (added 2026-07-23, per a direct user request to show the Scope of Work document count on the Dashboard): `{ total, draft, final }`, three `scope_of_works.countDocuments()` calls (`{ isDeleted: false }`, plus `status: "Draft"` / `"Final"` respectively) — company-wide, all-time, **not** scoped by the date-range/salesperson/department filter, same reasoning as `totalCustomers`/`totalLeads`/`categoryBreakdown` above (a Scope of Work document has no `issueDate`/`salesperson` field of its own to filter by). `null` in the response unless the caller has `scopeOfWork:view`, same `roleHasPermission()` gate pattern as `approvalDashboard`.

### Global Search (`GET /api/search?q=`, added 2026-07-14, expanded to every document 2026-08-28)

Read-only, no collection of its own — see [API.md](./API.md) "Global Search" for the full field
list per category.

**2026-08-28 — the 9 document collections search now also reads** (`api/_lib/searchDocuments.ts`;
see API.md's "ค้นหาได้ทุกเอกสาร" section for permissions, response shape, and the `?types=` /
`exact` additions):

| Category | Collection | Number shown | Fields matched | Soft-delete |
|---|---|---|---|---|
| `deliveryOrders` | `delivery_orders` | `scopeNumber` (the document has no number of its own — one per Scope of Work) | `scopeNumber`, `quotationId`, `customerCompanyName`, `installments.documentNumber` | `isDeleted: false` |
| `serviceReports` | `service_reports` | `_id` (`SR-{พ.ศ.}-{seq}`) | `_id`, `customerSnapshot.companyName`, `serviceLocation`, `projectOrJobCode`, `serviceSystemName`, `serviceType` | `isDeleted: false` |
| `projects` | `projects` | `scopeNumber` (grouping record, no number of its own) | `scopeNumber`, `quotationId`, `customerCompanyName`, `items.name` | `isDeleted: false` |
| `materialRequisitions` | `material_requisitions` | `_id` (`MR-{พ.ศ.}-{seq}`) | `_id`, `customerName`, `jobCode`, `productName`, `responsibleEmployee`, `jobOrderCode`, `lines.productCode`, `lines.productName` | `isDeleted: false` |
| `jobOrders` | `job_orders` | `_id` (`JO-{พ.ศ.}-{seq}`) | `_id`, `customerName`, `jobCode`, `fromSite`, `toSite`, `outOfScope`, `lines.description` | `isDeleted: false` |
| `purchaseRequests` | `purchase_requests` | `_id` (`PR-{พ.ศ.}-{seq}`) | `_id`, `vendorName`, `jobCode`, `deliveryLocation`, `shippingMethod`, `lines.productCode`, `lines.description` | `isDeleted: false` |
| `productionOrders` | `production_orders` | `documentNumber`, falling back to `_id` | `documentNumber`, `_id`, `customerCompanyName`, `jobCode`, `productName`, `supervisorName`, `lines.description` | `isDeleted: false` |
| `arDocuments` | `ar_documents` | `docNo` (`{AR\|BI\|RE\|IV}{YY}{MM}{SEQ}`) | `docNo`, `reference`, `customerSnapshot.companyName`/`.taxId`/`.contactName`, `lines.description` | **none — see below** |
| `productRequests` | `product_requests` | `assignedProductCode` (often blank until approved; the client falls back to the product name) | `name`, `specifications`, `reason`, `requestedByName`, `assignedProductCode` | `isDeleted: false` |

Data-model notes specific to these:
- **`ar_documents` is queried without any soft-delete filter, deliberately.** An issued accounting
  document is never soft-deleted — cancellation is the `status: "cancelled"` transition (see the
  `ArDocumentFields` comment in `api/_lib/collections.ts`) — so cancelled documents stay findable,
  which is what someone chasing a document number actually needs.
- **`ownerDepartment` is returned, not filtered on**, for `material_requisitions`/
  `purchase_requests`. The list pages split project vs production, but both sidebar entries share one
  permission, so search returns both and tags each row so the client opens the right page. Documents
  written before 2026-08-20 have no `ownerDepartment` field at all and are normalised to `"project"`
  on read, exactly as the list handlers do — there was no migration.
- **`production_orders.documentNumber` may be absent** on documents created before 2026-08-27;
  both it and `_id` are matched, and display falls back to `_id`, matching `toClient()` in
  `api/_lib/productionOrderHandler.ts`.
- **Sort order** is `updatedAt: -1` for all of them except `ar_documents`, which sorts by `docDate`
  (its own issue date, the meaningful ordering for an issued document).
- **The document-number fast path is the only place an anchored regex is used.** `^`-anchored
  queries are the sole index-usable shape available here (see the index note at the end of this
  section), which is why a query recognised as a document number runs one targeted prefix query
  against a single collection instead of the broad unanchored scan.

Key data-model notes for the original 7 categories:
- **`templates`** (added 2026-07-14, same day as the `quotation_templates` collection itself):
  matches `templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description` against active,
  non-deleted `quotation_templates` documents only. Only those 5 fields are projected — `sections`/
  `internalNotes` never leave the server via this endpoint, so an internal-staff review comment
  (see [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md)) can never leak through
  search even indirectly. Gated by the same `quotations:create` **or** `quotationTemplates:manage`
  check as `GET /api/quotation-templates` itself.
- **`scopeOfWorks`** (added 2026-07-15, Codex review High Priority fix — see
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md)): matches `scopeNumber`/`quotationId`/
  `quotationNumber`/`customerSnapshot.companyName`/`jobTypeCode`/`jobTypeName`/`customerPoNumber`/
  `status` against non-deleted `scope_of_works` documents — plus, since 2026-08-31,
  `additionalQuotationNumbers`/`additionalPoNumbers` (a `$regex` against an array field matches any
  element, so searching the second PO number finds the same record). Gated by `scopeOfWork:view` — a category
  the caller lacks that permission for comes back as an empty array, same convention as every other
  category here. **2026-07-23**: also scoped by `scopeOfWork:viewAll` — a caller without it only
  matches against records it created itself (`createdBy === ctx.user.id`, plus ownerless legacy
  records) **or that named it as a document recipient** (same-day second pass — a `$or` of
  `{ "documentRecipients.<key>": ctx.user.id }` for each key in `ALL_RECIPIENT_KEYS` (the 6
  department keys + `additional` since 2026-08-07), dot-path querying into specific known object keys rather than
  a generic "any array value under this object" query, which Mongo has no native operator for
  without `$expr`/`$objectToArray`). Same clause added to `GET /api/scope-of-works`'s list-everything
  mode. See [RBAC.md](./RBAC.md) "Scope of Work Own-Records-Only Viewing" and
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients".
- Every category (`quotations`, `customers`, `products`, `users`) queries via a case-insensitive,
  unanchored `$regex` `$or` across several fields, with the query string passed through
  `escapeRegExp()` first (matching the existing helper already duplicated in
  `api/handlers/roles.ts`) so a search containing regex metacharacters (`.`, `*`, `(`, etc.)
  searches for that literal text instead of being interpreted as a pattern.
- **Query length is bounded on both ends** (2026-07-14, Codex review High Priority fix): 2–100
  characters (`MIN_QUERY_LENGTH`/`MAX_QUERY_LENGTH` in `api/_lib/searchHandler.ts`), `400` outside
  that range. The minimum keeps a 1-character query from matching nearly everything; the maximum
  (added this pass — previously unbounded) caps how expensive a single unanchored multi-field
  regex scan across 4 collections can get, since `escapeRegExp()` prevents regex *injection* but
  not an oversized *legitimate* pattern from still costing real scan time. The client mirrors this
  with a native `maxLength` on the search input as defense-in-depth, not the actual enforcement.
- `quotations` results carry the **before-VAT amount** via the same shared
  `computeQuoteAmountBeforeVat()` helper the Dashboard uses — never `Quote.amount`'s VAT-included
  grand total (see the Dashboard aggregation notes above for the full rationale). No `isDeleted`
  filter (same reason as the Dashboard: `Quote` has no such field).
- `customers` results are filtered to `isDeleted: false`; `products` results to `archived: false`
  (Product's actual soft-delete-equivalent field — there is no separate `isDeleted`/`isActive`
  pair on `Product`, only `archived`).
- `products` category-name matching joins to `categories` via `categoryId` — the full `categories`
  collection is fetched once per request (small, cheap) and reused as both the match-join source
  and the display-name lookup, avoiding a second round trip.
- `users` role-name matching joins to `roles` the same way (fetched once, matched by display
  `name`, mapped back to `roleKey` for the actual `$in` filter) — so searching "Sales User" finds
  users whose `roleKey` is `"sales_user"`, not just users whose raw `roleKey` string happens to
  contain the query text.
- **Pages/menus** are a small static in-memory list (`SEARCHABLE_PAGES` in
  `api/_lib/searchHandler.ts`), not MongoDB-backed — this ERP's application page/menu list is part
  of the app itself, not business data. Permission-filtered per entry via `roleHasPermission()`,
  matching the same permission each page's sidebar entry already requires (see RBAC.md).
- **Indexes**: `ensureSearchIndexes()` in `api/_lib/searchHandler.ts` — plain, non-unique
  single-field indexes on `quotes.customerId`/`jobTypeCode`, `customers.contactName`/`phone`/
  `email`/`taxId`, `products.code`/`name`/`categoryId`/`archived`, `users.fullName`/`department`/
  `position`/`roleKey`. Lazy/idempotent, same once-per-warm-instance pattern as
  `ensureQuoteAnalyticsIndexes()` (see above) — deliberately does **not** redeclare
  `users.email`/`username`/`employeeId` (already declared `unique: true` in `ensureIndexes()`; a
  non-unique redeclaration of the same key pattern would throw `IndexOptionsConflict` if that
  unique index exists in this deployment).
- **Not Atlas Search**: substring (not prefix-only) regex matching across a `$or` of several
  fields can't be efficiently served by a standard index regardless of how many single-field
  indexes exist — the indexes above help exact-match/sort use cases and keep the query planner's
  working set smaller, but the search itself is effectively a filtered collection scan per
  category at real scale, capped at 5 results via `limit()`. Acceptable at this ERP's actual data
  volume (one internal company, not big-data scale — same conclusion the Dashboard's own
  aggregation already reached, see above). Revisit with MongoDB Atlas Search if data volume ever
  grows enough to matter — not introduced now since it isn't already configured and isn't clearly
  beneficial at today's scale.

**`id` → `_id` mapping**: `Quote.id` (the client-facing field, e.g. `"QT-2567-0041"`) is stored as the literal MongoDB `_id` for the `quotes` collection — not an `ObjectId`. This is deliberate: quote IDs are already unique, human-meaningful business identifiers (generated by `nextQuoteId()` in `api/handlers/quotes.ts`, which scans existing `_id`s for the highest sequence number), so there was no reason to also carry a separate `ObjectId`. Every other collection (`users`, `products`, `categories`, `notifications`, `audit_log`) uses a real MongoDB `ObjectId` as `_id`, mapped to a string `id` field for the client via `withStringId()`/`toPublicUser()` (`api/_lib/collections.ts`).

`bahtText(amount: number): string` (`src/lib/bahtText.ts` since 2026-08-25, re-exported from `src/lib/quotes.ts` so existing call sites are unchanged) converts a THB amount to its Thai-words form (e.g. `689615` → `"(หกแสนแปดหมื่นเก้าพันหกร้อยสิบห้าบาทถ้วน)"`), used under the print document's grand total.

**Relationships**: `Product.categoryId → ProductCategory.id`. `QuoteLine` has **no** reference back to `Product` — picking a product from the library copies its `name`/`unit`/`defaultPrice` into a new, independent `QuoteLine` at selection time. This is deliberate: editing or archiving a `Product` must never change historical quotes (see [MODULES/Product.md](./MODULES/Product.md) and [MODULES/Quotation.md](./MODULES/Quotation.md)). `Quote.createdByUserId → User.id` and `ApprovalHistoryEntry.userId → User.id` are cross-domain references — plain string IDs looked up at query/render time (e.g. for signature images), not enforced foreign keys (MongoDB doesn't enforce referential integrity; nothing prevents a dangling reference if a user is deleted). `User.roleKey → Role.key`, `Notification.recipientUserId → User.id`, `AuditLogEntry.userId → User.id` are the same pattern.

**Update 2026-07-09**: `ensureIndexes()` (`api/_lib/collections.ts`, called once from the Setup Wizard's first-run path) now creates real indexes across every collection — see the per-collection Indexes column in the schema-prep table above, plus the additions called out inline for `products`/`categories`/`quotes`/`notifications`/`audit_log`. `users.username`/`users.email` uniqueness was already a real unique index before this pass (not newly added) — the paragraph that previously said "no explicit indexes exist" was stale and has been corrected.

### Project module (`src/lib/project.ts` / `materialRequisition.ts` / `jobOrder.ts` / `purchaseRequest.ts`) — added 2026-08-18, Stage 2 data layer + Stage 3 API routes

**Status: types, MongoDB collections/indexes, RBAC permissions (Stage 2), full CRUD/workflow API
routes + a wired-in Product-catalog seed trigger (Stage 3) all exist and are covered by
`tests/api/projectAtomicity.test.ts`. No UI yet (Stage 4+).** See [API.md](./API.md) "Project" for
the full route table. Manages the workflow a Project follows once its Scope of Work + Cost Control
are finalized: sourcing materials from the store, having items fabricated in-house, or purchasing
items externally. Generated from an existing `ScopeOfWork` record, the same relationship shape as
`DeliveryOrder` → `ScopeOfWork` (snapshot, not live reference).

```ts
type ProjectStatus = "Planning" | "InProgress" | "Completed";
type ProjectItemSourcingMethod = "unassigned" | "requisition" | "jobOrder" | "purchaseRequest";
type ProjectItemStatus = "pending" | "documentCreated" | "fulfilled" | "cancelled";
interface ProjectItem {
  id: string; // mirrors the source ScopeOfWorkItem's id
  name: string; specifications: string[]; quantity: number | null; unit: string;
  sourcingMethod: ProjectItemSourcingMethod; itemStatus: ProjectItemStatus;
  materialRequisitionId: string; jobOrderId: string; purchaseRequestId: string; // "" = none yet
}
interface Project {
  id: string; scopeOfWorkId: string; scopeNumber: string; quotationId: string;
  customerCompanyName: string; items: ProjectItem[]; status: ProjectStatus;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; isDeleted: boolean;
}
```

`ProjectItem` is one row per Scope of Work item, each assigned to exactly one of the 3 sourcing
branches, each branch pointing at the real sub-document once created (Stage 3 will set these
server-side, atomically with the sub-document's own creation — never client-invented).

Three sub-document types, each reproducing a real reference form in `public/reference/` (see
conversation history for the full PDF-to-field mapping — not yet written up as a MODULES doc since
the module isn't functional yet, per the standing "hold off until functional" instruction):

- **`MaterialRequisition`** (`material_requisitions`, FM-ST-04 Rev.02) — withdraws items from the
  store catalog. Lines reference an existing `Product` by id (see "Products-catalog-reuse" below)
  rather than a duplicate parallel catalog. **`issues: MaterialIssueBatch[]` (2026-09-07) is the
  source of truth for what Store has issued** — one append-only entry per issue round
  (`{ id, seq, issuedDate, lines: [{ lineId, qty }], issuedBy, remark, charge*Name, postedAt/By,
  stockMovementIds }`), the same shape `receiving_reports.batches` uses. The two withdrawal columns
  below are **derived** from it on every write, so pre-2026-09-07 rows (which have no `issues` field
  at all) keep working untouched: they read back as `[]` and are presented as synthetic rounds by
  `legacyIssueBatchesOf()`, persisted only when the next real round is posted. No migration was run.
  Each line tracks `plannedQty`/`withdrawal1Qty`/
  `withdrawal2Qty`/`returnQty`/`actualUsedQty`. `returnQty` (and the document-level `returnedBy`/
  `returnReceivedBy`/`returnedAt`) is intended to stay editable even after `status: "Final"` at the
  API layer (Stage 3) — same "follow-up fields survive Final" pattern Scope of Work's PO-chasing
  fields established (see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "PO Chasing") — since
  leftover material is returned via the same original document, after issuance. `jobOrderId: string |
  null` (**changed 2026-08-18, same day**: originally modeled as a free-typed external reference
  string — superseded once "ใบส่งผลิต/Production Order" in TODO.md's coordination note was confirmed
  to be an earlier name for this same module's `JobOrder`, not a separate concept) is a real, nullable
  FK to `JobOrder`, with `jobOrderCode: string` as a denormalized display snapshot kept in sync
  whenever it's set — `null`/`""` when a requisition pulls straight from store stock with no
  fabrication job behind it at all, which is the common case, not an edge case.
- **`JobOrder`** (`job_orders`, FM-PJ-01 Rev.01) — sent to Production when an item isn't in the store
  catalog but can be fabricated in-house. Lines are free-typed (not catalog-referenced, unlike
  Material Requisition — fabrication work varies per job). `scopeChecklist: ChecklistGroup[]` reuses
  the exact type Scope of Work uses (`src/lib/documentRequirements.ts`) — see "ChecklistOption.value"
  below for the one shape addition this required. `buildJobOrderChecklistGroups()` (`src/lib/
  jobOrder.ts`) seeds the reference form's 23-item scope-of-work checklist (design/drawing/
  fabrication/testing/painting spec/transportation/installation/etc.), transcribed in the source
  PDF's own reading order — deliberately one flat group, not split into the PDF's two visual columns,
  since the source gives those columns no explicit title of their own.
- **`PurchaseRequest`** (`purchase_requests`, form FMPU05 Rev.02, printed footer "FM-PU-05") — sent to
  Procurement when an item isn't in the catalog and can't be made in-house. A real filled example
  (`public/reference/-ED6908027.pdf`) confirmed this is requested BY the Project department (header
  explicitly labeled "(ฝ่ายโครงการ)") and carries the job code in its remark field — modeled here as
  a real `jobCode` field. Lines optionally reference a `Product` (`productId`, unlike Material
  Requisition's line this is optional — a PR line can be a one-off item with no catalog entry).

  **`lines[].estimatedCost` (ราคาประเมิน) was dropped from the model on 2026-09-21** on the owner's
  instruction (*"ราคาประเมินในใบ PR เอาออก"*) — the requester does not set prices, and the real
  FM-PU-05 leaves that column blank for Purchasing to write in. The PO handler no longer copies it
  into `unitPrice`; a new PO starts with an empty price. **The values already written to disk are
  left exactly where they are — no migration, no backfill, nothing deleted retroactively.** They are
  simply never read again. A PR that is PATCHed after that date loses its value on its own, because
  `sanitizeLines()` rebuilds each line field by field and no longer emits one; a PR that is never
  edited again keeps it forever. That drift is intended, not an oversight.

**Numbering** (implemented Stage 3): `MR-{buddhistYear}-{seq}` / `JO-{buddhistYear}-{seq}` /
`PR-{buddhistYear}-{seq}`, an atomic per-Buddhist-year counter (`nextMaterialRequisitionId()`/
`nextJobOrderId()`/`nextPurchaseRequestId()`, each in its own handler file) — same convention as
`service_reports`' `SR-{year}-{seq}`. Deliberately a clean new prefix scheme, not an attempt to
replicate the real filled Purchase Request example's legacy `"ED"` numbering (`ED6908027`) — the
meaning/source of that prefix is unconfirmed. `Project` itself stays `ObjectId`-keyed (no printed
document number of its own).

**`ChecklistOption.value` addition** (`src/lib/documentRequirements.ts`): an optional `value?: string`
field added to the existing `ChecklistOption` interface — backward-compatible (Scope of Work's
existing options never set it) — to hold Job Order's fill-in text/number for options that aren't a
pure yes/no toggle (e.g. "HYDRO-TEST ___ BAR", "PRIMER COAT: ___ / ___ MICRON").

**`DOCUMENT_RECIPIENT_DEPARTMENTS` gained a `"store"` entry** (`src/lib/documentRequirements.ts`),
separate from `"factory"` — the Material Requisition reference form has a distinct "แผนกสโตร์" (Store
dept) sign-off. **This is an unconfirmed assumption**, not verified against real org structure — it
also affects Scope of Work's `documentsToSend` checklist and User Management's department dropdown,
which share this same constant. Revisit if Store turns out to just be a function within Factory.

**Products-catalog-reuse decision**: Material Requisition/Purchase Request lines reference an existing
`Product` by id rather than a new parallel catalog — the real filled Purchase Request example proved
the same code (`RM-1915`) is used across both document types already, in the real paper process, so
one shared item master is correct. `Product.defaultPrice` accommodates `0` for these non-priced
internal items with no schema change. `api/_lib/materialCatalogSeedData.ts` transcribes all 82 real
catalog rows from `public/reference/FM-ST-04_-_Rev.02_1.pdf` through `_4.pdf` into 4 new
`ProductCategory` rows (เคมี/เรซิ่น, วัสดุสิ้นเปลือง, น็อตและสกรู, อื่นๆ (คลัง)) plus their products —
`seedMaterialCatalogIfEmpty()` is idempotent (find-by-`code`/`name`, insert if missing, same pattern
`upsertQuotationTemplates()` uses) and **wired in as of Stage 3** via `ensureMaterialCatalogSeeded()`
(one-per-process in-memory guard, same convention as `bootstrapRbac()`), called from
`handleMaterialRequisition()`'s entry point. **Not yet run against a real database** — this session
has no live MongoDB credentials, the standing limitation noted throughout this file's history.

**RBAC**: 28 new permissions (`project`/`materialRequisition`/`jobOrder`/`purchaseRequest`, each
`:view/:viewAll/:create/:edit/:finalize/:print/:delete` — mirroring Scope of Work/Delivery Order's own
7-permission shape), granted to Administrator/Super Admin only by default. See
[RBAC.md](./RBAC.md) "Project module".

## Superseded: the old proposed Prisma/PostgreSQL schema — NOT what got built

A Prisma/PostgreSQL schema was designed (never implemented) for the originally-proposed "Phase 2" Next.js migration (see [ARCHITECTURE.md](./ARCHITECTURE.md) "Superseded" section). **That migration never happened** — the real backend that shipped 2026-07-09 uses MongoDB (documented above), not Prisma/PostgreSQL. The section below is kept only as a historical record of the design that was considered and abandoned; do not write code against it or assume any Prisma project/migration exists. Where useful, the Migration Notes at the bottom of this file explain how the fields below map onto what actually got built.

Summary of the superseded Phase-2-first-cut models (RBAC + auth foundation only — Lead/Quotation/Product tables would have been designed in a later phase):

- `Department` — org units (name, code, isActive)
- `Role` — fixed `RoleKey` enum (SUPER_ADMIN, ADMIN, MANAGER, SALES, ACCOUNTING, WAREHOUSE, PURCHASING, HR, EMPLOYEE) + editable display name
- `Permission` — `key` (e.g. `"admin.users.manage"`), grouped by `module`
- `RolePermission` — many-to-many join between `Role` and `Permission`
- `User` — email, `passwordHash` (bcrypt), `departmentId`, `roleId`, self-relation `managerId`/`reports` for manager scoping, `isActive`, audit fields (`createdById`, `createdAt`, `updatedAt`)
- `Account` / `Session` / `VerificationToken` — Auth.js/NextAuth-required tables (Credentials provider + Prisma adapter, database session strategy)
- `AuditLog` — generic (`actorId`, `action`, `entityType`, `entityId`, `metadata`, `createdAt`), every future module's mutations write through this

**Convention envisioned for future modules under that superseded plan**: every business table gets `createdAt`, `updatedAt`, `createdById → User`, and `departmentId → Department` where department-scoped. Not adopted verbatim by the real MongoDB schema, and — corrected 2026-07-10 after the Codex review flagged this line as inaccurate — not even partially: `Quote` has `createdByUserId`/`updatedBy` (both user-**id** references, not timestamps) and `Product`/`ProductCategory`/`Company` have real `createdAt`/`updatedAt`, but `Quote` itself has neither `createdAt` nor `updatedAt` (see the Indexes note above — `issueDate`/`date` are the closest business-date equivalents). Worth adding real audit timestamps to `Quote` as a small follow-up (see TODO.md), not present today.

## Migration Notes (historical — how the old client-side shapes informed the real 2026-07-09 migration)

This section originally described a hypothetical future Prisma/PostgreSQL migration; it's kept, reframed, as an accurate record of how the pre-existing client-side shapes actually mapped onto the real MongoDB migration that shipped 2026-07-09:

1. `Product`/`ProductCategory` mapped close to 1:1 onto their MongoDB collections — the client-side shapes were a solid starting schema, as predicted; only `id` changed from a client-generated string to a MongoDB `ObjectId` (mapped back to `id: string` for the client via `withStringId()`).
2. `Quote`/`QuoteLine`/`SubDetail`: `Quote.id` did **not** move to a database-generated ID — it stayed the client-meaningful business ID (`"QT-2567-0041"`) and became the literal MongoDB `_id` for that collection (see the "`id` → `_id` mapping" note above), a deliberate deviation from the originally-imagined `cuid()` approach since the business ID was already unique. `createdByUserId` maps directly to the session user's ID captured server-side on create/duplicate. `salesperson` remains a free-text snapshot string, not a `User` reference, unchanged.
3. `Company` became a proper singleton MongoDB document (`_id: "singleton"`) rather than a `localStorage` blob, exactly as anticipated — `vatRate`/bank fields/`termsAndConditions` carried over unchanged.
4. `User`/`Role`/`Permission`: `passwordHash` is now a real bcrypt hash (cost 10), closing the biggest gap this section flagged in advance. `Role.permissions: Permission[]` stayed an array field on the `roles` document rather than becoming a `RolePermission` many-to-many join table — MongoDB's document model made the join-table normalization unnecessary; the array-on-document shape works fine for a role count in the tens. The 6-role client-side set was kept as-is; the 9-role `RoleKey` enum from the superseded Prisma proposal was never adopted.
5. `ApprovalHistoryEntry[]` on `Quote` stayed a JSON array field on the `quotes` document rather than becoming a separate `QuotationApproval` table — same reasoning as `Role.permissions` above; MongoDB's embedded-document model made a normalized join table unnecessary for this access pattern (approval history is always read together with its parent quote).
6. `Notification` and `AuditLogEntry` mapped close to 1:1 onto their own MongoDB collections, as predicted.

## Approval + department fields added 2026-08-20

`material_requisitions`, `purchase_requests`, `job_orders` and `production_orders` all gained the
shared approval workflow (see [MODULES/Production.md](./MODULES/Production.md)). Every field below is
**optional** and normalized on read — **no migration was run**, so documents stored earlier simply
lack them:

| Field | On | Meaning |
|---|---|---|
| `status` | all four | Gained `"PendingApproval"` between the existing `"Draft"` and `"Final"`. |
| `approvedByUserId` | all four | The user who actually pressed Approve. Kept **separate** from the printed `approvedBy` name because that one is a free-text form field staff can edit. |
| `rejectionComment` | all four | Why an approver sent it back. Cleared on resubmission. |
| `purchasingStage` | `purchase_requests` | `"review"` \| `"approved"`, **เพิ่ม 2026-09-21**. ขั้นของฝ่ายจัดซื้อ แยกขาดจาก `storeStage`. **ไม่มีค่า = ใบก่อนวันนั้น** ด่านล็อกเช็ค `=== "approved"` ตรง ๆ ส่วนด่านเปิดใบสั่งซื้อเช็ค `!== "review"` เพื่อให้ใบเก่าผ่าน. ไม่มี migration. ⚠️ **ห้ามเขียน `purchasingStage: undefined` ลง `$set`/`insertOne`** — ไดรเวอร์ไม่ได้ตั้ง `ignoreUndefined` ค่าจะถูกบันทึกเป็น `null` ซึ่งไม่เท่ากับ "ไม่มีฟิลด์" (เคยพลาดมาแล้วใน `handleRewrite()`, ดู CHANGELOG 2026-09-21r). ต้องดึงคีย์ออกจากอ็อบเจกต์ไปเลย และฝั่งอ่านใช้ `!doc.purchasingStage` เพื่อให้ทนใบที่เกิดในช่วงนั้น. |
| `purchasingApprovedByUserId` | `purchase_requests` | ผู้กดอนุมัติฝั่งจัดซื้อจริง เซิร์ฟเวอร์เขียนเท่านั้น แยกจากช่องข้อความ `purchasingDeptBy` ที่เจ้าหน้าที่พิมพ์เอง (กติกาเดียวกับ `approvedByUserId`). ทำให้ช่อง "ฝ่ายจัดซื้อ" บนใบพิมพ์มีลายเซ็นจริงได้เป็นครั้งแรก. |
| `pulledToPurchasingBy` / `ByName` / `At` | `purchase_requests` | ร่องรอยว่าจัดซื้อดึงใบมาทำเองโดยข้ามขั้นสโตร์ (2026-09-21) เซิร์ฟเวอร์เขียนตอนกดปุ่มเท่านั้น มีไว้ตอบได้ว่าทำไมใบนี้ไม่มีผลเช็คของ |
| `vendorId` | `purchase_orders` | **เพิ่ม 2026-09-21** ผูกกับทะเบียนผู้ขาย · `""` = ใบเก่าหรือพิมพ์ชื่อเอง · ด่านตอนอนุมัติ (`beforeApprove`) บังคับว่าต้องมี **ใบที่อนุมัติไปแล้วไม่ถูกแตะตลอดกาล** เพราะ hook ทำงานเฉพาะตอน `PendingApproval` → `Final` — จงใจไม่ทำ migration ย้อนหลัง · ใบร่างเก่าถูกกู้ให้อัตโนมัติตอนบันทึกเมื่อชื่อตรงกับทะเบียนรายเดียวเป๊ะ |
| `intendedApproverUserId` / `Name` | `purchase_orders` | **เพิ่ม 2026-09-21** คนที่ตั้งใจให้อนุมัติ · **ไม่ใช่การล็อกสิทธิ์** มีผลที่เดียวคือ "ตอนส่งขออนุมัติจะแจ้งใคร" · `handleRewrite` พาไปฉบับใหม่ด้วย ต่างจาก `approvedBy` |
| `lines[].sourcePrLineId` | `purchase_orders` | **เพิ่ม 2026-09-21** ชี้กลับบรรทัดของใบขอซื้อ · "ซื้อไปแล้วหรือยัง" **คำนวณจากใบสั่งซื้อจริงทุกครั้ง ไม่ใช่ธงบนใบขอซื้อ** ลบใบสั่งซื้อแล้วบรรทัดกลับมาซื้อได้เอง · เซิร์ฟเวอร์เขียนตอนสร้างเท่านั้น ไม่รับจาก PATCH |
| `lines[].cancelled` / `cancelRemark` | `purchase_orders` | **เพิ่ม 2026-09-21** ยกเลิกรายการทีละบรรทัด · **เหตุผลบังคับ** เมื่อ `cancelled` เป็น true · บรรทัดที่ยกเลิก**ยังพิมพ์อยู่บนใบ** (ขีดทับ) แต่ไม่ถูกคิดเงิน (กรองใน `purchaseOrderSubtotal()` ที่เดียว) และไม่ถูกลอกไปใบรับสินค้า · **ไม่นับว่า `sourcePrLineId` ถูกซื้อแล้ว** บรรทัดของใบขอซื้อจึงกลับมาเปิดใบสั่งซื้อใหม่ได้ |
| `approvalStatus` + `submittedAt/By` `approvedAt/ByUserId/ByName` `rejectionComment` | `vendors` | **เพิ่ม 2026-09-21** ขั้นอนุมัติของบัญชี `draft` \| `pendingApproval` \| `approved` \| `rejected` · **ไม่มีค่า = ผู้ขายก่อนวันนั้น อ่านเป็น `approved` เสมอ** ผ่าน `vendorApprovalStatusOf()` ตัวเดียว ไม่งั้นวัน deploy จัดซื้อจะอนุมัติใบสั่งซื้อไม่ได้เลยทั้งระบบ · แก้ชื่อ/รหัส/เลขภาษี/ที่อยู่ของผู้ขายที่อนุมัติแล้ว = ตกกลับเป็น `draft` |
| `ownerDepartment` | `material_requisitions`, `purchase_requests` | `"project"` \| `"production"`. **Absent ⇒ treated as `"project"`**, which is what keeps pre-2026-08-20 records visible to the Project department. |
| `productionOrderId` | `material_requisitions`, `purchase_requests` | Set only on Production-owned documents (which have `projectId: ""` instead). |

Production Order stores its approver as an `approver: { name, date }` signatory block rather than a
plain string, matching its printed form — which is why `ApprovalConfig` has an `approvalStamp` hook.

## `ownerDepartment` gained a third value (2026-08-28)

| Field | On | Meaning |
|---|---|---|
| `ownerDepartment: "general"` | `purchase_requests` | ใบขอซื้อ raised by a department that has neither a project item nor a production order to hang it on (สโตร์ · เซอร์วิส · บัญชี · บุคคล · จัดซื้อ itself). Such a document has empty `projectId`/`scopeOfWorkId`/`jobCode` and is never linked onto a `ProjectItem`. Documents with **no** `ownerDepartment` field at all still read as `"project"`, exactly as before — no migration was run. |

There is a fourth value used only as a **query scope**, never stored: `?ownerDepartment=all`, which
the Purchasing inbox uses to list every department's requests in one table. It removes the
department filter and nothing else — ownership scoping still applies.

### `Product.lastCost` / `lastCostAt` (2026-09-09)

**ราคาซื้อล่าสุด** — ต้นทุนต่อหน่วยของการ "รับเข้าพร้อมราคา" ครั้งล่าสุด (ใบรับสินค้า หรือรับเข้าด้วยมือ
ที่กรอกต้นทุน) เจ้าของเลือกให้**การรับของคืนเข้าคลังลงบัญชีด้วยราคานี้** ไม่ใช่ราคาถัวเฉลี่ย

เขียนใน pipeline update **เดียวกัน**กับ `stockQty`/`avgCost` ใน `applyStockMovement()` จึงไม่มีช่วงที่
สามค่านี้ไม่ตรงกัน และไม่ต้องมีผู้เขียน `Product` รายที่สอง · **ไม่รับจาก client เด็ดขาด** เหมือน
`stockQty`/`avgCost` · optional เพราะสินค้าที่มีอยู่ก่อนวันนั้นไม่มีฟิลด์นี้ — อ่านออกมาเป็น 0/"" ไม่ได้ทำ migration

⚠️ **มูลค่าสต๊อกยังเป็น `stockQty × avgCost`** ราคาซื้อล่าสุดมีผลกับ `unitCost`/`amount` ของ**แถว**ใน
`stock_movements` (ผ่านพารามิเตอร์ `rowUnitCost` ซึ่งประทับราคาลงแถวโดยไม่แตะค่าเฉลี่ย) และการแสดงผล
เท่านั้น ไม่ได้เปลี่ยนวิธีคิดต้นทุนของคลัง

### `purchase_requests` — ขั้นสโตร์ (2026-09-09)

ฟิลด์ที่เพิ่ม ทั้งหมด optional และ**ไม่ได้ทำ migration** — ใบก่อนวันนั้นไม่มี `storeStage` เลย ซึ่งแปลว่า
"วิ่งตรงไปจัดซื้อตามกติกาเดิม" และด่านออกใบสั่งซื้อปล่อยผ่านให้:

```ts
storeStage?: "pending" | "forwarded" | "closed";  // อนุมัติแล้วรอสโตร์ / สโตร์ส่งต่อจัดซื้อ / จ่ายจากสต๊อกครบ
storeReviewedBy?: string;      // → User.id
storeReviewedByName?: string;  // snapshot ชื่อผู้เช็ค
storeReviewedAt?: string;      // YYYY-MM-DD
storeRemark?: string;
storeIssues?: PurchaseRequestIssueBatch[];  // รอบการจ่าย ต่อท้ายอย่างเดียว ยกเลิกได้เฉพาะรอบล่าสุด
purchasingEdits?: { at: string; byUserId: string; byName: string; note: string }[];  // ประวัติการแก้หลังอนุมัติ
// ต่อบรรทัด:
lines[].storeDecision?: "" | "stock" | "purchase";
lines[].storeAvailableQty?: number | null;   // ยอดคงเหลือที่สโตร์เห็น ณ ตอนเช็ค
```

การจ่ายของทางนี้เขียน `stock_movements` ด้วย `sourceType: "purchase_request"` (ค่าที่หกของ union)
