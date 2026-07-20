import type {
  QuotationTemplate, TemplateSection, TemplateItem, TemplateItemType,
  TemplateEditableParameter, TemplateTermLine, TemplateDynamicField, TemplateConditionConfig,
} from "../../src/lib/quotationTemplates.js";

/**
 * Real Quotation Template content, hand-transcribed from every relevant row of the real Excel
 * workbook `public/Scope of work new template for air pollution control_Technic.xlsx` (4 sheets:
 * "Wet scrubber", "Activated carbon", "Bag filter", "FRP Tank and LI") — added 2026-07-14 per the
 * P'Suki/P'Keng business requirement. See docs/MODULES/QuotationTemplates.md for the full
 * row-by-row classification write-up, the exact section/row mapping per template, and why FRP
 * Tank and FRP Lining (which share one sheet) are split at row 22 ("FRP Tank" heading).
 *
 * **Classification rules applied** (see the doc above for the full rationale with examples):
 * - A row with only descriptive text and no No./Qty/Unit → a **section** heading.
 * - A row with a top-level No. (1, 2, 3…) → an **item**.
 * - A row numbered "N.M" (in either the source's No. column or embedded in its description text
 *   — the two source sheets use both conventions inconsistently) → a **subItem** of item N.
 * - A row with no numbering but its own real Qty/Unit (e.g. "pH probe and controller") → promoted
 *   to its own subItem rather than folded into the preceding item's specification list, since it
 *   represents its own orderable/quantifiable unit of work.
 * - Every other loose description line → a **specification** string on the nearest preceding
 *   item/subItem (not a separate top-level entry — see `TemplateItem.specifications`).
 * - A "Label : value" line whose value is a placeholder (`xxx`, `xxxxxx`, blank after the colon,
 *   or a bare unit token) → an **editableParameter** instead of a plain specification — value
 *   always starts blank; the Sales user fills in the real project figure after applying the
 *   template. A line with the label/value pattern but a *real, non-placeholder* value (e.g.
 *   "Static pressure: 4.5 in.wg") stays a plain specification — it's genuine source content, not
 *   an invented default.
 * - Rows containing internal-staff language (addressing a colleague by name + "รีวิว" [review], or
 *   "เขียนมือ...เซนต์/เซ็นกำกับ" [an internal hand-annotation procedure note]) → **internalNotes**,
 *   `visibleToCustomer: false`, never copied into a quotation's customer-facing content or printed.
 *   Exactly 3 such rows exist across the whole workbook (see the doc for all 3, each reproduced
 *   verbatim inside its template below with a comment marking it).
 * - Rows describing payment %/schedule, warranty duration, or withholding-tax instructions →
 *   `defaultTerms` (`paymentTerm`/`warrantyTerm`/`taxNote`), not regular items — these become
 *   `Quote.paymentTerms`/`Quote.remarks` text when a template is applied (see
 *   `api/_lib/quotationApplyTemplate.ts`), not quotation line items.
 *
 * **No prices**: the workbook's Material/Labor/Total Cost columns are blank for every single row
 * across all 4 sheets (verified by reading every cell) — so no template item here carries any
 * price data, by design, matching the source exactly. Nothing was invented.
 */

let seq = 0;
function itemId(templateCode: string): string {
  seq += 1;
  return `ti-${templateCode}-${seq}`;
}

interface ParamDef { label: string; unit?: string; value?: string }
interface ItemDef {
  name: string;
  qty?: number | null;
  unit?: string;
  specs?: string[];
  params?: ParamDef[];
  notes?: string[];
}

function makeParam(p: ParamDef): TemplateEditableParameter {
  return { label: p.label, value: p.value ?? "", unit: p.unit ?? "", editable: true };
}

function makeItem(templateCode: string, itemType: TemplateItemType, def: ItemDef, sortOrder: number): TemplateItem {
  return {
    id: itemId(templateCode),
    itemType,
    itemCode: String(sortOrder + 1),
    name: def.name,
    description: def.name,
    quantity: def.qty ?? null,
    unit: def.unit ?? "",
    specifications: def.specs ?? [],
    subDetails: [],
    editableParameters: (def.params ?? []).map(makeParam),
    internalNotes: def.notes ?? [],
    visibleToCustomer: true,
    sortOrder,
  };
}

