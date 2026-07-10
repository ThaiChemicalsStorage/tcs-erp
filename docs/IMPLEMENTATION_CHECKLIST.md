# Implementation Checklist

> Created 2026-07-10 per an explicit request for a full ERP completion audit. Statuses:
> **Completed** / **In Progress** / **Missing** / **Blocked**. Update this file whenever a status
> changes — it must never go stale. This is a status summary; see [PROJECT_STATUS.md](./PROJECT_STATUS.md)
> for the narrative version and [TODO.md](./TODO.md) for the prioritized backlog these Missing
> items feed into.

## How to read this file

Every "Missing" or "In Progress" row already has a matching entry in [TODO.md](./TODO.md) — this
file is the audit view (what exists vs. not, module by module); TODO.md is the action view
(what to do about it, prioritized). Don't duplicate detail here that TODO.md already owns.

## Core modules

| Module | Status | Notes |
|---|---|---|
| Auth (Setup Wizard + Sign in) | **Completed** | bcrypt + JWT httpOnly cookie, server-verified, no public self-signup. No login rate limiting (see Security Hardening below). |
| Dashboard | **Completed**, verification **In Progress** | Full Executive BI rebuild 2026-07-10 (~20 KPIs, pipeline, filters, rankings, forecast, follow-ups, approvals, activity feed, 9 charts) — real MongoDB aggregation throughout. Went through a full code-review pass (10 real bugs found and fixed, see CHANGELOG). Not yet exercised against live data in a browser — see [PROJECT_STATUS.md](./PROJECT_STATUS.md) "In Progress." |
| Quotation | **Completed** | List/create/edit/duplicate, 9-status approval workflow, print/PDF, product-library picker, Job Type/Potential Opportunity/Follow-up Date (added 2026-07-10). |
| Product Library | **Completed**, one gap | CRUD, categories, archive, search/filter/sort/pagination all real. **Missing**: button-level (create/edit/delete) permission gating in the UI — only the sidebar entry respects `products:view` today; the underlying API routes are already properly permission-gated server-side, this is a UX-only gap. |
| Job Type master data | **Completed**, one gap | 13 seeded defaults, `GET/POST/PATCH /api/jobtypes`, wired into Quotation form/list/PDF/Dashboard. **Missing**: no dedicated admin UI to add/edit job types beyond the 13 seeded defaults — the API exists (`company:manage`), the page doesn't. |
| User Management | **Completed** | Create/edit/reset password/activate/deactivate/assign role-department-position, last-Super-Admin guards. |
| Role Management | **Completed** | Custom roles, permission matrix editor, system-role locking (Super Admin fully locked, Administrator name-locked only). |
| Notifications | **Completed**, one gap | Bell badge (0/count/99+), role-based delivery, mark-read/delete. **Missing**: click only navigates to the quotation list, not the specific quote — needs `QuotationPage`'s `view`/`selectedId` state lifted to `App.tsx` (a narrower Dashboard-only version of this was built 2026-07-10, not the general case). |
| Audit Log | **Completed** | Append-only, read-only, server-derived actor identity. No period-grouped analytics view (see Activity Analytics below). |
| Settings (Profile/Company/Security) | **Completed** | Profile picture + signature upload, company logo/stamp/bank/VAT/T&C, real password change. `Company.vatRate` is stored/editable but **not wired into `computeTotals()`** — see Known Gaps below. |
| Lead Management | **Schema only — deliberately not built out further** | `leads`/`lead_activities` collections + indexes exist. No API routes/UI. Explicitly re-confirmed 2026-07-10 as out of scope for the current phase (see PROJECT_STATUS.md) — the single largest genuinely-missing piece of the long-term ERP vision, tracked as its own future undertaking, not silently forgotten. |
| Customer Management | **Schema only — deliberately not built out further** | Same status as Lead Management. Quotations still carry only a free-text `client` name, not a real Customer reference; Dashboard customer analytics approximate via that free-text field (documented caveat in MODULES/Dashboard.md). |
| Department-based filtering | **Missing, blocked on Customer/Lead** | `User.department` is free text, not a real reference — there's no department entity to filter by. Would need the same foundational work as Lead/Customer Management. |
| Activity Analytics (period-grouped, multi-dimension) | **Missing** | The Dashboard's Activity Timeline is a flat recent-N feed from `audit_log`, not grouped by week/month/quarter/year or filterable by salesperson/job type. A real gap against the request's section 7 — not yet scoped or built. |
| Report Export (PDF/Excel/CSV) | **Missing — explicitly deferred twice** | No CSV/Excel/PDF export exists anywhere in the app beyond the existing browser-print quotation PDF. Deferred by explicit user choice both when the Dashboard was originally scoped and again in this pass, to be built against the now-stable dashboard response shape. |

