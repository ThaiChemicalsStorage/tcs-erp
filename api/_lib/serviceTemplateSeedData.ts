import type { ServiceChecklistSectionDef } from "../../src/lib/serviceTemplates.js";

/**
 * Hand-transcribed Service Checklist taxonomies (added 2026-08-06, Phase 1) — sourced verbatim
 * from the company's real reference files (`public/รายการตรวจเช็ค.pdf` and `public/Service.xlsx`'s
 * "Sheet1" tab), not invented. Deliberately plain hand-authored data rather than a runtime
 * PDF/xlsx-parsing pipeline (unlike `templateWorkbookParser.ts` for Quotation Templates) — this
 * content is fully extracted and not expected to change; a real parser would be unneeded
 * complexity here. See `upsertServiceTemplates()` in `api/_lib/serviceTemplateHandler.ts` for the
 * idempotent seed-upsert mechanics and `docs/MODULES/Service.md` for the PDF/xlsx-to-field mapping.
 */

export interface ServiceTemplateSeedEntry {
  templateCode: string;
  templateName: string;
  description: string;
  version: string;
  sourceFileName: string;
  sourceSheetName: string;
  sections: ServiceChecklistSectionDef[];
}

function itemsOf(labels: string[], kind: "normalAbnormal" | "measurement" = "normalAbnormal") {
  return labels.map((label, i) => ({
    key: label,
    label,
    kind,
    sortOrder: i,
  }));
}

// ── SVC-AIRPOLLUTION-STD — the clean, authoritative "SERVICE CHECK SHEET" (รายการตรวจเช็ค.pdf) ──

const AIRPOLLUTION_SECTIONS: ServiceChecklistSectionDef[] = [
  {
    key: "systemMaintenance",
    title: "การบำรุงรักษาระบบ",
    isOptionalAddon: false,
    sortOrder: 0,
    groups: [
      {
        key: "blower",
        title: "Blower",
        sortOrder: 0,
        items: [
          { key: "blower.vibration", label: "ตรวจวัดค่าความสั่นสะเทือน (Vibration)", kind: "normalAbnormal", sortOrder: 0 },
          { key: "blower.bearingLubrication", label: "ตรวจสอบการหล่อลื่น Bearing", kind: "normalAbnormal", sortOrder: 1 },
          { key: "blower.beltTension", label: "ตรวจสอบ Belt Tension", kind: "normalAbnormal", sortOrder: 2 },
          { key: "blower.otherAbnormal", label: "การสั่นหรือความผิดปกติอื่นๆ", kind: "normalAbnormal", sortOrder: 3 },
          { key: "blower.externalCondition", label: "ตรวจสอบสภาพภายนอกของ Blower", kind: "normalAbnormal", sortOrder: 4 },
        ],
      },
      {
        key: "visualCheck",
        title: "Visual Check",
        sortOrder: 1,
        items: [
          { key: "visualCheck.ductingAccessories", label: "ตรวจเช็คสภาพ Ducting & Accessories (Hood, Damper)", kind: "normalAbnormal", sortOrder: 0 },
          { key: "visualCheck.unitHousing", label: "ตรวจเช็คสภาพ Unit Housing", kind: "normalAbnormal", sortOrder: 1 },
          { key: "visualCheck.supportDuctingSling", label: "ตรวจเช็คสภาพ Support Ducting & Sling", kind: "normalAbnormal", sortOrder: 2 },
          { key: "visualCheck.leakCheck", label: "ตรวจสอบการรั่วซึม", kind: "normalAbnormal", sortOrder: 3 },
          { key: "visualCheck.gaugeCheck", label: "ตรวจเช็ค Gauge ของอุปกรณ์เครื่องมือวัด", kind: "normalAbnormal", sortOrder: 4 },
          { key: "visualCheck.pipeAccessories", label: "ตรวจเช็คสภาพท่อและ Pipe Accessories (Y-Strainer, Flow meter, etc.)", kind: "normalAbnormal", sortOrder: 5 },
        ],
      },
    ],
  },
  {
    key: "dustCollectorAddon",
    title: "ระบบ Dust Collector (เพิ่มเติม)",
    isOptionalAddon: true,
    sortOrder: 1,
    groups: [
      {
        key: "dustCollector",
        title: "ระบบ Dust Collector",
        sortOrder: 0,
        items: itemsOf([
          "ตรวจเช็ค Regulator",
          "ตรวจเช็คระบบ Puls Jet Valve",
          "ตรวจเช็ค Air Tank",
          "ตรวจเช็ค Dust Tank",
          "ตรวจเช็ค Rotary Valve",
        ]).map((it) => ({ ...it, key: `dustCollector.${it.key}` })),
      },
    ],
  },
  {
    key: "controlSystem",
    title: "เช็คระบบควบคุมการทำงาน",
    isOptionalAddon: false,
    sortOrder: 2,
    groups: [
      {
        key: "electricalEquipment",
        title: "ตรวจสอบอุปกรณ์ไฟฟ้า",
        sortOrder: 0,
        items: [
          { key: "electricalEquipment.check", label: "ตรวจสอบอุปกรณ์ไฟฟ้า (ตรวจเช็คกระแส, ความเร็วรอบมอเตอร์, ฯลฯ)", kind: "normalAbnormal", sortOrder: 0 },
        ],
      },
      {
        key: "airFlow",
        title: "ตรวจเช็ค Air Flow",
        sortOrder: 1,
        items: [
          { key: "airFlow.flowRate", label: "ตรวจวัดอัตราการไหลของอากาศ (Air Flow Rate)", kind: "measurement", sortOrder: 0 },
          { key: "airFlow.differentialPressure", label: "ตรวจสอบค่า Differential Pressure", kind: "measurement", unit: "in.wg", sortOrder: 1 },
          { key: "airFlow.blower", label: "Blower", kind: "measurement", sortOrder: 2 },
          { key: "airFlow.recirculatingPump", label: "Recirculating Pump (ถ้ามี)", kind: "measurement", sortOrder: 3 },
          { key: "airFlow.levelSwitch", label: "Level Switch (ถ้ามี)", kind: "measurement", sortOrder: 4 },
          { key: "airFlow.solenoidValve", label: "Solenoid Valve (ถ้ามี)", kind: "measurement", sortOrder: 5 },
          { key: "airFlow.other", label: "อุปกรณ์อื่นๆ", kind: "measurement", sortOrder: 6 },
        ],
      },
    ],
  },
  {
    key: "chemicalsFeedingAddon",
    title: "ระบบ Chemicals Feeding (เพิ่มเติม)",
    isOptionalAddon: true,
    sortOrder: 3,
    groups: [
      {
        key: "phOrpController",
        title: "pH Controller + pH Probe / ORP Probe",
        sortOrder: 0,
        items: [
          { key: "phOrpController.functionButtons", label: "การทำงานของฟังชั่นต่างๆ และปุ่มกด", kind: "normalAbnormal", sortOrder: 0 },
          { key: "phOrpController.probeCondition", label: "ตรวจเช็คสภาพของตัว Probe", kind: "normalAbnormal", sortOrder: 1 },
          { key: "phOrpController.transmitterCondition", label: "ตรวจเช็คสภาพ Transmitter", kind: "normalAbnormal", sortOrder: 2 },
        ],
      },
      {
        key: "meteringPump",
        title: "Metering Pump",
        sortOrder: 1,
        items: [
          { key: "meteringPump.condition", label: "ตรวจเช็คสภาพและการทำงานของ Metering Pump", kind: "normalAbnormal", sortOrder: 0 },
          { key: "meteringPump.accessories", label: "ตรวจเช็คสภาพของ Accessories และสายสารเคมี", kind: "normalAbnormal", sortOrder: 1 },
        ],
      },
      {
        key: "chemicalTank",
        title: "Chemical Tank",
        sortOrder: 2,
        items: [
          { key: "chemicalTank.condition", label: "ตรวจสอบสภาพถังสารเคมี ตรวจสอบการรั่วซึมของถัง", kind: "normalAbnormal", sortOrder: 0 },
        ],
      },
    ],
  },
];

