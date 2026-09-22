# ERP Claude Prompt Engineering Guide

## เป้าหมาย

เอกสารนี้เป็นคู่มือสำหรับให้ Claude เข้าใจ **วิธีคิดก่อนแก้โค้ด** และ **วิธีทำตาม Prompt** สำหรับ Thai Chemicals Storage ERP

หลักสำคัญ:

> Inspect first → Understand business → Plan → Implement → Test → Review → Fix

อย่าให้ Claude เดา Requirement ที่สำคัญ ถ้าสามารถระบุได้ใน Prompt ให้ระบุให้ชัดเจน

---

## 1. วิธีคิดก่อนสร้าง Prompt

ก่อนเขียน Prompt ให้ตอบคำถามเหล่านี้:

1. ระบบปัจจุบันมีอะไรอยู่แล้ว?
2. หน้า/Component/API/Model ไหนเกี่ยวข้อง?
3. มีของเดิมที่นำกลับมาใช้ได้หรือไม่?
4. User ที่ใช้งานคือใคร?
5. แต่ละ Role ทำอะไรได้บ้าง?
6. Business ต้องการแก้ปัญหาอะไร?
7. Data อะไรต้องเก็บ?
8. API ต้องทำอะไร?
9. Validation ต้องมีอะไร?
10. Loading / Empty / Error state เป็นอย่างไร?
11. Mobile / Tablet / iPad ต้องใช้งานอย่างไร?
12. PDF/Export ต้องหน้าตาและพฤติกรรมอย่างไร?
13. มี Integration เช่น LINE OA หรือ Email หรือไม่?
14. มี Edge Case อะไร?
15. Definition of Done คืออะไร?

---

## 2. Current Problem

อย่าเขียนแค่:

```text
Create Service Report page.
```

ควรอธิบายปัญหา เช่น:

```text
Current Problem:
The ERP currently has quotation and sales workflows, but there is no dedicated
Service Report workflow for engineers performing on-site maintenance.

The current paper-based workflow causes:
- inconsistent checklist formats
- difficult photo and remark tracking
- manual report preparation
- no centralized service history
- no digital customer acceptance
```

หลัก:

> บอก “ปัญหา” ก่อนบอก “วิธีแก้”

---

## 3. Business Requirement

อธิบายว่าทำไปเพื่ออะไร:

```text
Business Requirement:
Create a Service Report module that allows Service Engineers to:
- select/create a checklist
- record Normal/Abnormal results
- attach photos for abnormal findings
- add remarks and inspection results
- generate a landscape PDF
- collect Engineer and Customer signatures
- send customer acceptance through LINE OA
- receive the verified acceptance status back in the ERP
```

Feature = ระบบทำอะไร  
Business Requirement = ทำไปทำไม

---

## 4. Scope

ต้องกำหนดทั้งสิ่งที่ทำและไม่ทำ:

```text
In Scope:
- Service Report CRUD
- Checklist template management
- Normal/Abnormal inspection
- Photo attachment
- Remarks
- PDF generation
- Digital signatures
- Customer acceptance
- Responsive mobile/tablet UI

Out of Scope:
- Accounting integration
- Invoice generation
- Full inventory deduction
- Advanced scheduling
```

ถ้าอยู่นอก Scope ห้าม Claude ขยายงานเอง

---

## 5. Inspect Existing Code ก่อนแก้

Claude ต้องค้นหา codebase ก่อน:

```text
Before coding:
1. Inspect project structure.
2. Find related pages/components.
3. Inspect MongoDB models.
4. Inspect existing API patterns.
5. Inspect authentication/RBAC.
6. Inspect upload utilities.
7. Inspect PDF utilities.
8. Inspect reusable UI components.
9. Reuse existing architecture where appropriate.
10. Do not duplicate existing functionality.
```

หลัก:

> Reuse existing architecture before introducing new architecture.

---

## 6. UI/UX Requirements

อย่าบอกแค่ “ทำให้สวย”

ระบุพฤติกรรม:

