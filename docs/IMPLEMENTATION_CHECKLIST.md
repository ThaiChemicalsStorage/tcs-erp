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
| Dashboard | **Completed against the full business spec + an independent Codex review**, verification **In Progress** | Full Executive BI rebuild 2026-07-10 (~20 KPIs, pipeline, filters, rankings, forecast, follow-ups, approvals, activity feed, 9 charts), code-reviewed (10 real bugs found and fixed), a same-day completion pass against the detailed business spec (Pending Approvals list, Non-Active Jobs KPI, Won+Lost-aware Average Closing Time, Total Value columns, Revenue Trend grouping, Job Type Distribution chart, Department filter), then a third pass fixing an independent Codex review's findings: Customer Interest panel now uses filtered server data (was silently unfiltered), Activity Timeline now filter-aware, Expected Sales now matches its literal rule, a CSV export exists. See CHANGELOG for the itemized list. Not yet exercised against live data in a browser — see [PROJECT_STATUS.md](./PROJECT_STATUS.md) "Known Risks" for the specific, reproducible, twice-confirmed environment limitation (MongoDB Atlas SRV DNS resolution blocked in the sandboxed session), not a defect. |
| Quotation | **Completed**, real server-side validation added | List/create/edit/duplicate, 9-status approval workflow, print/PDF, product-library picker, Job Type/Potential Opportunity/Follow-up Date (added 2026-07-10). **2026-07-10, Codex review fix**: `api/_lib/quoteValidation.ts` validates every field server-side (type/length/range/dates), `amount` is always server-derived (never client-writable), Job Type is required on create and membership-checked on any edit that changes it, quotation numbering is now atomic (`counters` collection, not scan-then-max+1). |
| Product Library | **Completed**, one gap | CRUD, categories, archive, search/filter/sort/pagination all real. **Missing**: button-level (create/edit/delete) permission gating in the UI — only the sidebar entry respects `products:view` today; the underlying API routes are already properly permission-gated server-side, this is a UX-only gap. |
| Job Type master data | **Completed**, one gap | 13 seeded defaults, `GET/POST/PATCH /api/jobtypes`, wired into Quotation form/list/PDF/Dashboard, now required and server-validated on quote create (2026-07-10, Codex review fix). **Missing**: no dedicated admin UI to add/edit job types beyond the 13 seeded defaults — the API exists (`company:manage`), the page doesn't. |
| User Management | **Completed** | Create/edit/reset password/activate/deactivate/assign role-department-position, last-Super-Admin guards. |
| Role Management | **Completed** | Custom roles, permission matrix editor, system-role locking (Super Admin fully locked, Administrator name-locked only). |
| Notifications | **Completed** | Bell badge (0/count/99+), role-based delivery, mark-read/delete. **2026-07-10, Codex review fix**: click now deep-links to the specific related quotation (a `quotationDeepLinkId` lifted to `App.tsx`), not just the module list — previously the single remaining gap here. |
| Audit Log | **Completed** | Append-only, read-only, server-derived actor identity. No period-grouped analytics view (see Activity Analytics below). |
| Settings (Profile/Company/Security) | **Completed** | Profile picture + signature upload, company logo/stamp/bank/VAT/T&C, real password change. `Company.vatRate` is stored/editable but **not wired into `computeTotals()`** — see Known Gaps below. |
| Lead Management | **Schema only — deliberately not built out further** | `leads`/`lead_activities` collections + indexes exist. No API routes/UI. Explicitly re-confirmed 2026-07-10 as out of scope for the current phase (see PROJECT_STATUS.md) — the single largest genuinely-missing piece of the long-term ERP vision, tracked as its own future undertaking, not silently forgotten. |
| Customer Management | **Schema only — deliberately not built out further** | Same status as Lead Management. Quotations still carry only a free-text `client` name, not a real Customer reference; Dashboard customer analytics approximate via that free-text field (documented caveat in MODULES/Dashboard.md). |
| Department-based filtering | **Completed on Dashboard (free-text join), still blocked elsewhere** | 2026-07-10: Dashboard gained a real Department filter, resolved server-side to "every salesperson whose free-text `User.department` matches" — works today, but inherits the same name-variation caveat as customer-name matching until a real `Department` entity exists. No other module filters by department yet; that would need the same foundational work as Lead/Customer Management. |
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
| Quote payload / upload validation | **Completed** | 2026-07-10, Codex review fix: `api/_lib/quoteValidation.ts` (quote fields, always-server-derived `amount`, Job Type membership) and `api/_lib/uploadValidation.ts` (profile picture/signature/company logo/stamp — MIME type + 2MB size cap). Previously: quote writes copied raw client fields with no validation at all; uploads accepted arbitrary strings. |
| Automated tests | **Missing** | Zero test coverage anywhere in the repo — frontend or the API layer. Flagged as high-priority since day one of the backend migration, still not started. |
| CI pipeline | **Missing** | No typecheck/lint/build gate on push — real risk since GitHub auto-deploys to production on push to `master`. |
| GitHub → Vercel auto-deploy | **Completed, verified** | Confirmed via Vercel MCP tooling — the production deployment matches the latest `master` commit. |
| Live-data verification of 2026-07-10 work | **In Progress, environment-blocked** | See Dashboard row above — `tsc`/`lint`/`build` clean across all three 2026-07-10 passes, code-reviewed, not yet browser-tested against real data. Both the second and third passes' sessions confirmed why: their sandboxed network can't resolve MongoDB Atlas's SRV DNS record (`querySrv ECONNREFUSED`), reproduced on an untouched pre-existing route each time, so no session running in that same environment can close this out — needs either a different network environment or a Vercel preview-deployment click-through. |

## Explicitly out of scope for this phase (not bugs, not oversights)

- Separate `quotation_items`/`quotation_approvals`/`quotation_status_history`/`sales_activities`/`followups` collections — deliberately embedded/reused instead (`Quote.lines`/`Quote.approvalHistory`, `audit_log`, `Quote.followUpDate`), reconfirmed 2026-07-10. See [DATABASE.md](./DATABASE.md) "Deliberately not built as separate collections."
- Full Lead/Customer/Department entity build-out — reconfirmed 2026-07-10, see above.
- Sequential two-level approval (Approver L1 → L2) — no concrete business need surfaced yet.
- Dark mode — `theme.css` only defines the light palette.
- Real blob storage for uploads (still base64-in-document, 16MB MongoDB ceiling) — `uploads`/`attachments` collections exist as schema-only prep.

## Estimated completion

~40% of the full long-term ERP vision (HR/Accounting/Inventory/Warehouse/Purchasing/Project
Management not started; Lead/Customer schema-only). **~97%** of the currently-scoped modules
(Dashboard/Quotation/Product/Auth/Settings/User Mgmt/Role Mgmt/Notifications/Audit Log) —
the Dashboard's remaining gaps against its business spec were closed in the second 2026-07-10
pass, and an independent Codex review's Critical/High findings (quote validation, Dashboard
filter honesty, Job Type enforcement, notification deep-link, CSV export, atomic numbering,
upload validation) were closed in the third same-day pass (see CHANGELOG); the remaining ~3% is
the specific gaps listed above (button-level Product gating, VAT wiring, Job Type admin UI,
Activity Analytics grouping, PDF/Excel export, `GET /api/users` privacy-model decision,
`Quote.salesperson`→real-user-reference migration decision), not placeholder or fake
functionality. See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the maintained narrative version
of this number.
