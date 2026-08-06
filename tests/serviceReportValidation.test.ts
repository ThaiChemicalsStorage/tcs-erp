import { describe, it, expect } from "vitest";
import {
  validateServiceReportForSave, validateServiceReportForCompletion, validateServiceChecklist,
  sanitizeServiceTemplateSections, MAX_CHECKLIST_GROUPS_PER_SECTION,
  type ServiceReportValidationInput,
} from "../src/lib/validation/serviceReportValidation";
import type { ServiceReportTemplateSnapshot, ServiceChecklistSectionValue } from "../src/lib/serviceReports";

/** A small synthetic template snapshot exercising both item kinds and one optional add-on section
 * — deliberately not the real seeded taxonomy, so these tests stay isolated from future edits to
 * the actual checklist content. */
function testTemplateSnapshot(): ServiceReportTemplateSnapshot {
  return {
    templateId: "tpl-1", templateCode: "TEST", templateName: "Test Template", version: "1.0",
    sourceHash: "hash", capturedAt: "2026-08-06T00:00:00.000Z",
    sections: [
      {
        key: "core", title: "Core", isOptionalAddon: false, sortOrder: 0,
        groups: [
          {
            key: "blower", title: "Blower", sortOrder: 0,
            items: [
              { key: "vibration", label: "Vibration Check", kind: "normalAbnormal", sortOrder: 0 },
              { key: "flowRate", label: "Flow Rate", kind: "measurement", sortOrder: 1 },
            ],
          },
        ],
      },
      {
        key: "addon", title: "Dust Collector (optional)", isOptionalAddon: true, sortOrder: 1,
        groups: [
          {
            key: "dustCollector", title: "Dust Collector", sortOrder: 0,
            items: [{ key: "regulator", label: "Regulator", kind: "normalAbnormal", sortOrder: 0 }],
          },
        ],
      },
    ],
  };
}

const samplePhoto = { id: "photo-1", fileName: "vibration.jpg", url: "/api/service-reports/x/photos/photo-1/download?key=k", size: 1234, uploadedAt: "2026-08-06T00:00:00.000Z" };

/** A checklist where every applicable item (core section + addon excluded) is fully answered. */
function completeChecklist(includeAddon = false): ServiceChecklistSectionValue[] {
  return [
    { key: "core", included: true, groups: [{ key: "blower", items: [
      { key: "vibration", status: "normal", abnormalDetail: "", measurementValue: "", photos: [] },
      { key: "flowRate", status: "not_selected", abnormalDetail: "", measurementValue: "120 CMH", photos: [] },
    ] }] },
    { key: "addon", included: includeAddon, groups: [{ key: "dustCollector", items: [
      { key: "regulator", status: includeAddon ? "normal" : "not_selected", abnormalDetail: "", measurementValue: "", photos: [] },
    ] }] },
  ];
}

function validInput(includeAddon = false): ServiceReportValidationInput {
  return {
    customerSnapshot: { companyName: "บริษัท ทดสอบ จำกัด", contactName: "คุณสมชาย", address: "", taxId: "", phone: "0800000000", email: "", projectName: "" },
    serviceLocation: "โรงงานลูกค้า", projectOrJobCode: "", serviceSystemName: "Wet Scrubber", serviceType: "PM",
    inspectionDate: "2026-08-06", reportDate: "2026-08-06", nextPmDate: "",
    assignedServiceEngineerId: "user-1", onSiteContactName: "", onSiteContactPhone: "",
    overallCustomerSummary: "", overallRemark: "",
    checklist: completeChecklist(includeAddon), templateSnapshot: testTemplateSnapshot(),
  };
}