```text
Desktop:
- clean enterprise ERP layout
- clear section hierarchy
- consistent spacing
- clear Normal/Abnormal controls

Mobile:
- touch-friendly controls
- avoid dense desktop tables
- stack information when necessary

Tablet/iPad:
- support portrait and landscape
- checklist must remain easy to scan
- signature must support touch/stylus
```

### Impeccable UI Standard

ถ้าต้องการคุณภาพระดับสูง:

- consistent spacing
- typography hierarchy
- alignment
- visual hierarchy
- hover/focus/disabled states
- responsive behavior
- accessibility
- loading state
- empty state
- error state
- confirmation state

หลีกเลี่ยง:

- random colors
- excessive gradients
- unnecessary animations
- oversized buttons
- fake/hardcoded production data
- inconsistent components

---

## 7. User Flow

Claude เข้าใจระบบได้ดีขึ้นเมื่อมี Flow:

```text
Service Engineer
→ Open Service Reports
→ Create Report
→ Select Customer
→ Select Project/Quotation
→ Select Checklist Template
→ Inspect Equipment
→ Mark Normal/Abnormal
→ If Abnormal: Photo + Remark + Result
→ Complete Report
→ Engineer Signs
→ Generate PDF
→ Send Customer Acceptance
→ Customer Confirms
→ ERP changes status to ACCEPTED
```

---

## 8. Checklist Design

ตัวอย่างโครงสร้าง:

```text
Service Report
├── Customer Information
├── Equipment Information
├── Maintenance
│   ├── Item 1
│   ├── Item 2
│   └── Item 3
├── Control System
│   ├── Item 1
│   └── Item 2
├── Inspection Result
├── Abnormal Findings
│   ├── Photo
│   ├── Remark
│   └── Result
├── Final Remark
└── Signatures
    ├── Service Engineer
    └── Customer
```

Checklist item อาจมี:

```text
category
title
description
status
remark
result
attachments[]
sortOrder
```

---

## 9. Normal / Abnormal Behavior

ต้องบอก Behavior:

```text
When Normal is selected:
- save status = normal
- abnormal fields remain hidden/optional

When Abnormal is selected:
- show photo attachment
- show abnormal remark
- show inspection result
- clearly indicate required information
- validate before submission
```

อย่าเขียนแค่:

> If abnormal, add photo.

---

## 10. Database Requirements

อย่าบอกเพียง “save to MongoDB”

ตัวอย่าง:

```text
ServiceReport:
- reportNumber
- customerId
- quotationId (optional)
- projectId (optional)
- serviceEngineerId
- serviceDate
- checklistTemplateId
- checklistItems[]
- attachments[]
- finalRemark
- engineerSignature
- customerSignature
- customerAcceptanceStatus
- customerAcceptedAt
- createdAt
- updatedAt
```

ต้องพิจารณา:

- required/optional
- relationships
- indexes
- unique fields
- audit fields
- status transitions
- soft delete ถ้าระบบใช้อยู่แล้ว

---

## 11. API Requirements

ตัวอย่าง:

```text
GET    /api/service-reports
GET    /api/service-reports/:id
POST   /api/service-reports
PATCH  /api/service-reports/:id
DELETE /api/service-reports/:id

GET    /api/service/checklist-templates
POST   /api/service/checklist-templates
PATCH  /api/service/checklist-templates/:id
DELETE /api/service/checklist-templates/:id

POST   /api/service-reports/:id/attachments
POST   /api/service-reports/:id/signature
POST   /api/service-reports/:id/send-acceptance
POST   /api/service-reports/:id/customer-acceptance
```

แต่ต้องตรวจ Convention ของโปรเจกต์เดิมก่อน

---

## 12. RBAC / Permissions

ทุก ERP Feature ควรระบุ Permission:

```text
Service Engineer:
- create reports
- edit own reports
- upload attachments
- sign reports
- send acceptance request

Service Manager:
- view all reports
- edit reports
- manage checklist templates
- approve reports

Admin:
- full access

Sales:
- view reports related to their quotations
- cannot modify inspection results
```

