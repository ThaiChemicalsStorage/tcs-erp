import { apiFetch } from "./apiClient.js";

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

// ดึงรายชื่อลูกค้าที่ยังใช้งานอยู่และไม่ถูกลบ
// Fetches active, non-deleted customers
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