describe("Service Report checklist validation", () => {
  it("passes when every applicable item is answered", () => {
    const result = validateServiceChecklist(completeChecklist(), testTemplateSnapshot());
    expect(result.valid).toBe(true);
    expect(result.itemErrors).toEqual({});
  });

  it("a not_selected normal/abnormal item fails", () => {
    const checklist = completeChecklist();
    checklist[0].groups[0].items[0].status = "not_selected";
    const result = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(result.valid).toBe(false);
    expect(result.itemErrors["core.blower.vibration"]).toBeTruthy();
  });

  it("abnormal status requires a non-blank abnormalDetail", () => {
    const checklist = completeChecklist();
    checklist[0].groups[0].items[0] = { key: "vibration", status: "abnormal", abnormalDetail: "", measurementValue: "", photos: [samplePhoto] };
    const failing = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(failing.valid).toBe(false);
    expect(failing.itemErrors["core.blower.vibration"]).toBeTruthy();

    checklist[0].groups[0].items[0].abnormalDetail = "เสียงดังผิดปกติ";
    const passing = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(passing.valid).toBe(true);
  });

  it("abnormal status also requires at least one attached photo", () => {
    const checklist = completeChecklist();
    checklist[0].groups[0].items[0] = { key: "vibration", status: "abnormal", abnormalDetail: "เสียงดังผิดปกติ", measurementValue: "", photos: [] };
    const failing = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(failing.valid).toBe(false);
    expect(failing.itemErrors["core.blower.vibration"]).toBeTruthy();

    checklist[0].groups[0].items[0].photos = [samplePhoto];
    const passing = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(passing.valid).toBe(true);
  });

  it("changing Abnormal back to Normal does not require re-clearing abnormalDetail/photos", () => {
    const checklist = completeChecklist();
    checklist[0].groups[0].items[0] = { key: "vibration", status: "normal", abnormalDetail: "เคยพบปัญหาก่อนหน้านี้", measurementValue: "", photos: [samplePhoto] };
    const result = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(result.valid).toBe(true);
  });

  it("a blank measurement value fails", () => {
    const checklist = completeChecklist();
    checklist[0].groups[0].items[1].measurementValue = "";
    const result = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(result.valid).toBe(false);
    expect(result.itemErrors["core.blower.flowRate"]).toBeTruthy();
  });

  it("an excluded optional add-on section's items are skipped entirely", () => {
    const checklist = completeChecklist(false); // addon.included === false, regulator left not_selected
    const result = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(result.valid).toBe(true);
  });

  it("an included optional add-on section's items ARE required", () => {
    const checklist = completeChecklist(true);
    checklist[1].groups[0].items[0].status = "not_selected";
    const result = validateServiceChecklist(checklist, testTemplateSnapshot());
    expect(result.valid).toBe(false);
    expect(result.itemErrors["addon.dustCollector.regulator"]).toBeTruthy();
  });
});

describe("Service Report field validation", () => {
  it("Save (Draft) never requires fields — an empty report passes", () => {
    const result = validateServiceReportForSave({ ...validInput(), customerSnapshot: { companyName: "", contactName: "", address: "", taxId: "", phone: "", email: "", projectName: "" }, serviceLocation: "", inspectionDate: "", reportDate: "" });
    expect(result.valid).toBe(true);
  });

  it("Save still rejects a malformed (non-empty) date", () => {
    const result = validateServiceReportForSave({ ...validInput(), inspectionDate: "2026-13-99" });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.inspectionDate).toBeTruthy();
  });

  it("Completion passes on a fully-filled baseline", () => {
    const result = validateServiceReportForCompletion(validInput());
    expect(result.fieldErrors).toEqual({});
    expect(result.groupErrors).toEqual({});
    expect(result.valid).toBe(true);
  });

  it("Completion requires customer company name, contact, phone, location, system, dates, and engineer", () => {
    const input = validInput();
    const missingCompany = validateServiceReportForCompletion({ ...input, customerSnapshot: { ...input.customerSnapshot, companyName: "" } });
    expect(missingCompany.valid).toBe(false);
    expect(missingCompany.fieldErrors["customerSnapshot.companyName"]).toBeTruthy();

    const missingEngineer = validateServiceReportForCompletion({ ...input, assignedServiceEngineerId: "" });
    expect(missingEngineer.valid).toBe(false);
    expect(missingEngineer.fieldErrors.assignedServiceEngineerId).toBeTruthy();
  });

  it("Completion folds an incomplete checklist into groupErrors.checklist", () => {
    const input = validInput();
    input.checklist[0].groups[0].items[0].status = "not_selected";
    const result = validateServiceReportForCompletion(input);
    expect(result.valid).toBe(false);
    expect(result.groupErrors.checklist?.length).toBeGreaterThan(0);
  });

  it("Completion honors an included optional add-on section", () => {
    const passing = validateServiceReportForCompletion(validInput(true));
    expect(passing.valid).toBe(true);

    const input = validInput(true);
    input.checklist[1].groups[0].items[0].status = "not_selected";
    const failing = validateServiceReportForCompletion(input);
    expect(failing.valid).toBe(false);
  });
});