ห้ามแก้ปัญหาด้วยการให้ทุกคนเป็น Admin

---

## 13. Validation

ต้องมีทั้ง Client และ Server validation:

```text
- customer is required
- service date is required
- engineer is required
- checklist must contain an item
- every item must have a status
- abnormal items require required information
- signature cannot be blank
- acceptance cannot be duplicated
```

---

## 14. Loading / Empty / Error

ทุกหน้าให้คิดอย่างน้อย:

```text
Loading
Empty
Success
Error
```

ตัวอย่าง:

```text
Loading:
Show skeleton/loading indicator.

Empty:
"No service reports found."

Error:
"Unable to load service reports. Please try again."
```

ห้ามปล่อยหน้าขาวหรือ error stack ให้ผู้ใช้เห็น

---

## 15. PDF

Service Report ควรออกเป็น A4 Landscape:

```text
┌──────────────────────────────────────────────────────────────┐
│ LOGO                    SERVICE REPORT             REPORT NO │
├──────────────────────────────────────────────────────────────┤
│ Customer | Project | Equipment | Service Date | Engineer     │
├──────────────────────────────────────────────────────────────┤
│ MAINTENANCE                                                  │
├──────────────┬────────────────┬──────────┬───────────────────┤
│ Checklist    │ Description    │ Status   │ Remark / Result   │
├──────────────┼────────────────┼──────────┼───────────────────┤
│ Item 1       │ ...            │ Normal   │ ...               │
│ Item 2       │ ...            │ Abnormal │ See photo         │
└──────────────┴────────────────┴──────────┴───────────────────┘

Abnormal Findings / Attachments

Final Remark

┌─────────────────────┐       ┌─────────────────────┐
│ Service Engineer    │       │ Customer            │
│ Signature           │       │ Signature           │
└─────────────────────┘       └─────────────────────┘
```

ต้องทดสอบ PDF จริงหลังทำเสร็จ ไม่ใช่ดูเฉพาะ Browser

---

## 16. Digital Signature

ต้องรองรับ:

- Mouse
- Touch
- Stylus
- iPad / Apple Pencil

Behavior:

```text
Sign
→ Clear
→ Redraw
→ Save
→ Preview
```

ต้องตรวจ:

- blank signature
- accidental submission
- authorization
- แก้ signature หลัง acceptance

---

## 17. LINE OA / Customer Acceptance

Flow:

```text
ERP
↓
Create Service Report
↓
Send LINE OA
↓
Customer receives request
↓
Customer opens confirmation page
↓
Reviews document
↓
Confirms
↓
Verified callback/webhook
↓
ERP updates ACCEPTED
```

กฎสำคัญ:

```text
Sending a LINE message must NEVER automatically mark the report as ACCEPTED.

Only a verified customer confirmation event can change the status to ACCEPTED.
```

ตัวอย่าง status:

```text
DRAFT
COMPLETED
SENT
VIEWED
ACCEPTED
REJECTED
```

---

## 18. Security

โดยเฉพาะ Public Customer Approval:

- secure random/signed token
- token expiration
- do not expose sensitive database information
- verify webhook
- verify authorization
- prevent duplicate acceptance
- audit acceptance
- never expose secrets in frontend
- never hardcode API keys

---

## 19. No Fake Data

กฎ:

```text
Do not use fake/hardcoded production data.

Use:
- MongoDB
- existing APIs
- authenticated user
- real customer data
- real quotation/project data
```

Mock data ใช้ได้เฉพาะ isolated UI testing และต้องไม่หลุด Production

---

## 20. Scope Guard

ใช้ข้อความนี้ใน Prompt:

```text
Only modify files necessary for this feature.

Do not:
- redesign unrelated pages
- refactor unrelated modules
- change unrelated business rules
- replace authentication
- replace database architecture
- introduce dependencies unless necessary

If an unrelated issue is discovered:
- do not silently change it
- report it separately
```

---

## 21. Edge Cases

ก่อนเริ่ม ให้คิด:

