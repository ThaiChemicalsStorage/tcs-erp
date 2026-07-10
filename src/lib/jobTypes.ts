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

export async function fetchJobTypes(): Promise<JobType[]> {
  const { jobTypes } = await apiFetch<{ jobTypes: JobType[] }>("/jobtypes");
  return jobTypes;
}
export async function createJobType(code: string, name: string): Promise<JobType> {
  const { jobType } = await apiFetch<{ jobType: JobType }>("/jobtypes", { method: "POST", body: JSON.stringify({ code, name }) });
  return jobType;
}
export async function updateJobType(id: string, fields: { code?: string; name?: string; isActive?: boolean }): Promise<JobType> {
  const { jobType } = await apiFetch<{ jobType: JobType }>(`/jobtypes/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  return jobType;
}
