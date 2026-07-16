# Codex Review — 2026-07-16

This dated record is the required-field validation audit. The complete authoritative report is maintained in [CODEX_REVIEW_REPORT.md](../CODEX_REVIEW_REPORT.md).

## Executive Summary

Static review found client and server validation for finalization and print, structured 422 errors, and draft-save allowance. Acceptance is blocked by missing Quotation-to-Scope checklist snapshot copying and unreachable Other-detail inputs for four mandatory groups.

## Critical Issues

None confirmed.

## High Priority Issues

1. Scope creation resets rather than copies Quotation `checklistGroups`.
2. Safety, ขนส่ง, Nameplate, and เอกสารส่งถึง Other-detail validation has no normal UI input.
3. Safety TOR, billing custom, delivery attachment/date/day, and ปจ.2 detail rules are incomplete.

## Medium Priority Issues

1. Incomplete final-action controls are guarded/dimmed but not HTML-disabled.
2. Central required/optional maps do not cover every visible editable value.
3. Finalization does not revalidate semantic date correctness for legacy persisted values.
4. Server 422 error maps are not reapplied as inline UI errors.

## Low Priority Issues

Native browser print cannot be prevented once client HTML has rendered; automated runtime tests were not found.

## Quotation Required Field Review

Shared validation checks configured fields, trimmed strings, lines, quantities, specifications, groups, and print/workflow transitions. Line price/discount and some visible controls are not centrally classified.

## Scope of Work Required Field Review

Shared validation checks configured fields, items, quantities, specifications, payments, groups, and approver on Final. Date semantics are not rechecked at finalization.

## Mandatory Selection Group Review

All eight specified groups are visible, marked required, and validated. Radio/multi-select behavior is correct. Four Other-detail flows are impossible to complete in the UI.

## Conditional Validation Review

Logo Etc and payment percentages are covered. Other group details, Safety TOR, billing custom, delivery conditional data, and ปจ.2 details are incomplete.

## Frontend Validation UX Review

Markers, Thai errors, summaries, highlighting, preserved form state, and summary scrolling exist. Buttons need real disabled semantics and first-error focus.

## Server-Side Validation Review

Finalization and print have server gates, permissions, structured 422 `fieldErrors`/`groupErrors`, explicit payload sanitization, and no `isComplete` mass-assignment path.

## Draft and Workflow Review

Incomplete Draft saves are allowed; final transitions and prints are blocked. Reject/cancel are intentionally exempt and need business confirmation against final-status policy.

## Print / PDF Protection Review

Direct application print endpoints revalidate. No server PDF endpoint exists. Native browser print remains outside endpoint control.

## Quotation-to-Scope-of-Work Snapshot Review

General source values are copied independently, but mandatory checklist state is reset to defaults rather than copied.

## Existing Document Compatibility Review

Old missing checklist data is shown incomplete and not silently default-selected. Legacy malformed dates are not fully protected at finalization.

## Security and Bypass Review

No confirmed static workflow/permission/mass-assignment bypass. Runtime tests unavailable.

## Documentation Review

Documentation claims checklist selections copy into Scope, which conflicts with the create handler and needs correction after implementation changes.

## Requirements Checklist

- [!] All visible fields required by default
- [!] Optional fields centrally configured
- [x] Whitespace-only values rejected
- [x] Safety required
- [x] ขนส่ง required
- [x] Logo required
- [x] เงื่อนไขการวางบิล required
- [x] เอกสารส่งถึง required
- [x] Nameplate required
- [x] เงื่อนไขการส่งมอบงาน required
- [x] ปจ.2 required
- [!] Other details conditionally required
- [x] Empty item rows rejected
- [x] Save Draft allowed when incomplete
- [x] Continue blocked when incomplete
- [x] Submit blocked when incomplete
- [x] Approve blocked when incomplete
- [x] Print/PDF blocked when incomplete
- [x] Frontend validation exists
- [x] Server validation exists
- [x] Direct print URL blocked
- [x] Workflow API bypass blocked
- [ ] Quotation values copied into Scope of Work
- [!] Scope of Work snapshot stored
- [!] Existing records remain compatible
- [ ] Build passes if checked
- [!] Documentation updated

## Suggested Fix Plan for Claude Code

1. Copy the Quotation checklist snapshot into Scope at creation.
2. Complete all conditional-detail UI and server rules.
3. Disable incomplete final actions semantically.
4. Centralize every editable field's required/optional policy and validate dates during finalization.
5. Map server 422 errors inline and focus the first error.
6. Add bypass, snapshot, old-record, and conditional-validation tests.
7. Reconcile documentation with implementation.

## Verification Limits

Lint and build both failed to start because the environment's npm/Node launcher reports WSL1 unsupported and cannot determine Node.js installation location.