### Data
- ไม่มีข้อมูล?
- ข้อมูลซ้ำ?
- ถูกลบ?
- Database ล่ม?

### User
- ไม่มี Permission?
- Session หมดอายุ?
- หลายคนแก้พร้อมกัน?

### File
- รูปใหญ่?
- ไฟล์ผิดประเภท?
- Upload fail?
- Delete fail?

### PDF
- ข้อมูลเยอะหลายหน้า?
- ตารางแตกหน้า?
- รูปใหญ่?
- Font ภาษาไทย?
- Signature หาย?

### Mobile
- หน้าจอเล็ก?
- Keyboard บัง?
- Touch ไม่ติด?
- Signature canvas ผิดขนาด?

### Integration
- LINE ส่งไม่สำเร็จ?
- Webhook ส่งซ้ำ?
- Customer กดยืนยันสองครั้ง?
- Token หมดอายุ?

---

# Claude Implementation Prompt Template

```text
You are working on an existing ERP application.

Your task is to implement:

[FEATURE NAME]

## 1. Current Problem
[Explain the current problem.]

## 2. Business Requirement
[Explain why the business needs this.]

## 3. Users
[List roles.]

## 4. Scope

### In Scope
- ...

### Out of Scope
- ...

## 5. Existing System Investigation

Before coding:
- inspect project structure
- find related pages/components
- inspect MongoDB models
- inspect API patterns
- inspect authentication/RBAC
- inspect upload/PDF utilities
- inspect reusable UI components

Reuse existing architecture where appropriate.
Do not rewrite unrelated modules.

## 6. Required Behavior
[Detailed user flow and behavior.]

## 7. UI/UX Requirements
[Desktop]
[Mobile]
[Tablet/iPad]

Use an enterprise-quality ERP interface.
Prioritize usability, consistency, accessibility, and responsive behavior.

## 8. Database Requirements
[Models/fields/indexes/relationships.]

## 9. API Requirements
[Endpoints/actions.]

## 10. RBAC / Permissions
[Permissions by role.]

## 11. Validation
[Client and server validation.]

## 12. Loading / Empty / Error States
[Required states.]

## 13. PDF / Export Requirements
[If applicable.]

## 14. External Integrations
[LINE OA / Email / etc.]

## 15. Security Requirements
[Authentication, authorization, tokens, webhook, etc.]

## 16. Technical Constraints

- Do not use fake production data.
- Do not hardcode secrets.
- Reuse existing architecture.
- Do not modify unrelated modules.
- Maintain backward compatibility where possible.

## 17. Testing

Test:
- happy path
- validation
- permissions
- error states
- mobile
- tablet
- PDF
- integration behavior

## 18. Definition of Done

- feature works end-to-end
- MongoDB persistence works
- API validation works
- RBAC works server-side
- mobile/tablet works
- loading/empty/error states exist
- PDF works
- no fake production data
- no console errors
- no TypeScript errors
- lint/build passes
- existing functionality is not broken

Before finishing:
1. Review changes.
2. Run type/lint/build checks.
3. Check regressions.
4. Verify database/API behavior.
5. Summarize files changed and why.
```

---

# Claude “Think Before Coding” Instruction

ใช้กับงานใหญ่:

```text
Do not immediately start coding.

First:
1. Analyze the existing architecture.
2. Identify relevant files.
3. Explain the implementation plan.
4. Identify risks and edge cases.
5. Identify database/API changes.
6. Identify reusable components.
7. Then implement.

Do not ask unnecessary questions if the codebase already provides the answer.
Make reasonable decisions based on the existing architecture and document important assumptions.
```

---

# Codex Review Prompt

