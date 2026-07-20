import type { TemplateDynamicField, TemplateSection } from "./quotationTemplates";
import type { QuoteLineDynamicFieldValue } from "./quotes";

/**
 * Shared generic logic for `TemplateDynamicField`/`QuoteLineDynamicFieldValue` (added 2026-07-20,
 * FRP Lining template pass) — resolving a line's schema, evaluating `visibleWhen`, and formatting
 * customer-facing display strings (including checkboxGroup's auto-generated Included/Excluded
 * text). Used by `LineItemsEditor.tsx` (live editing), `PrintDocument.tsx` (print/PDF), and
 * `TemplatePreview.tsx` (master-template preview) so the "what's visible, what does it say" rules
 * can never drift apart between the three. Pure, no JSX/browser globals — safe to value-import
 * anywhere, including a future server-side use, per the convention `quotationTemplates.ts`/
 * `quotes.tsx` already established (see those files' header comments).
 */

/** Finds the dynamic-field schema for one line, by matching `sourceTemplateItemId` against the
 * frozen `Quote.templateSnapshot.sections[].items[]`. Returns `[]` (never throws) for a line with
 * no source item, an unmatched id, or a template snapshot predating this feature — an old/foreign
 * line simply renders with no dynamic fields, never a crash. */
export function resolveDynamicFieldSchema(
  sections: TemplateSection[] | undefined,
  sourceTemplateItemId: string | undefined,
): TemplateDynamicField[] {
  if (!sections || !sourceTemplateItemId) return [];
  for (const section of sections) {
    const item = section.items.find((it) => it.id === sourceTemplateItemId);
    if (item) return [...(item.dynamicFields ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  return [];
}

function valueOf(values: QuoteLineDynamicFieldValue[], key: string): QuoteLineDynamicFieldValue | undefined {
  return values.find((v) => v.key === key);
}

/** Evaluates a field's `visibleWhen` rule (if any) against the line's current values. A field with
 * no rule is always visible. The controlling field's dropdown/radio `value`, or — when it's a
 * checkboxGroup — any one of its `checkedOptionKeys`, must match one of `equalsAny`. */
export function isFieldVisible(field: TemplateDynamicField, values: QuoteLineDynamicFieldValue[]): boolean {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const controlling = valueOf(values, rule.fieldKey);
  if (!controlling) return false;
  if (controlling.checkedOptionKeys) return controlling.checkedOptionKeys.some((k) => rule.equalsAny.includes(k));
  return !!controlling.value && rule.equalsAny.includes(controlling.value);
}

/** A field whose `visibleWhen` targets a `generateIncludedExcluded` checkboxGroup on the same item
 * is always folded inline into that checkboxGroup's Included line by `formatIncludedExcluded()`
 * below (e.g. "Confined Space Certificate — 2 Roles") — it must never ALSO appear as its own
 * standalone "{label}: {value}" line, or the same information prints twice in two different
 * phrasings. Generic: matches any field/checkboxGroup pair shaped like `quantityFieldFor()` below
 * recognizes, not specific to any one field. */
function isIncludedExcludedQuantityCompanion(field: TemplateDynamicField, schema: TemplateDynamicField[]): boolean {
  const rule = field.visibleWhen;
  if (!rule) return false;
  const controlling = schema.find((f) => f.key === rule.fieldKey);
  return !!controlling && controlling.type === "checkboxGroup" && !!controlling.generateIncludedExcluded;
}

/** Only the fields that are BOTH declared visible-by-rule AND not a quantity-companion of some
 * other visible checkboxGroup's auto-generated Included/Excluded output (see
 * `isIncludedExcludedQuantityCompanion` above) — the plain list a form/print view should loop over. */
export function visibleFields(schema: TemplateDynamicField[], values: QuoteLineDynamicFieldValue[]): TemplateDynamicField[] {
  return schema.filter((f) => isFieldVisible(f, values) && !isIncludedExcludedQuantityCompanion(f, schema));
}

function optionLabel(field: TemplateDynamicField, key: string): string {
  return field.options?.find((o) => o.key === key)?.label ?? key;
}

/** Customer-facing "{label}: {value}{unitSuffix}" for a single dropdown/radio/text/number field —
 * `null` when there's nothing to show: a blank value, or (dropdown/radio only) the selected
 * option is marked `omitFromCustomerDisplay` (e.g. Concrete Surface Repair's "No" — selecting it
 * means there's nothing to report, so the line is omitted entirely rather than printing "Concrete
 * Surface Repair: No"). Never an empty/incomplete sentence. */
export function formatFieldDisplay(field: TemplateDynamicField, values: QuoteLineDynamicFieldValue[]): string | null {
  const current = valueOf(values, field.key);
  if (field.type === "checkboxGroup") return null; // handled by formatIncludedExcluded instead
  const raw = current?.value?.trim();
  if (!raw) return null;
  if (field.type === "dropdown" || field.type === "radio") {
    const option = field.options?.find((o) => o.key === raw);
    if (option?.omitFromCustomerDisplay) return null;
  }
  const display = field.type === "dropdown" || field.type === "radio" ? optionLabel(field, raw) : raw;
  const suffix = field.unitSuffix ? ` ${field.unitSuffix}` : "";
  return `${field.label}: ${display}${suffix}`;
}

/** A dynamic field on the SAME item whose `visibleWhen` targets one specific checked option of
 * `checkboxField` — e.g. "Number of Roles" targeting Confined Space Certificate. Generic: works for
 * any future checkbox-with-quantity pattern, not just that one. */
function quantityFieldFor(schema: TemplateDynamicField[], checkboxField: TemplateDynamicField, optionKey: string): TemplateDynamicField | undefined {
  return schema.find((f) => f.visibleWhen?.fieldKey === checkboxField.key && f.visibleWhen.equalsAny.includes(optionKey));
}

/** Generates the "Included .../Excluded ..." pair for a `generateIncludedExcluded` checkboxGroup
 * field, in the group's own fixed option order — never the raw checkbox controls. Either line is
 * `null` when it would otherwise be empty (all-checked has no Excluded line and vice versa). If a
 * checked option has a linked quantity field (see `quantityFieldFor`) with a non-blank value, it's
 * appended inline: "Confined Space Certificate — 2 Roles". */
export function formatIncludedExcluded(
  schema: TemplateDynamicField[],
  field: TemplateDynamicField,
  values: QuoteLineDynamicFieldValue[],
): { included: string | null; excluded: string | null } {
  const current = valueOf(values, field.key);
  const checked = new Set(current?.checkedOptionKeys ?? []);
  const options = field.options ?? [];

  const describe = (optionKey: string, label: string): string => {
    const qtyField = quantityFieldFor(schema, field, optionKey);
    if (!qtyField) return label;
    const qtyValue = valueOf(values, qtyField.key)?.value?.trim();
    if (!qtyValue) return label;
    const qtyDisplay = qtyField.type === "dropdown" || qtyField.type === "radio" ? optionLabel(qtyField, qtyValue) : qtyValue;
    return `${label} — ${qtyDisplay}`;
  };

  const includedLabels = options.filter((o) => checked.has(o.key)).map((o) => describe(o.key, o.label));
  const excludedLabels = options.filter((o) => !checked.has(o.key)).map((o) => o.label);

  return {
    included: includedLabels.length ? `Included ${includedLabels.join(", ")}` : null,
    excluded: excludedLabels.length ? `Excluded ${excludedLabels.join(", ")}` : null,
  };
}

/** Builds a fresh `QuoteLineDynamicFieldValue[]` from a template item's schema — dropdown/radio/
 * text/number start blank (never a fake default), checkboxGroup starts from each option's
 * `defaultChecked`. Used when applying a template to a new quotation. */
export function buildDefaultDynamicFieldValues(schema: TemplateDynamicField[]): QuoteLineDynamicFieldValue[] {
  return schema.map((f) =>
    f.type === "checkboxGroup"
      ? { key: f.key, checkedOptionKeys: (f.options ?? []).filter((o) => o.defaultChecked).map((o) => o.key) }
      : { key: f.key, value: "" },
  );
}
