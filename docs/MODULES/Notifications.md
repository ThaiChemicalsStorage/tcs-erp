# Module: Notifications

> Added 2026-07-08. Replaces the old decorative header bell (static gold dot, no data) with a real feed; migrated 2026-07-09 to real server-side delivery (Vercel Functions + MongoDB Atlas) — see [RBAC.md](../RBAC.md) for how this fits into the broader RBAC/approval-workflow system. This file was stale until the 2026-07-10 Codex review flagged the whole doc set for contradicting the real-backend migration — corrected throughout below, not just the specific lines called out.

## Purpose

Tell each user, specifically, when a quotation event relevant to them happens — matching "modern business software" bell/badge/panel conventions.

## Business Flow

1. **Bell** (header, always visible): no badge when the signed-in user has 0 unread notifications; a red badge with the unread count otherwise, capped at displaying "99+" beyond 99.
2. **Panel** (click the bell): a dropdown listing every notification addressed to the current user (newest first), each showing an icon (per `NotificationType`), title, description, module label, relative time ("X นาทีที่แล้ว" etc.), and an unread visual highlight (gold tint + dot).
3. **Actions**: click a notification to mark it read and navigate. **As of 2026-07-10 (Codex review fix)**, a click with a `relatedQuoteId` deep-links straight to that quote's detail view (a `quotationDeepLinkId` prop lifted to `App.tsx`, separate from the pre-existing `quotationListFilter` the Dashboard's pipeline/follow-up click-through uses) — previously it only switched to the quotation list module with no specific record selected. **2026-07-23**: a click with a `relatedScopeId` instead deep-links to that Scope of Work's detail view on the standalone Scope of Work page (`scopeOfWorkDeepLinkId` prop lifted to `App.tsx`, checked before `relatedQuoteId` in `onNavigate` — the two are mutually exclusive per notification). "อ่านทั้งหมด" marks every notification for this user read; a per-row trash icon deletes one notification.
4. **Delivery is role-based or explicitly-picked, not broadcast** — built server-side, querying real `users`/`roles` MongoDB collections at the moment of the triggering event (not client-side, not trusted from the request):
   - **Quotation workflow** (`createWorkflowNotifications()` in `api/handlers/quotes.ts`'s `POST /api/quotes/:id/workflow` handler):
     - Submit → every **active** user holding `quotations:approve`
     - Submit, and quote total ≥ `HIGH_VALUE_THRESHOLD` (฿500,000) → also every active `approver_2` user, as a separate high-value notification
     - Approve/Reject/Customer Accepted/Customer Rejected → the quote's creator (`createdByUserId`)
     - **Won/Lost/Cancelled** (added 2026-07-10, fifth pass) → the quote's creator — previously these three terminal transitions silently notified no one, unlike every other transition; found by an independent Codex re-review
   - **Scope of Work document routing** (added 2026-07-23, `handleSendDocumentNotifications()` in `api/_lib/scopeOfWorkHandler.ts`'s `POST /api/scope-of-works/:id/send-documents`) → every user explicitly picked as a document recipient (see [ScopeOfWork.md](./ScopeOfWork.md) "Document Recipients") — **not role-based**, a human explicitly chose these specific people, unlike every quotation-workflow notification above. Fired for every resolved recipient regardless of that individual's own outbound-email success/failure (the in-app notification and the email are independent channels).
5. Real cross-user, cross-device delivery — another user's browser sees the new notification (and updated unread badge) the next time it fetches `GET /api/notifications`, no same-browser/same-session limitation. **2026-07-24 (direct user request — "ต้องกดรีก่อนรอบนึงแจ้งเตือนถึงจะขึ้น")**: that fetch is now automatic — `App.tsx` polls `GET /api/notifications` every 45 seconds while signed in, plus an immediate refetch on window focus and on a hidden→visible tab transition (polling pauses while the tab is hidden, so a backgrounded tab costs nothing). Previously notifications were fetched once at boot only, so nothing new ever appeared without a full page reload. Polling was chosen over SSE/WebSocket deliberately: the Vercel serverless backend can't hold a connection open, and polling is fully portable to the future self-managed server — SSE is recorded as a possible post-migration upgrade in [SERVER_MIGRATION_PLAN.md](../SERVER_MIGRATION_PLAN.md).

## Pages

None — lives entirely in the header, not a dedicated page. (No "view all notifications" page exists; the scrollable panel itself shows every notification for the user.)

## Components

- `src/components/NotificationBell.tsx` — bell button + badge + dropdown panel, self-contained (owns its own open/closed state).

## Database Tables

`notifications` (MongoDB collection) — see [DATABASE.md](../DATABASE.md) for the `Notification` shape.

## APIs

`GET /api/notifications`, `PATCH /api/notifications/:id` (mark read), `POST /api/notifications/mark-all-read`, `DELETE /api/notifications/:id` — see [API.md](../API.md) Notifications section. Creation isn't a direct client-callable route; it's a side effect of `POST /api/quotes/:id/workflow` and, as of 2026-07-23, `POST /api/scope-of-works/:id/send-documents` too (see Business Flow above).

## Permissions

None of its own — delivery is inherently role-based (see Business Flow), but reading/managing your own notifications requires no separate permission beyond being signed in. Every read/write route enforces recipient ownership server-side (`recipientUserId` must match the authenticated caller).

## Current Features

- Correct bell badge behavior (hidden/count/99+)
- Full dropdown panel: icon/title/description/module/relative-time/read-unread
- Mark read / mark all read / delete
- Click-to-navigate — deep-links to the specific quotation when `relatedQuoteId` is set (2026-07-10), or the specific Scope of Work when `relatedScopeId` is set (2026-07-23)
- Role-based delivery tied to the quotation approval workflow, server-enforced
- **16 notification types** (added `quotation_won`/`quotation_lost`/`quotation_cancelled` 2026-07-10, fifth pass; `scope_of_work_document_sent` 2026-07-23; **2026-07-24 (approval workflow)**: `scope_of_work_submitted/approved/rejected` + `delivery_order_submitted/approved/rejected` — submitted → every active `*:finalize` holder, approved/rejected → the creator; the `delivery_order_*` types carry the new `relatedDeliveryOrderId` field, checked FIRST in `App.tsx`'s bell `onNavigate`, deep-linking to the standalone Delivery Order page) — each with its own `NotificationBell.tsx` icon
- **2026-07-23**: first notification type not tied to the quotation approval workflow at all — `scope_of_work_document_sent`, delivered to explicitly-picked people rather than everyone holding a permission (see Business Flow above)
- **2026-07-24**: automatic 45-second polling + refetch-on-focus (see Business Flow #5) — new notifications appear without a manual page reload
- **2026-07-29**: `scope_of_work_po_chase` ("ทวงเลข PO", BellRing icon) — fired by `POST /api/scope-of-works/:id/chase-po` to the record's resolved salesperson (name-matched user → seller link → creator) when someone chases a missing customer PO number; deep-links via `relatedScopeId` like the other Scope of Work types. See [MODULES/ScopeOfWork.md](./ScopeOfWork.md) "PO Chasing".

## Future Improvements

- A dedicated "view all notifications" page if the dropdown panel ever proves insufficient
- True push delivery (SSE) once the app runs on the self-managed server — not viable on Vercel serverless (functions can't hold a connection open); the 45s polling above is the portable interim. See [SERVER_MIGRATION_PLAN.md](../SERVER_MIGRATION_PLAN.md).
- The "เปิดดูใน TCS ERP" link inside the Scope of Work document-recipient *email* (as opposed to the in-app notification, which already deep-links correctly via internal React state) still only opens the app's homepage — this app has no URL-based router (`App.tsx` holds a plain `activeNav` string, see [ARCHITECTURE.md](../ARCHITECTURE.md)), so a plain `<a href>` from an external email genuinely cannot restore in-memory navigation state on page load. Real deep-linking from an email would need URL/query-param-based routing added app-wide — a materially larger change than this pass, not attempted here.

## Known Issues

None functional.
