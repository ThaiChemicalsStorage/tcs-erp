import { apiFetch } from "./apiClient.js";

export interface Department {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CreateDepartmentFields {
  name: string;
  code?: string;
  isActive?: boolean;
}

export interface UpdateDepartmentFields {
  name?: string;
  isActive?: boolean;
}

// ดึงรายชื่อแผนกทั้งหมดจากเซิร์ฟเวอร์
// Fetches all departments from the server.
export async function fetchDepartments(): Promise<Department[]> {
  const { departments } = await apiFetch<{ departments: Department[] }>("/departments");
  return departments;
}
// สร้างแผนกใหม่
// Creates a new department.
export async function createDepartment(fields: CreateDepartmentFields): Promise<Department> {
  const { department } = await apiFetch<{ department: Department }>("/departments", { method: "POST", body: JSON.stringify(fields) });
  return department;
}
// แก้ไข/เก็บถาวรแผนก
// Updates (rename/archive) an existing department.
export async function updateDepartment(id: string, fields: UpdateDepartmentFields): Promise<Department> {
  const { department } = await apiFetch<{ department: Department }>(`/departments/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return department;
}
