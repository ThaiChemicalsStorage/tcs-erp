import { apiFetch } from "./apiClient.js";

/**
 * Customer master data (redefined 2026-07-14 — corrects an earlier misunderstanding that built a
 * "Company Profiles" / issuer-company selector into the Quotation form instead of a customer
 * selector). A Customer is who a quotation is issued *to* — saved once here, then picked from the
 * Quotation form's Customer selector (`src/pages/quotation/CustomerSelector.tsx`) to autofill the
 * Customer Information section instead of retyping it every time. See `Quote.customerId`/
 * `customerSnapshot` in `quotes.tsx` and docs/MODULES/Customer.md.
 */
export interface Customer {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  projectName: string;
  deliveryAddress: string;
  isActive: boolean;
  /** Soft-delete/archive flag — distinct from `isActive`, same convention as CompanyProfile.isDeleted. */
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CustomerDraft {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  projectName: string;
  deliveryAddress: string;
  isActive: boolean;
}

export const emptyCustomerDraft: CustomerDraft = {
  companyName: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  taxId: "",
  deliveryMethod: "",
  projectName: "",
  deliveryAddress: "",
  isActive: true,
};

/**
 * The frozen-at-save-time copy of a selected (or manually entered) customer's fields, stored on
 * `Quote.customerSnapshot` (`src/lib/quotes.tsx`) — always built server-side from the quotation's
 * own Customer Information field values (see `api/handlers/quotes.ts`), so later edits to the
 * Customer master record never silently change what an already-saved quotation shows. Field names
 * intentionally mirror `Customer`'s own field names (not the Quote form's `client`/`contactPhone`/
 * `project` naming), per the business requirement's exact `customerSnapshot` shape.
 */
export interface CustomerSnapshot {
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  projectName: string;
  deliveryAddress: string;
}

/** Only active, non-deleted customers — used to populate the Quotation form's Customer selector and the Customers admin list's default view. */
export async function fetchCustomers(): Promise<Customer[]> {
  const { customers } = await apiFetch<{ customers: Customer[] }>("/customers");
  return customers;
}
export async function fetchCustomer(id: string): Promise<Customer> {
  const { customer } = await apiFetch<{ customer: Customer }>(`/customers/${id}`);
  return customer;
}
export async function createCustomer(draft: CustomerDraft): Promise<Customer> {
  const { customer } = await apiFetch<{ customer: Customer }>("/customers", { method: "POST", body: JSON.stringify(draft) });
  return customer;
}
export async function updateCustomer(id: string, fields: Partial<CustomerDraft>): Promise<Customer> {
  const { customer } = await apiFetch<{ customer: Customer }>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return customer;
}
export async function setCustomerArchived(id: string, isDeleted: boolean): Promise<Customer> {
  const { customer } = await apiFetch<{ customer: Customer }>(`/customers/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({ isDeleted }),
  });
  return customer;
}
