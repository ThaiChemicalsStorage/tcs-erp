import { apiFetch } from "./apiClient.js";

export interface JobType {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

// ดึงรายการประเภทงานทั้งหมดจากเซิร์ฟเวอร์
// Fetches all job types from the server
export async function fetchJobTypes(): Promise<JobType[]> {
  const { jobTypes } = await apiFetch<{ jobTypes: JobType[] }>("/jobtypes");
  return jobTypes;
}
// สร้างประเภทงานใหม่ด้วยรหัสและชื่อที่กำหนด
// Creates a new job type with the given code and name
export async function createJobType(code: string, name: string): Promise<JobType> {
  const { jobType } = await apiFetch<{ jobType: JobType }>("/jobtypes", { method: "POST", body: JSON.stringify({ code, name }) });
  return jobType;
}
// แก้ไขข้อมูลประเภทงานที่มีอยู่ตาม id
// Updates an existing job type identified by id
export async function updateJobType(id: string, fields: { code?: string; name?: string; isActive?: boolean }): Promise<JobType> {
  const { jobType } = await apiFetch<{ jobType: JobType }>(`/jobtypes/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return jobType;
}
