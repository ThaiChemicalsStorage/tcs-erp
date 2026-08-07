import { describe, it, expect } from "vitest";
import {
  mergeServerPhotosIntoChecklist,
  type ServiceChecklistSectionValue,
  type ServiceChecklistItemValue,
  type ServiceChecklistItemPhoto,
} from "../src/lib/serviceReports";

/**
 * Regression tests for the 2026-08-07 bug: uploading a photo reverted every unsaved checklist edit.
 * The photo routes return the whole report, and ServiceReportEditor used to apply it wholesale
 * (setChecklist(updated.checklist)) — so the server's LAST-SAVED item statuses overwrote whatever
 * the user had changed since. The photo itself always attached fine; the visible symptom was an
 * item flipping back from Abnormal to Normal the instant its upload finished.
 */

function item(key: string, over: Partial<ServiceChecklistItemValue> = {}): ServiceChecklistItemValue {
  return { key, status: "not_selected", abnormalDetail: "", measurementValue: "", photos: [], ...over };
}

function checklist(items: ServiceChecklistItemValue[], sectionOver: Partial<ServiceChecklistSectionValue> = {}): ServiceChecklistSectionValue[] {
  return [{ key: "s1", included: true, groups: [{ key: "g1", items }], ...sectionOver }];
}

const photo: ServiceChecklistItemPhoto = {
  id: "photo-1", fileName: "leak.jpg", size: 1024, uploadedAt: "2026-08-07T03:00:00.000Z",
  url: "/api/service-reports/SR-2569-0001/photos/photo-1/download?key=abc",
};

describe("mergeServerPhotosIntoChecklist — unsaved checklist edits survive a photo upload", () => {
  it("the reported scenario: A and B both marked Abnormal unsaved, photo uploaded to A", () => {
    // The user's in-progress state — neither change has been saved.
    const local = checklist([
      item("A", { status: "abnormal", abnormalDetail: "pump leaking" }),
      item("B", { status: "abnormal", abnormalDetail: "belt worn" }),
    ]);
    // What the upload response carries back: the LAST-SAVED report (both items still Normal from a
    // previous save), plus the photo that was just stored against item A.
    const server = checklist([
      item("A", { status: "normal", photos: [photo] }),
      item("B", { status: "normal" }),
    ]);

    const merged = mergeServerPhotosIntoChecklist(local, server);
    const [a, b] = merged[0].groups[0].items;

    expect(a.status, "item A must stay Abnormal — this is the bug").toBe("abnormal");
    expect(a.abnormalDetail).toBe("pump leaking");
    expect(a.photos).toEqual([photo]);

    expect(b.status, "an unrelated unsaved item must not be touched either").toBe("abnormal");
    expect(b.abnormalDetail).toBe("belt worn");
    expect(b.photos).toEqual([]);
  });

  it("keeps unsaved measurement values and a section's included flag", () => {
    const local = checklist([item("M", { measurementValue: "12.5" })], { included: true });
    const server = checklist([item("M", { measurementValue: "", photos: [photo] })], { included: false });

    const merged = mergeServerPhotosIntoChecklist(local, server);
    expect(merged[0].groups[0].items[0].measurementValue).toBe("12.5");
    expect(merged[0].groups[0].items[0].photos).toEqual([photo]);
    expect(merged[0].included).toBe(true);
  });

  it("a deleted photo really disappears — the server stays authoritative for photos", () => {
    const local = checklist([item("A", { status: "abnormal", photos: [photo] })]);
    const server = checklist([item("A", { status: "normal", photos: [] })]);

    const merged = mergeServerPhotosIntoChecklist(local, server);
    expect(merged[0].groups[0].items[0].photos).toEqual([]);
    expect(merged[0].groups[0].items[0].status, "still not a licence to revert the status").toBe("abnormal");
  });

  it("leaves locally-added items, groups and sections alone (no server counterpart yet)", () => {
    const local: ServiceChecklistSectionValue[] = [
      { key: "s1", included: true, groups: [
        { key: "g1", items: [item("A", { photos: [] }), item("c-local", { status: "abnormal" })] },
        { key: "c-group", items: [item("c-x", { status: "abnormal" })] },
      ] },
      { key: "c-section", included: true, groups: [{ key: "c-g", items: [item("c-y", { status: "normal" })] }] },
    ];
    const server = checklist([item("A", { photos: [photo] })]);

    const merged = mergeServerPhotosIntoChecklist(local, server);
    expect(merged[0].groups[0].items[0].photos).toEqual([photo]);
    expect(merged[0].groups[0].items[1]).toEqual(local[0].groups[0].items[1]);
    expect(merged[0].groups[1]).toEqual(local[0].groups[1]);
    expect(merged[1]).toEqual(local[1]);
  });

  it("tolerates a legacy item with no photos array at all", () => {
    const local = checklist([{ key: "A", status: "abnormal", abnormalDetail: "x", measurementValue: "" } as ServiceChecklistItemValue]);
    const server = checklist([{ key: "A", status: "normal", abnormalDetail: "", measurementValue: "" } as ServiceChecklistItemValue]);

    const merged = mergeServerPhotosIntoChecklist(local, server);
    expect(merged[0].groups[0].items[0].photos).toEqual([]);
    expect(merged[0].groups[0].items[0].status).toBe("abnormal");
  });

  it("does not mutate the local checklist it was given", () => {
    const local = checklist([item("A", { status: "abnormal" })]);
    const snapshot = structuredClone(local);
    mergeServerPhotosIntoChecklist(local, checklist([item("A", { photos: [photo] })]));
    expect(local).toEqual(snapshot);
  });
});
