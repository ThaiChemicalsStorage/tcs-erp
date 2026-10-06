import type { Customer } from "../../lib/customers";
import type { useI18n } from "../../lib/i18n";
import { formatDisplayDate } from "../../lib/displayDate";

export function fmtCustomerDate(iso: string) {
  return formatDisplayDate(iso);
}

// ป้ายสถานะของลูกค้า — เก็บถาวรมาก่อนเปิด/ปิดใช้งาน
export function customerStatus(c: Customer, t: ReturnType<typeof useI18n>["t"]) {
  return {
    status: c.isDeleted ? "archived" as const : c.isActive ? "active" as const : "inactive" as const,
    label: c.isDeleted ? t("common.status.archived") : c.isActive ? t("common.status.active") : t("customers.status.inactive"),
  };
}
