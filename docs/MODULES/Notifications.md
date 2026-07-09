# Module: Notifications

> Added 2026-07-08. Replaces the old decorative header bell (static gold dot, no data) with a real feed — see [RBAC.md](../RBAC.md) for how this fits into the broader RBAC/approval-workflow system.

## Purpose

Tell each user, specifically, when a quotation event relevant to them happens — matching "modern business software" bell/badge/panel conventions.

## Business Flow

1. **Bell** (header, always visible): no badge when the signed-in user has 0 unread notifications; a red badge with the unread count otherwise, capped at displaying "99+" beyond 99.
2. **Panel** (click the bell): a dropdown listing every notification addressed to the current user (newest first), each showing an icon (per `NotificationType`), title, description, module label, relative time ("X นาทีที่แล้ว" etc.), and an unread visual highlight (gold tint + dot).
3. **Actions**: click a notification to mark it read and navigate (currently to the quotation list — see Future Improvements); "อ่านทั้งหมด" marks every notification for this user read; a per-row trash icon deletes one notification.
4. **Delivery is role-based, not broadcast** — built by `QuotationPage.handleWorkflowAction` per transition:
   - Submit → every **active** user holding `quotations:approve`
   - Submit, and quote total ≥ `HIGH_VALUE_THRESHOLD` (฿500,000) → also every active `approver_2` user, as a separate high-value notification
   - Approve/Reject/Customer Accepted/Customer Rejected → the quote's creator (`createdByUserId`)
5. Because this is a single-browser simulation (see [RBAC.md](../RBAC.md)), "another user gets notified" is only observable by logging out and back in as that user within the same browser — there's no real cross-device push.

## Pages

None — lives entirely in the header, not a dedicated page. (No "view all notifications" page exists; the scrollable panel itself shows every notification for the user.)

## Components

- `src/components/NotificationBell.tsx` — bell button + badge + dropdown panel, self-contained (owns its own open/closed state).

## Database Tables

None (no real DB) — see [DATABASE.md](../DATABASE.md) for the `Notification` shape. Persists to `tcs_erp_notifications` — one shared array for every user, filtered client-side by `recipientUserId`.

## APIs

None — see [API.md](../API.md) Notifications section (`notifyQuotationSubmitted`/`Approved`/`Rejected`/`HighValue`/`CustomerAccepted`/`CustomerRejected`, `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`, `unreadCountFor`).

## Permissions

None of its own — delivery is inherently role-based (see Business Flow), but reading/managing your own notifications requires no separate permission beyond being signed in.

## Current Features

- Correct bell badge behavior (hidden/count/99+)
- Full dropdown panel: icon/title/description/module/relative-time/read-unread
- Mark read / mark all read / delete
- Click-to-navigate (module-level)
- Role-based delivery tied to the quotation approval workflow

## Future Improvements

- Deep-link a notification click to the specific quote's detail view, not just the quotation list module — needs `QuotationPage`'s view/selectedId state lifted to `App.tsx`
- Notification types beyond quotations (e.g. user-management events) once there's a concrete need
- A dedicated "view all notifications" page if the dropdown panel ever proves insufficient

## Known Issues

None currently open beyond the shared "single-browser simulation" caveat — see [RBAC.md](../RBAC.md).