// ── SVC-CARBON-WETSCRUBBER — the more granular Activated Carbon/Wet Scrubber variant (Service.xlsx "Sheet1") ──

const CARBON_WETSCRUBBER_SECTIONS: ServiceChecklistSectionDef[] = [
  {
    key: "carbonWetScrubberSystem",
    title: "ระบบ Activated Carbon / Wet Scrubber",
    isOptionalAddon: false,
    sortOrder: 0,
    groups: [
      {
        key: "airSystem",
        title: "Flow ลม",
        sortOrder: 0,
        items: [{ key: "airSystem.flow", label: "Flow ลม", kind: "measurement", sortOrder: 0 }],
      },
      {
        key: "controlSystemCheck",
        title: "เช็คระบบควบคุมการทำงาน",
        sortOrder: 1,
        items: [
          { key: "controlSystemCheck.controlPanel", label: "ตู้ควบคุมไฟฟ้า", kind: "normalAbnormal", sortOrder: 0 },
          { key: "controlSystemCheck.indicatorLights", label: "หลอดไฟแสดงสัญญาณและสถานะต่างๆ", kind: "normalAbnormal", sortOrder: 1 },
          { key: "controlSystemCheck.functionCheck", label: "ตรวจสอบการทำงานของฟังชั่นต่างๆ", kind: "normalAbnormal", sortOrder: 2 },
          { key: "controlSystemCheck.blowerCurrentRpm", label: "Blower เช็คกระแส / RPM", kind: "measurement", sortOrder: 3 },
        ],
      },
      {
        key: "wetScrubber1",
        title: "งาน Wet Scrubber",
        sortOrder: 2,
        items: [
          { key: "wetScrubber1.recirculatingPumpCurrent", label: "Recirculaing Pump เช็คกระแส", kind: "measurement", sortOrder: 0 },
          { key: "wetScrubber1.levelSwitch", label: "Level Switch", kind: "normalAbnormal", sortOrder: 1 },
          { key: "wetScrubber1.solenoidValve", label: "Solenoid Valve", kind: "normalAbnormal", sortOrder: 2 },
        ],
      },
      {
        key: "visualCheck",
        title: "Visual Check",
        sortOrder: 3,
        items: [
          { key: "visualCheck.blowerVibrationRpm", label: "เช็คสภาพ Blower / สั่น / RPM", kind: "normalAbnormal", sortOrder: 0 },
          { key: "visualCheck.flexibleForBlower", label: "เช็ค Flexible for Blower", kind: "normalAbnormal", sortOrder: 1 },
          { key: "visualCheck.packingMediaCondition", label: "สภาพและปริมาณ Packing Media / Filter / Demister", kind: "normalAbnormal", sortOrder: 2 },
          { key: "visualCheck.stackEmission", label: "ไอน้ำ/ฝุ่นคาร์บอน ปากปล่อง Stack", kind: "normalAbnormal", sortOrder: 3 },
          { key: "visualCheck.externalCondition", label: "สภาพภายนอกของระบบ", kind: "normalAbnormal", sortOrder: 4 },
          { key: "visualCheck.damperCondition", label: "เช็คสภาพ Damper", kind: "normalAbnormal", sortOrder: 5 },
          { key: "visualCheck.supportSlingCondition", label: "เช็คสภาพ Support/Sling ของอุปกรณ์ต่างๆ", kind: "normalAbnormal", sortOrder: 6 },
          { key: "visualCheck.instrumentWiringCondition", label: "เช็คสภาพสายของอุปกรณ์ Instrument ต่างๆ", kind: "normalAbnormal", sortOrder: 7 },
          { key: "visualCheck.lastPmCycle", label: "สอบถามรอบการ PM ล่าสุด", kind: "normalAbnormal", sortOrder: 8 },
          { key: "visualCheck.diffPressure", label: "Diff Pressure (ถ้ามี)", kind: "measurement", sortOrder: 9 },
        ],
      },
      {
        key: "wetScrubber2",
        title: "งาน Wet Scrubber",
        sortOrder: 4,
        items: [
          { key: "wetScrubber2.sprayNozzle", label: "หัวสเปรย์", kind: "normalAbnormal", sortOrder: 0 },
          { key: "wetScrubber2.pipeAccessories", label: "เช็คสภาพท่อและ Pipe Accessories (Y Strainer, Valve, Flow Meter)", kind: "normalAbnormal", sortOrder: 1 },
          { key: "wetScrubber2.pressureGauge", label: "Pressure Gauge", kind: "normalAbnormal", sortOrder: 2 },
        ],
      },
      {
        key: "chemicalsFeeding",
        title: "ระบบ Chemicals Feeding",
        sortOrder: 5,
        items: [
          { key: "chemicalsFeeding.phController", label: "pH Controller + pH Probe", kind: "normalAbnormal", sortOrder: 0 },
          { key: "chemicalsFeeding.meteringPump", label: "Metering Pump", kind: "normalAbnormal", sortOrder: 1 },
          { key: "chemicalsFeeding.chemicalTank", label: "Chemical Tank", kind: "normalAbnormal", sortOrder: 2 },
          { key: "chemicalsFeeding.tdsController", label: "TDS Controller + TDS Probe", kind: "normalAbnormal", sortOrder: 3 },
        ],
      },
    ],
  },
];

export const SERVICE_TEMPLATE_SEED_DATA: ServiceTemplateSeedEntry[] = [
  {
    templateCode: "SVC-AIRPOLLUTION-STD",
    templateName: "Service Check Sheet - ระบบบำบัดอากาศทั่วไป",
    description: "รายการตรวจเช็คมาตรฐานสำหรับระบบบำบัดอากาศ (Blower/Visual Check, Dust Collector, ระบบควบคุมการทำงาน, Chemicals Feeding) — จากแบบฟอร์ม SERVICE CHECK SHEET",
    version: "1.0",
    sourceFileName: "รายการตรวจเช็ค.pdf",
    sourceSheetName: "",
    sections: AIRPOLLUTION_SECTIONS,
  },
  {
    templateCode: "SVC-CARBON-WETSCRUBBER",
    templateName: "Service Check Sheet - Activated Carbon / Wet Scrubber",
    description: "รายการตรวจเช็คแบบละเอียดสำหรับระบบ Activated Carbon และ Wet Scrubber",
    version: "1.0",
    sourceFileName: "Service.xlsx",
    sourceSheetName: "Sheet1",
    sections: CARBON_WETSCRUBBER_SECTIONS,
  },
];
