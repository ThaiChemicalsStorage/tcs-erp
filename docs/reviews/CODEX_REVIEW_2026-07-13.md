# Archived Codex Review — 2026-07-13

This archive records the quotation issuer-company selection audit. The full current review is in [CODEX_REVIEW_REPORT.md](../CODEX_REVIEW_REPORT.md).

## Outcome

The requested flow is implemented: active Company Profiles are selectable on quotation creation; default/sole profiles preselect; the quotation API validates the selected profile and creates issuerCompanyId plus a server-derived issuerCompanySnapshot; Draft-only changes are enforced; audit records are structured; and print uses the snapshot first.

No fake issuer data, hardcoded issuer header, or multi-tenant architecture was found. The remaining compatibility issue is a partial quote with an issuer id but no snapshot whose referenced profile is no longer active: current code falls to the legacy singleton rather than the default active profile. Local lint/build could not start because the environment reports WSL1 unsupported.