/** Builds one section: each entry is a top-level item optionally followed by its subItems, flattened into one ordered array (matching how the source sheets themselves lay out N / N.1 / N.2 rows in sequence). */
function buildSection(
  templateCode: string, sectionSortOrder: number, title: string,
  entries: { item: ItemDef; subs?: ItemDef[] }[],
): TemplateSection {
  const items: TemplateItem[] = [];
  let order = 0;
  for (const entry of entries) {
    items.push(makeItem(templateCode, "item", entry.item, order++));
    for (const sub of entry.subs ?? []) {
      items.push(makeItem(templateCode, "subItem", sub, order++));
    }
  }
  return { id: `sec-${templateCode}-${sectionSortOrder}`, title, description: "", sortOrder: sectionSortOrder, items };
}

const SOURCE_FILE = "Scope of work new template for air pollution control_Technic.xlsx";

// ─────────────────────────────────────────────────────────────────────────────
// SC — Wet Scrubber (sheet "Wet scrubber")
// ─────────────────────────────────────────────────────────────────────────────
const WET_SCRUBBER_CODE = "SC-WET-SCRUBBER";
const wetScrubberSections: TemplateSection[] = [
  buildSection(WET_SCRUBBER_CODE, 0, "Preparation work", [
    { item: { name: "Demolish existing system", qty: 1, unit: "lot" } },
    { item: { name: "Safety and protection", qty: 1, unit: "lot" } },
  ]),
  buildSection(WET_SCRUBBER_CODE, 1, "Installation work", [
    {
      item: { name: "Wet Scrubber System", qty: 1, unit: "lot" },
      subs: [
        { name: "1.1 Wet Scrubber capacity", qty: 1, unit: "lot", params: [{ label: "Material" }, { label: "Capacity", unit: "CMH" }] },
        {
          name: "1.2 Internal Components", qty: 1, unit: "lot",
          specs: ["Spray nozzles", "Inspection manhole & drain", "Ladder, safety ring & platform"],
          params: [
            { label: "Packing media (PP) height" },
            // Internal review comment stripped from the customer-facing description; kept verbatim in `notes` below.
            { label: "Mist eliminator (Packing media PP)" },
            { label: "Sump Tank FRP capacity", unit: "m3 (Built-in, Seperate)" },
          ],
          notes: ["รบกวนพี่หมูรีวิวต่อว่าต้องใส่ PP washable ไหม"],
        },
      ],
    },
    {
      item: { name: "Blower", qty: 1, unit: "Unit" },
      subs: [
        {
          name: "2.1 Centrifugal Blower", qty: 1, unit: "Unit",
          specs: ["Material: coated steel", "Capacity: matched with scrubber", "Static pressure: 4.5 in.wg"],
          params: [{ label: "Brand/ Model" }],
        },
        { name: "2.2 Motor IE… Exproof", qty: 1, unit: "Unit" },
        { name: "2.3 Automatic lubrication system", specs: ["Temperature sensor at blower"] },
      ],
    },
    {
      item: { name: "Ducting", qty: 1, unit: "Unit" },
      subs: [
        { name: "3.1 Indoor material", qty: 1, unit: "Unit", params: [{ label: "Indoor material" }] },
        { name: "3.2 Outdoor material", params: [{ label: "Outdoor material" }] },
        { name: "3.3 Dampers material", qty: 1, unit: "Unit", specs: ["Manual / Auto"] },
        {
          name: "3.4 Hood material",
          params: [{ label: "Hood material" }],
          specs: ["Stack", "Ladder, safety ring & platform", "Sampling port according to Thai law ?"],
        },
        // Stack height kept as its own editable parameter — it's a distinct project-specific figure noted after the hood/stack spec cluster in the source.
        { name: "Stack height", params: [{ label: "Stack height", unit: "m." }] },
      ],
    },
    {
      item: { name: "Pump & Water System", qty: 1, unit: "Unit" },
      subs: [
        {
          name: "4.1 Recirculation Pump", qty: 2, unit: "Unit",
          specs: ["Type: Vertical / Horizontal"],
          params: [{ label: "Brand/ Model" }, { label: "Material" }],
        },
        { name: "4.2 Water Piping", specs: ["Material : UPVC"] },
        { name: "pH probe and controller", qty: 1, unit: "lot", params: [{ label: "Brand/ Model" }] },
      ],
    },
    {
      item: { name: "Instrumentation & Control", qty: 1, unit: "lot" },
      subs: [
        { name: "5.1 Wet scrubber control panel", qty: 1, unit: "Unit" },
        { name: "5.2 Inverter", params: [{ label: "Brand/ Model" }] },
        {
          name: "5.3 Instruments", qty: 1, unit: "Unit",
          specs: [
            "Differential pressure gauge \"Magnehelic gauge 0-10 in.wg",
            "Airflow indicator / pressure switch",
            "Water level switch",
            "Temperature sensor in blower",
            "Temperature sensor in water sump",
            "Temperature sensor in duct",
            "Explosion proof control panel",
          ],
        },
      ],
    },
    { item: { name: "Lightning system", qty: 1, unit: "lot" } },
    { item: { name: "Installation and transportation charge", qty: 1, unit: "lot" } },
    { item: { name: "Test and commissioning system\nScope : Pre test", qty: 1, unit: "lot" } },
    { item: { name: "Air Pollution testing", qty: 1, unit: "lot" } },
    { item: { name: "Documentation & Handover; As-built drawings, Operation & Maintenance Manual, Warranty 1Y, Training for operation team", qty: 1, unit: "lot" } },
  ]),
];
const wetScrubberTerms: TemplateTermLine[] = [
  { type: "paymentTerm", text: "30% Down payment. (In cash)" },
  { type: "paymentTerm", text: "40% After material on site, Exclude Electrical control (In cash)." },
  { type: "paymentTerm", text: "20% After installation complete date. (In cash)" },
  { type: "paymentTerm", text: "10% After Commissioning test run of system. (In cash)" },
  { type: "warrantyTerm", text: "Warranty : XX Year after installation complete (ลูกค้าเซนต์รับมอบงาน)" },
  { type: "taxNote", text: "ระบุหักณที่จ่าย งานบริการ กรณีทำสัญญา ต้องแยกสัญญาซื้อขายและสัญญาจ้างติดตั้งงาน หากไม่แยกสัญญา จะถือเป็นสัญญาซื้อขายพร้อมติดตั้ง หักณที่จ่ายทั้งใบเสนอราคา" },
];