describe("sanitizeServiceTemplateSections (per-report checklist customization)", () => {
  const base = () => testTemplateSnapshot().sections;

  it("accepts the unchanged base structure round-trip", () => {
    const result = sanitizeServiceTemplateSections(base(), base());
    expect(result).not.toBeNull();
    expect(result).toEqual(base());
  });

  it("accepts added groups and items, reassigning sortOrder by position", () => {
    const proposed = base();
    proposed[0].groups.push({ key: "c-new1", title: "Custom Heading", sortOrder: 99, items: [
      { key: "c-item1", label: "  Custom Item  ", kind: "normalAbnormal", sortOrder: 42 },
    ] });
    const result = sanitizeServiceTemplateSections(proposed, base());
    expect(result).not.toBeNull();
    const added = result![0].groups[1];
    expect(added.key).toBe("c-new1");
    expect(added.sortOrder).toBe(1);
    expect(added.items[0].label).toBe("Custom Item");
    expect(added.items[0].sortOrder).toBe(0);
  });

  it("accepts removed groups and items", () => {
    const proposed = base();
    proposed[0].groups[0].items.splice(0, 1);
    const result = sanitizeServiceTemplateSections(proposed, base());
    expect(result).not.toBeNull();
    expect(result![0].groups[0].items.map((it) => it.key)).toEqual(["flowRate"]);
  });

  it("keeps section identity from the base, never from the payload", () => {
    const proposed = base().map((s) => ({ ...s, title: "HACKED", isOptionalAddon: !s.isOptionalAddon }));
    const result = sanitizeServiceTemplateSections(proposed, base());
    expect(result).not.toBeNull();
    expect(result![0].title).toBe("Core");
    expect(result![0].isOptionalAddon).toBe(false);
    expect(result![1].isOptionalAddon).toBe(true);
  });

  it("rejects non-array input, a missing section, and a removed section", () => {
    expect(sanitizeServiceTemplateSections("nope", base())).toBeNull();
    expect(sanitizeServiceTemplateSections(base().slice(0, 1), base())).toBeNull();
  });

  it("rejects blank labels, duplicate keys, and unknown kinds", () => {
    const blankLabel = base();
    blankLabel[0].groups[0].items[0].label = "   ";
    expect(sanitizeServiceTemplateSections(blankLabel, base())).toBeNull();

    const dupKeys = base();
    dupKeys[0].groups[0].items.push({ ...dupKeys[0].groups[0].items[0] });
    expect(sanitizeServiceTemplateSections(dupKeys, base())).toBeNull();

    const badKind = base() as unknown as Array<{ groups: Array<{ items: Array<{ kind: string }> }> }>;
    badKind[0].groups[0].items[0].kind = "checkbox";
    expect(sanitizeServiceTemplateSections(badKind, base())).toBeNull();
  });

  it("rejects payloads exceeding the group/item caps", () => {
    const tooManyGroups = base();
    tooManyGroups[0].groups = Array.from({ length: MAX_CHECKLIST_GROUPS_PER_SECTION + 1 }, (_, i) => ({
      key: `g-${i}`, title: `G ${i}`, sortOrder: i, items: [],
    }));
    expect(sanitizeServiceTemplateSections(tooManyGroups, base())).toBeNull();
  });
});
