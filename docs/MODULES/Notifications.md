# Module: Notifications

> Added 2026-07-08. Replaces the old decorative header bell (static gold dot, no data) with a real feed; migrated 2026-07-09 to real server-side delivery (Vercel Functions + MongoDB Atlas) — see [RBAC.md](../RBAC.md) for how this fits into the broader RBAC/approval-workflow system. This file was stale until the 2026-07-10 Codex review flagged the whole doc set for contradicting the real-backend migration — corrected throughout below, not just the specific lines called out.

## Purpose

Tell each user, specifically, when a quotation event relevant to them happens — matching "modern business software" bell/badge/panel conventions.

## Business Flow

1. **Bell** (header, always visible): no badge when the signed-in user has 0 unread notifications; a red badge with the unread count otherwise, capped at displaying "99+" beyond 99.
2. **Panel** (click the bell): a dropdown listing every notification addressed to the current user (newest first), each showing an icon (per `NotificationType`), title, description, module label, relative time ("X นาทีที่แล้ว" etc.), and an unread visual highlight (gold tint + dot).
3. **Actions**: click a notification to mark it read and navigate. **As of 2026-07-10 (Codex review fix)**, a click with a `relatedQuoteId` deep-links straight to that quote's detail view (a `quotationDeepLinkId` prop lifted to `App.tsx`, separate from the pre-existing `quotationListFilter` the Dashboard's pipeline/follow-up click-through uses) — previously it only switched to the quotation list module with no specific record selected. "อ่านทั้งหมด" marks every notification for this user read; a per-row trash icon deletes one notification.
4. **Delivery is role-based, not broadcast** — built server-side by `createWorkflowNotifications()` in `api/handlers/quotes.ts`'s `POST /api/quotes/:id/workflow` handler, querying real `users`/`roles` MongoDB collections at the moment of each transition (not client-side, not trusted from the request):
   - Submit → every **active** user holding `quotations:approve`
   - Submit, and quote total ≥ `HIGH_VALUE_THRESHOLD` (฿500,000) → also every active `approver_2` user, as a separate high-value notification
   - Approve/Reject/Customer Accepted/Customer Rejected → the quote's creator (`createdByUserId`)
5. Real cross-user, cross-device delivery — another user's browser sees the new notification (and updated unread badge) the next time it fetches `GET /api/notifications`, no same-browser/same-session limitation.

## Pages

None — lives entirely in the header, not a dedicated page. (No "view all notifications" page exists; the scrollable panel itself shows every notification for the user.)

## Components

- `src/components/NotificationBell.tsx` — bell button + badge + dropdown panel, self-contained (owns its own open/closed state).

## Database Tables

`notifications` (MongoDB collection) — see [DATABASE.md](../DATABASE.md) for the `Notification` shape.

## APIs

`GET /api/notifications`, `PATCH /api/notifications/:id` (mark read), `POST /api/notifications/mark-all-read`, `DELETE /api/notifications/:id` — see [API.md](../API.md) Notifications section. Creation isn't a direct client-callable route; it's a side effect of `POST /api/quotes/:id/workflow` (see Business Flow above).

## Permissions

None of its own — delivery is inherently role-based (see Business Flow), but reading/managing your own notifications requires no separate permission beyond being signed in. Every read/write route enforces recipient ownership server-side (`recipientUserId` must match the authenticated caller).

## Current Features

- Correct bell badge behavior (hidden/count/99+)
- Full dropdown panel: icon/title/description/module/relative-time/read-unread
- Mark read / mark all read / delete
- Click-to-navigate — deep-links to the specific quotation when `relatedQuoteId` is set (2026-07-10)
- Role-based delivery tied to the quotation approval workflow, server-enforced

## Future Improvements

- Notification types beyond quotations (e.g. user-management events) once there's a concrete need
- A dedicated "view all notifications" page if the dropdown panel ever proves insufficient

## Known Issues

None functional.