// ─────────────────────────────────────────────────────────────────────────────
// SC — Activated Carbon (sheet "Activated carbon")
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVATED_CARBON_CODE = "SC-ACTIVATED-CARBON";
const activatedCarbonSections: TemplateSection[] = [
  buildSection(ACTIVATED_CARBON_CODE, 0, "Preparation work", [
    { item: { name: "Demolish existing system" } },
    {
      item: {
        name: "Main Ducting",
        // "Exhaust Duct, Elbow, Flange, Damper and accessories" (row 5 of the source sheet) was
        // missing from this template entirely — 2026-07-14, Codex review High Priority fix #2,
        // verified against the source workbook directly (not just the review's paraphrase).
        specs: ["Exhaust Duct, Elbow, Flange, Damper and accessories", "Stack", "Ladder, safety ring & platform", "Sampling port according to Thai law ?"],
        params: [{ label: "Material", unit: "Steel, SUS... or FRP" }, { label: "Stack height", unit: "m." }],
      },
    },
    {
      item: {
        name: "Housing Filter System",
        // "Brand : TCS" is a real, non-placeholder source value (row 12) — 2026-07-14, Codex
        // review High Priority fix #3: kept as a plain specification (matches this file's own
        // documented classification rule above: a real-value "Label: value" line stays a
        // specification, not an editableParameter, which by contract always starts blank).
        specs: ["Brand: TCS"],
        params: [
          { label: "Capacity", unit: "CMH" },
          { label: "Size", unit: "W. mm. x L. mm. x H. mm." },
          { label: "Material", unit: "Steel/FRP" },
          { label: "Filter", unit: "PCS" },
        ],
      },
    },
    {
      item: {
        name: "Activated Carbon System",
        // "Brand : TCS" (row 19) and "Material : Steel" (row 22) are real source values — see the
        // Housing Filter System comment above for why they belong in `specs`, not `params`.
        specs: ["Brand: TCS", "Material: Steel"],
        params: [
          { label: "Type", unit: "Vertical/ Horizontal" },
          { label: "Capacity", unit: "CMH" },
          { label: "Size", unit: "W. mm. x L. mm. x H. mm." },
          { label: "Tray carbon", unit: "sets x Thk. mm." },
          { label: "Carbon ID1050", unit: "Kg." },
        ],
      },
      subs: [{ name: "4.1 Steel Platform & Ladder" }],
    },
    {
      item: {
        name: "Blower",
        // "Brand : TCS or equivalent" (row 27) and "Static Pressure : 200 mm wg." (row 30) are
        // real source values — see the Housing Filter System comment above.
        specs: ["Automatic lubrication system", "Temperature sensor at blower", "Brand: TCS or equivalent", "Static Pressure: 200 mm wg."],
        params: [
          { label: "Model" },
          { label: "Capacity", unit: "CMH" },
          { label: "Material", unit: "Steel, SUS... or FRP" },
          { label: "Motor", unit: "xx kW 380V 50Hz" },
        ],
      },
    },
    { item: { name: "Steel Support & Hanger" } },
    {
      item: { name: "Instrument" },
      subs: [
        { name: "6.1 Differential pressure gauge \"Magnehelic gauge 0-10 in.wg", params: [{ label: "Model/Type" }] },
        { name: "6.2 Temp Sensor" },
      ],
    },
    {
      item: { name: "Electrical Control System" },
      subs: [{ name: "7.1 PLC, Inverter xx kW and Damper electrical", specs: ["Explosion proof control panel"] }],
    },
    { item: { name: "Lightning system connect with existing" } },
    { item: { name: "Accessories and Safety cost" } },
    { item: { name: "Installation and transportation charge" } },
    { item: { name: "Test and commissioning system\nScope : Pre test" } },
    { item: { name: "Air Pollution testing" } },
    { item: { name: "Documentation & Handover; As-built drawings, Operation & Maintenance Manual, Warranty 1Y, Training for operation team" } },
  ]),
];
const activatedCarbonTerms: TemplateTermLine[] = [
  { type: "paymentTerm", text: "30% Down payment. (In cash)" },
  { type: "paymentTerm", text: "40% After material on site, Exclude Electrical control (In cash)." },
  { type: "paymentTerm", text: "20% After installation complete date. (In cash)" },
  { type: "paymentTerm", text: "10% After Commissioning test run of system. (In cash)" },
  { type: "taxNote", text: "ระบุหักณที่จ่าย งานบริการ กรณีทำสัญญา ต้องแยกสัญญาซื้อขายและสัญญาจ้างติดตั้งงาน หากไม่แยกสัญญา จะถือเป็นสัญญาซื้อขายพร้อมติดตั้ง หักณที่จ่ายทั้งใบเสนอราคา" },
  { type: "warrantyTerm", text: "Warranty : XX Year after installation complete (ลูกค้าเซนต์รับมอบงาน)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// BF — Bag Filter (sheet "Bag filter", BOQ title "Dust Collector System")
// ─────────────────────────────────────────────────────────────────────────────
const BAG_FILTER_CODE = "BF-BAG-FILTER";
const bagFilterSections: TemplateSection[] = [
  buildSection(BAG_FILTER_CODE, 0, "Preparation work", [
    { item: { name: "Demolish existing system" } },
    {
      item: {
        name: "Main Ducting",
        // "Exhaust Duct, Elbow, Flange, Damper and accessories" (row 5 of the source sheet) was
        // missing from this template entirely — 2026-07-14, Codex review High Priority fix #2,
        // verified against the source workbook directly (not just the review's paraphrase).
        specs: ["Exhaust Duct, Elbow, Flange, Damper and accessories", "Stack", "Ladder, safety ring & platform", "Sampling port according to Thai law ?"],
        params: [{ label: "Material", unit: "Steel, SUS304, Spiral" }, { label: "Stack height", unit: "m." }],
      },
    },
    {
      item: {
        name: "Dust Collector System",
        // "Brand : TCS" (row 12) and "Material : Steel" (row 15) are real, non-placeholder source
        // values — 2026-07-14, Codex review High Priority fix #3: kept as plain specifications
        // (matches this file's own documented classification rule above: a real-value "Label:
        // value" line stays a specification, not an editableParameter, which by contract always
        // starts blank).
        specs: ["Brand: TCS", "Material: Steel"],
        params: [
          { label: "Capacity", unit: "CMH" },
          { label: "Size", unit: "W. mm. x L. mm. x H. mm." },
          { label: "Filter Bag", unit: "PCS (Dia. x L. mm.)" },
          { label: "Filter Bag Type" },
          { label: "Pulse jet valve", unit: "unit" },
        ],
      },
      subs: [
        { name: "3.2 Rotary Valve" },
        { name: "3.3 Steel Platform & Ladder", specs: ["Explosion door"] },
      ],
    },
    {
      item: {
        name: "Blower",
        // "Brand : Kruger or equivalent" (row 23) and "Material : Steel" (row 27) are real source
        // values — see the Dust Collector System comment above.
        specs: ["Automatic lubrication system", "Temperature sensor at blower", "Brand: Kruger or equivalent", "Material: Steel"],
        params: [
          { label: "Model" },
          { label: "Capacity", unit: "CMH" },
          { label: "Static Pressure", unit: "mm wg." },
          { label: "Motor", unit: "xx kW 380V 50Hz" },
        ],
      },
    },
    { item: { name: "Steel Support & Hanger" } },
    {
      item: { name: "Instrument" },
      subs: [{ name: "6.1 Differential pressure gauge", params: [{ label: "Brand/Model" }] }],
    },
    {
      item: { name: "Electrical Control System" },
      subs: [{ name: "7.1 PLC, Inverter xxx kW and Damper electrical", specs: ["Explosion proof control panel"] }],
    },
    { item: { name: "Lightning system connect with existing" } },
    { item: { name: "Accessories and Safety cost" } },
    { item: { name: "Installation and transportation charge" } },
    { item: { name: "Test and commissioning system\nScope : Pre test" } },
    { item: { name: "Air Pollution testing" } },
    { item: { name: "Documentation & Handover; As-built drawings, Operation & Maintenance Manual, Warranty 1Y, Training for operation team" } },
  ]),
];
const bagFilterTerms: TemplateTermLine[] = [
  { type: "paymentTerm", text: "30% Down payment. (In cash)" },
  { type: "paymentTerm", text: "40% After material on site, Exclude Electrical control (In cash)." },
  { type: "paymentTerm", text: "20% After installation complete date. (In cash)" },
  { type: "paymentTerm", text: "10% After Commissioning test run of system. (In cash)" },
  { type: "taxNote", text: "ระบุหักณที่จ่าย งานบริการ กรณีทำสัญญา ต้องแยกสัญญาซื้อขายและสัญญาจ้างติดตั้งงาน หากไม่แยกสัญญา จะถือเป็นสัญญาซื้อขายพร้อมติดตั้ง หักณที่จ่ายทั้งใบเสนอราคา" },
  { type: "warrantyTerm", text: "Warranty : XX Year after installation complete (ลูกค้าเซนต์รับมอบงาน)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// TA — FRP Tank (sheet "FRP Tank and LI", rows 22–48 — the "FRP Tank" block)
// ─────────────────────────────────────────────────────────────────────────────
const FRP_TANK_CODE = "TA-FRP-TANK";
const frpTankSections: TemplateSection[] = [
  buildSection(FRP_TANK_CODE, 0, "FRP Tank", [
    {
      item: {
        name: "FRP Tank",
        specs: ["Options: vertical tank / horizontal tank / conical tank / regular tank"],
        params: [{ label: "Tank orientation/type", unit: "Set" }],
      },
    },
    { item: { name: "Tank name", params: [{ label: "Tank name" }] } },
    { item: { name: "Model", specs: ["Example : V-50Q-E (ใส่ตาม Cap จริง — fill per actual capacity)"], params: [{ label: "Model" }] } },
    { item: { name: "Size", params: [{ label: "Size", unit: "D x H" }] } },
    {
      item: {
        name: "Thickness",
        params: [{ label: "Thickness", unit: "mm." }],
        // Internal process note: "กรณีลดความหนา เขียนมือเซนต์กำกับหน้า Work" — reduce-thickness cases must be hand-signed, an internal procedural instruction, never printed to the customer.
        notes: ["กรณีลดความหนา เขียนมือเซนต์กำกับหน้า Work"],
      },
    },
    {
      item: {
        name: "Material",
        params: [{ label: "Corrosion layer" }, { label: "Structure layer" }],
      },
    },
    { item: { name: "Temperature", params: [{ label: "Temperature", unit: "AMB, -…. °C" }] } },
    { item: { name: "Chemical", specs: ["ระบุชื่อสารเคมีเต็มพร้อมความเข้มข้น (specify full chemical name with concentration), e.g. NaOH 50%"], params: [{ label: "Chemical" }] } },
    { item: { name: "Colour", params: [{ label: "Colour", unit: "Ral… / N/A / To be approved" }] } },
    { item: { name: "Bolt, Nut, Gasket", qty: null, unit: "Set", specs: ["Bolt, Nut : SUS304 / Gasket : EPDM or other"] } },
    { item: { name: "Level indicator A,B,D", unit: "Set" } },
    { item: { name: "Steel ladder with ring and handrail coat with epoxy (yellow)", unit: "Set" } },
    { item: { name: "Steel platform", unit: "Set" } },
    { item: { name: "Transportation charge", unit: "Job", params: [{ label: "Province" }] } },
    {
      item: {
        name: "Installation charge", unit: "Job",
        params: [{ label: "Crane", unit: "Ton" }],
        specs: ["Chemical anchors (ยึดพุกเคมี)"],
      },
    },
    { item: { name: "Additional notes (หมายเหตุเพิ่มเติม)", specs: ["วันเข้าดำเนินการ, คนไทยเท่านั้น (site entry date, Thai staff only)"] } },
    {
      item: {
        name: "Safety cost and accessories", unit: "Job",
        specs: ["Certificate working at height / Medical certificate / 4-person confined-space crew (ตรวจสุขภาพ/4 ผู้งานยก)"],
      },
    },
  ]),
];
const frpTankTerms: TemplateTermLine[] = [
  { type: "taxNote", text: "ระบุหัก ณที่จ่าย รายการค่าบริการ" },
];

// ─────────────────────────────────────────────────────────────────────────────
// LI — FRP Lining v2.0 (added 2026-07-20, replaces the 2026-07-14 v1.0 Excel transcription below,
// per an explicit business requirement spec restructuring this template around the new generic
// dynamic-field system — dropdowns, a Yes/No radio, a fixed Safety checkbox group with defaults and
// conditional/Included-Excluded output, plus real "หมายเหตุ"/"Condition" content. Same
// `templateCode`/`jobTypeCode` as before (upsert key — see `upsertQuotationTemplates()` in
// quotationTemplatesHandler.ts), so re-running the import UPDATES this one record (its content hash
// changes) rather than creating a duplicate; every quotation already created from v1.0 keeps its own
// frozen `Quote.templateSnapshot`/`lines`, completely unaffected. See
// docs/MODULES/QuotationTemplates.md "Dynamic Fields" and "FRP Lining v2.0."
// ─────────────────────────────────────────────────────────────────────────────
const FRP_LINING_CODE = "LI-FRP-LINING";

function frpLiningItem(name: string, specs: string[], dynamicFields: TemplateDynamicField[], sortOrder: number): TemplateItem {
  return {
    id: itemId(FRP_LINING_CODE), itemType: "item", itemCode: String(sortOrder + 1),
    name, description: name, quantity: null, unit: "",
    specifications: specs, subDetails: [], editableParameters: [], internalNotes: [],
    visibleToCustomer: true, sortOrder, dynamicFields,
  };
}

const frpLiningSections: TemplateSection[] = [
  {
    id: `sec-${FRP_LINING_CODE}-0`, title: "FRP Lining", description: "", sortOrder: 0,
    items: [
      frpLiningItem("FRP Lining", [], [
        {
          key: "frpLiningFor", label: "FRP Lining for", type: "dropdown", sortOrder: 0,
          options: [
            { key: "newConcrete", label: "New Concrete" },
            { key: "existingConcrete", label: "Existing Concrete" },
            { key: "stainlessTank", label: "Stainless Tank" },
            { key: "steelTank", label: "Steel Tank" },
            { key: "frpTank", label: "FRP Tank" },
          ],
        },
        {
          key: "tankSize", label: "Tank Size / Dimensions", type: "text", sortOrder: 1,
          visibleWhen: { fieldKey: "frpLiningFor", equalsAny: ["stainlessTank", "steelTank", "frpTank"] },
        },
        { key: "thickness", label: "Thickness", type: "number", unitSuffix: "mm.", sortOrder: 2 },
        {
          key: "corrosionLayer", label: "Corrosion Layer", type: "dropdown", sortOrder: 3,
          options: [
            { key: "vinylEster", label: "Vinyl Ester Resin" },
            { key: "isoPhthalic", label: "Iso Phthalic Resin" },
            { key: "orthoPhthalic", label: "Ortho Phthalic Resin" },
          ],
        },
        {
          key: "resinType", label: "Resin Type", type: "text", sortOrder: 4,
          placeholder: "e.g. Swancor901, Swancor907, VI003, Derakane411",
          visibleWhen: { fieldKey: "corrosionLayer", equalsAny: ["vinylEster"] },
        },
        { key: "chemical", label: "Chemical", type: "text", sortOrder: 5 },
        { key: "temperature", label: "Temperature", type: "text", sortOrder: 6 },
        { key: "colour", label: "Colour", type: "text", sortOrder: 7 },
      ], 0),
    ],
  },
  {
    id: `sec-${FRP_LINING_CODE}-1`, title: "Prepare Surface", description: "", sortOrder: 1,
    items: [
      frpLiningItem("Prepare Surface", [], [
        {
          key: "surfacePrepMethod", label: "Surface Preparation Method", type: "dropdown", sortOrder: 0,
          options: [
            { key: "grinding", label: "Grinding (เจียรขัด)" },
            { key: "sandblasting", label: "Sandblasting" },
            { key: "sandblastingSA25", label: "Sandblasting SA2.5" },
          ],
        },
        {
          key: "concreteSurfaceRepair", label: "Concrete Surface Repair", type: "radio", sortOrder: 1,
          // "No" means there's no concrete-repair scope to report — its own display line is
          // omitted entirely (not printed as "Concrete Surface Repair: No") per the business
          // requirement; the Surface Preparation Method above stays priced/printed regardless,
          // since it's a separate, always-applicable scope. See `omitFromCustomerDisplay` in
          // src/lib/quotationTemplates.ts.
          options: [{ key: "yes", label: "Yes" }, { key: "no", label: "No", omitFromCustomerDisplay: true }],
        },
        {
          key: "concreteSurfaceRepairDetails", label: "Concrete Surface Repair Details", type: "text", sortOrder: 2,
          visibleWhen: { fieldKey: "concreteSurfaceRepair", equalsAny: ["yes"] },
        },
      ], 0),
    ],
  },
  {
    id: `sec-${FRP_LINING_CODE}-2`, title: "Safety Cost and Accessories", description: "", sortOrder: 2,
    items: [
      frpLiningItem(
        "Safety Cost and Accessories",
        ["Standard Package Included PPE, Blower, Gas Detector"],
        [
          {
            key: "safetyChecklist", label: "Safety Certificates & Accessories", type: "checkboxGroup", sortOrder: 0,
            generateIncludedExcluded: true,
            options: [
              { key: "medicalCertificate", label: "Medical Certificate", defaultChecked: true },
              { key: "confinedSpaceCertificate", label: "Confined Space Certificate", defaultChecked: false },
              { key: "workingAtHeightCertificate", label: "Working at Height Certificate", defaultChecked: true },
              { key: "scba", label: "SCBA", defaultChecked: false },
              { key: "tripod", label: "Tripod", defaultChecked: false },
            ],
          },
          {
            key: "confinedSpaceRoles", label: "Number of Roles", type: "dropdown", sortOrder: 1,
            visibleWhen: { fieldKey: "safetyChecklist", equalsAny: ["confinedSpaceCertificate"] },
            options: [
              { key: "role1", label: "1 Role" }, { key: "role2", label: "2 Roles" },
              { key: "role3", label: "3 Roles" }, { key: "role4", label: "4 Roles" },
            ],
          },
        ],
        0,
      ),
    ],
  },
];
// Condition (VAT/Warranty/Delivery/Payment) and หมายเหตุ (Notes) content — see
// `TemplateConditionConfig`/`QuotationTemplate.defaultNotes` in src/lib/quotationTemplates.ts. These
// supersede v1.0's plain `defaultTerms` taxNote for this template; `defaultTerms` stays empty.
const frpLiningTerms: TemplateTermLine[] = [];
const frpLiningDefaultNotes: string[] = ["ใบเสนอราคานี้สามารถหัก ณ ที่จ่ายได้"];
const frpLiningConditions: TemplateConditionConfig = {
  vatConditionText: "Vat 7% : The Above Price Included Vat 7%",
  warrantyUnit: "After Job Completed.",
  deliveryUnit: "Days After Received P/O",
  paymentPresets: [
    "40% Down Payment (Cash) 60% After Job Complete (Cash)",
    "30% Down Payment (Cash) 70% After Job Complete (Credit 30 Days)",
    "100% After Job Complete (Credit 30 Days)",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Assembly — every template is `Omit<QuotationTemplate, "id"|"isActive"|"isDeleted"|"createdAt"|"updatedAt"|"createdBy"|"updatedBy">`;
// the import/upsert step (api/_lib/quotationTemplateImport.ts) fills in the rest.
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateSeed = Pick<
  QuotationTemplate,
  "templateCode" | "templateName" | "jobTypeCode" | "jobTypeName" | "description" | "version"
  | "sourceFileName" | "sourceSheetName" | "sections" | "defaultTerms" | "internalNotes"
  | "defaultNotes" | "conditions"
> & { sourceType: "excel_import" };

export const QUOTATION_TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    templateCode: WET_SCRUBBER_CODE,
    templateName: "Wet Scrubber",
    jobTypeCode: "SC",
    sourceType: "excel_import",
    jobTypeName: "Wet Scrubber / Activated Carbon System",
    description: "โครงสร้างใบเสนอราคาสำหรับงาน Wet Scrubber System ครบวงจร ตั้งแต่งานเตรียมการ ระบบสครับเบอร์ เครื่องเป่าลม ระบบท่อ ระบบปั๊มน้ำ เครื่องมือวัดและควบคุม ไปจนถึงการติดตั้ง ทดสอบ และส่งมอบงาน",
    version: "1.0",
    sourceFileName: SOURCE_FILE,
    sourceSheetName: "Wet scrubber",
    sections: wetScrubberSections,
    defaultTerms: wetScrubberTerms,
    internalNotes: [],
  },
  {
    templateCode: ACTIVATED_CARBON_CODE,
    templateName: "Activated Carbon",
    jobTypeCode: "SC",
    sourceType: "excel_import",
    jobTypeName: "Wet Scrubber / Activated Carbon System",
    description: "โครงสร้างใบเสนอราคาสำหรับงานระบบดูดซับด้วยถ่านกัมมันต์ (Activated Carbon System) ตั้งแต่งานเตรียมการ ท่อดักฝุ่นหลัก ระบบกรอง ระบบถ่านกัมมันต์ เครื่องเป่าลม เครื่องมือวัดและระบบควบคุมไฟฟ้า ไปจนถึงการติดตั้งและส่งมอบงาน",
    version: "1.0",
    sourceFileName: SOURCE_FILE,
    sourceSheetName: "Activated carbon",
    sections: activatedCarbonSections,
    defaultTerms: activatedCarbonTerms,
    internalNotes: [],
  },
  {
    templateCode: BAG_FILTER_CODE,
    templateName: "Bag Filter",
    jobTypeCode: "BF",
    sourceType: "excel_import",
    jobTypeName: "Dust Collector System",
    description: "โครงสร้างใบเสนอราคาสำหรับงานระบบดักฝุ่นแบบถุงกรอง (Bag Filter / Dust Collector System) ตั้งแต่งานเตรียมการ ท่อดักฝุ่นหลัก ตัวเครื่องดักฝุ่น ถุงกรอง วาล์ว เครื่องเป่าลม เครื่องมือวัดและระบบควบคุมไฟฟ้า ไปจนถึงการติดตั้งและส่งมอบงาน",
    version: "1.0",
    sourceFileName: SOURCE_FILE,
    sourceSheetName: "Bag filter",
    sections: bagFilterSections,
    defaultTerms: bagFilterTerms,
    internalNotes: [],
  },
  {
    templateCode: FRP_TANK_CODE,
    templateName: "FRP Tank",
    jobTypeCode: "TA",
    sourceType: "excel_import",
    jobTypeName: "Fiberglass Tank",
    description: "โครงสร้างใบเสนอราคาสำหรับงานถัง FRP (FRP Tank) ครอบคลุมรายละเอียดถัง วัสดุ ความหนา อุณหภูมิ สารเคมี อุปกรณ์เสริม (Level indicator, บันได, แพลตฟอร์ม) การขนส่งและติดตั้ง",
    version: "1.0",
    sourceFileName: SOURCE_FILE,
    sourceSheetName: "FRP Tank and LI",
    sections: frpTankSections,
    defaultTerms: frpTankTerms,
    internalNotes: [],
  },
  {
    templateCode: FRP_LINING_CODE,
    templateName: "FRP Lining",
    jobTypeCode: "LI",
    sourceType: "excel_import",
    jobTypeName: "FRP Lining",
    description: "โครงสร้างใบเสนอราคาสำหรับงานพ่นเคลือบ FRP Lining ครอบคลุม FRP Lining / Prepare Surface / Safety Cost and Accessories พร้อมฟิลด์แบบไดนามิก (Dropdown/Radio/Checkbox) เงื่อนไข VAT/Warranty/Delivery/Payment และหมายเหตุ — v2.0 ปรับโครงสร้างตาม business requirement 2026-07-20",
    version: "2.0",
    sourceFileName: SOURCE_FILE,
    sourceSheetName: "FRP Tank and LI",
    sections: frpLiningSections,
    defaultTerms: frpLiningTerms,
    internalNotes: [],
    defaultNotes: frpLiningDefaultNotes,
    conditions: frpLiningConditions,
  },
];