```text
Review the implementation of:

[FEATURE NAME]

Perform a strict code review.

Check:
1. Functional correctness
2. Business logic
3. API correctness
4. MongoDB schema/query correctness
5. Authentication
6. RBAC/authorization
7. Validation
8. Security
9. File upload security
10. PDF generation
11. Responsive UI
12. Mobile/iPad behavior
13. Error handling
14. Loading/empty states
15. Performance
16. Race conditions
17. Data consistency
18. Regression risks
19. TypeScript/lint/build issues
20. Maintainability

Do not modify the implementation.

Create:

docs/CODEX_REVIEW_REPORT.md

The report must contain:

# Summary
# Critical Issues
# High Priority Issues
# Medium Priority Issues
# Low Priority Issues
# Security Issues
# Performance Issues
# UX Issues
# Recommended Fixes
# Files Reviewed

For every issue include:
- severity
- file
- relevant code/area
- problem
- why it matters
- recommended fix

If no issue exists:
"No issues found."
```

---

# Claude Follow-up Prompt

```text
Read:

docs/CODEX_REVIEW_REPORT.md

You previously implemented [FEATURE NAME].

Now fix the issues identified by the Codex review.

Rules:
1. Read the entire report first.
2. Prioritize Critical and High issues.
3. Fix valid Medium/Low issues within scope.
4. Do not blindly apply recommendations that conflict with the architecture.
5. Verify every fix.
6. Do not introduce unrelated changes.
7. Re-run build/type/lint checks.
8. Re-check API/database behavior.
9. Re-check RBAC/security.
10. Re-check responsive UI.

At the end provide:
- issues fixed
- issues intentionally not fixed and why
- files changed
- tests/checks performed
- remaining risks
```

---

# ประชุมทีมก่อนลงมือ (`/team-meeting`)

ตั้งแต่ 2026-09-22 โปรเจกต์มี "ทีม agent" สำหรับวางแผน: **หัวหน้า 1 คน + 8 แผนก** ทุกแผนกอ่านโค้ดได้อย่างเดียว
ไม่แก้ไฟล์ใดๆ ระหว่างประชุม (ไฟล์อยู่ใน `.claude/agents/` และ `.claude/skills/team-meeting/` บนเครื่องนี้ ไม่อยู่ใน git)

| แผนก | ดูแลเรื่อง |
|---|---|
| หัวหน้าทีม (`team-lead`) | รวบรวมรายงาน ตรวจว่าใครถูก ตัดสินข้อขัดแย้ง เขียนสรุปการประชุม |
| ธุรกิจและผู้ใช้งาน (`business-analyst`) | งานจริงของแต่ละแผนก เส้นทางเอกสาร ภาษี/บัญชีไทย |
| หน้าบ้านและ UI (`frontend-ui`) | หน้าจอ ฟอร์ม ใบพิมพ์ ข้อความสองภาษา auto-save ดีไซน์ |
| หลังบ้านและ API (`backend-api`) | route, workflow อนุมัติ, เลขที่เอกสาร |
| ข้อมูล (`database`) | โครงสร้างข้อมูล ข้อมูลเก่าใน production เงิน การเก็บ 10 ปี |
| ความปลอดภัยและสิทธิ์ (`security-rbac`) | ใครเห็น/ทำอะไรได้ การอัปโหลด ช่องโหว่ |
| ทดสอบ (`qa-testing`) | เกณฑ์ตรวจรับ เทสต์ การตรวจบนเบราว์เซอร์ |
| เซิร์ฟเวอร์และดีพลอย (`devops-infra`) | VPS, Docker, CI, env, สิ่งที่เจ้าของต้องทำบนเซิร์ฟเวอร์ |
| เอกสารและประวัติ (`docs-historian`) | เคยทำ/เคยถอดออกแล้วหรือยัง ต้องอัปเดตเอกสารไหน |

## ใช้เมื่อไร

- งานใหญ่ งานที่แตะหลายส่วน (หน้าจอ + API + ฐานข้อมูล + สิทธิ์) หรือยังไม่แน่ใจว่าควรทำแบบไหน → ประชุม
- งานเล็กที่ชัดอยู่แล้ว (แก้คำผิด แก้บั๊กจุดเดียว) → ไม่ต้องประชุม สั่งตรงได้เลย
  การประชุมใช้ token ราว 6 เท่าของการถามครั้งเดียว

## วิธีสั่ง

```
/team-meeting <เรื่องที่อยากวางแผน>
```