## Cross-cutting concerns

| Area | Status | Notes |
|---|---|---|
| RBAC enforcement | **Completed** | Server-side on every mutating route via `requirePermission()`, genuinely unbypassable via devtools. 17-permission model, 6 default roles. Users can't edit their own role; can't self-deactivate as last Super Admin. |
| MongoDB as sole business-data source | **Completed** | No hardcoded/mock business data anywhere in the app (confirmed during the 2026-07-09 production-readiness pass and re-confirmed by this session's code review — the fake `salesTeam.ts` sample module and 5 fake Dashboard sections were removed 2026-07-09, nothing has reintroduced hardcoded business data since). |
| Empty states | **Completed** | Dashboard, Products, Quotations, Notifications, Audit Log all have real Thai/English empty-state copy distinguishing "genuinely empty" from "no results for this filter." |
| i18n (Thai/English) | **Completed** | ~530 dictionary keys, essentially all UI chrome covered. Persisted data/seed content and the printed quotation document are Thai-only by deliberate design, documented as such, not a gap. |
| Security hardening | **Missing (3 items)** | No rate limiting on `POST /api/auth/login`; MongoDB Atlas credential rotation recommended 2026-07-09, still unconfirmed; bcrypt cost factor (10) not explicitly tuned. See RBAC.md Known Gaps. |
| Automated tests | **Missing** | Zero test coverage anywhere in the repo — frontend or the API layer. Flagged as high-priority since day one of the backend migration, still not started. |
| CI pipeline | **Missing** | No typecheck/lint/build gate on push — real risk since GitHub auto-deploys to production on push to `master`. |
| GitHub → Vercel auto-deploy | **Completed, verified** | Confirmed via Vercel MCP tooling — the production deployment matches the latest `master` commit. |
| Live-data verification of 2026-07-10 work | **In Progress** | See Dashboard row above — `tsc`/`lint`/`build` clean, code-reviewed, not yet browser-tested against real data. |

## Explicitly out of scope for this phase (not bugs, not oversights)

- Separate `quotation_items`/`quotation_approvals`/`quotation_status_history`/`sales_activities`/`followups` collections — deliberately embedded/reused instead (`Quote.lines`/`Quote.approvalHistory`, `audit_log`, `Quote.followUpDate`), reconfirmed 2026-07-10. See [DATABASE.md](./DATABASE.md) "Deliberately not built as separate collections."
- Full Lead/Customer/Department entity build-out — reconfirmed 2026-07-10, see above.
- Sequential two-level approval (Approver L1 → L2) — no concrete business need surfaced yet.
- Dark mode — `theme.css` only defines the light palette.
- Real blob storage for uploads (still base64-in-document, 16MB MongoDB ceiling) — `uploads`/`attachments` collections exist as schema-only prep.

## Estimated completion

~40% of the full long-term ERP vision (HR/Accounting/Inventory/Warehouse/Purchasing/Project
Management not started; Lead/Customer schema-only). **~95%** of the currently-scoped modules
(Dashboard/Quotation/Product/Auth/Settings/User Mgmt/Role Mgmt/Notifications/Audit Log) —
the remaining 5% is the specific gaps listed above (button-level Product gating, VAT wiring,
full notification deep-link, Job Type admin UI, Activity Analytics, Report Export), not
placeholder or fake functionality. See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the maintained
narrative version of this number.