หรือพูดว่า "ประชุมทีมเรื่อง…" · อยากให้ครบทุกแผนกให้พูดว่า **"ประชุมเต็มคณะ"** (ปกติจะเลือก 4–6 แผนกที่เกี่ยว)
Prompt ที่ดีสำหรับการประชุมใช้หลักเดียวกับคู่มือนี้ทั้งหมด — ยิ่งบอก Current Problem, Business Requirement
และ Scope ชัด แต่ละแผนกยิ่งวิเคราะห์ตรงจุด

## สิ่งที่จะได้กลับมา

1. แต่ละแผนกวิเคราะห์พร้อมกันจากมุมของตัวเอง แล้วส่งรายงานให้หัวหน้า
2. หัวหน้าสรุปเป็น: สิ่งที่เห็นตรงกัน · ประเด็นที่เห็นต่างและคำตัดสิน · **เรื่องที่เจ้าของต้องตัดสินใจ** (มีตัวเลือกและคำแนะนำ) ·
   แผนงานทีละขั้น · ความเสี่ยง · สิ่งที่ไม่ทำรอบนี้ · เกณฑ์ว่าเสร็จ
3. **Claude จะหยุดรอให้อนุมัติ** — ไม่แก้ไฟล์ใดๆ จนกว่าจะตอบว่า "อนุมัติ" หรือบอกว่าอยากแก้ตรงไหน
   ถ้าขอแก้เรื่องที่กระทบหลายแผนก จะประชุมรอบใหม่เฉพาะแผนกที่เกี่ยว

หมายเหตุ: หัวหน้าเรียกลูกทีมเองไม่ได้ (Claude Code ไม่ให้ agent เรียก agent ต่อ) — Claude ในหน้าต่างหลักเป็น
ผู้ดำเนินการประชุมแทน ผลลัพธ์เหมือนกัน

---

# Prompt Quality Checklist

ก่อนส่ง Prompt ให้ Claude:

- [ ] Current Problem ชัด
- [ ] Business Requirement ชัด
- [ ] Scope / Out of Scope ชัด
- [ ] Existing code ต้องถูกตรวจสอบก่อน
- [ ] User roles ชัด
- [ ] UI behavior ชัด
- [ ] Mobile/iPad ชัด
- [ ] Database ชัด
- [ ] API ชัด
- [ ] RBAC ชัด
- [ ] Validation ชัด
- [ ] Loading state
- [ ] Empty state
- [ ] Error state
- [ ] Security
- [ ] Integration
- [ ] Edge cases
- [ ] Definition of Done
- [ ] No fake/hardcoded production data
- [ ] No unrelated changes

---

# หลักคิด 10 ข้อ

1. **Inspect before coding.**
2. **Understand the business before designing the UI.**
3. **Reuse existing architecture before creating new architecture.**
4. **Describe behavior, not just appearance.**
5. **Every feature needs permissions and validation.**
6. **Every page needs loading, empty, success, and error states.**
7. **Never hardcode production data.**
8. **Think about mobile/tablet when the feature is used outside the office.**
9. **Think about edge cases before implementation.**
10. **Define exactly what “Done” means.**

---

# Final Prompt Philosophy

Prompt ที่ดีควรตอบ 5 คำถาม:

```text
WHAT
What are we building?

WHY
Why does the business need it?

WHO
Who uses it and what permissions do they have?

HOW
How should the UI, API, database, integration, and workflow behave?

DONE
How do we know the implementation is complete and correct?
```

หลักสุดท้าย:

> Think first.
> Inspect the existing system.
> Understand the business.
> Define the boundaries.
> Design the user flow.
> Define the data.
> Define permissions.
> Handle failures.
> Implement.
> Test.
> Review.
> Fix.
> Verify.

เป้าหมายไม่ใช่ “เขียนโค้ดให้เร็วที่สุด”

แต่คือ:

> **ทำให้ Requirement ถูกเข้าใจ → Implement ได้ตรง → Review ได้ → แก้ไขได้ → Maintain ต่อได้**
