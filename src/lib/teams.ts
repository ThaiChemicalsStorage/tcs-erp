import { apiFetch } from "./apiClient.js";

export interface Team {
  id: string;
  name: string;
  departmentId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CreateTeamFields {
  name: string;
  departmentId: string;
  isActive?: boolean;
}

export interface UpdateTeamFields {
  name?: string;
  isActive?: boolean;
}

// ดึงรายชื่อทีมทั้งหมด (หรือเฉพาะแผนกที่ระบุ) จากเซิร์ฟเวอร์
// Fetches all teams, optionally scoped to a single department, from the server.
export async function fetchTeams(departmentId?: string): Promise<Team[]> {
  const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
  const { teams } = await apiFetch<{ teams: Team[] }>(`/teams${query}`);
  return teams;
}
// สร้างทีมใหม่
// Creates a new team.
export async function createTeam(fields: CreateTeamFields): Promise<Team> {
  const { team } = await apiFetch<{ team: Team }>("/teams", { method: "POST", body: JSON.stringify(fields) });
  return team;
}
// แก้ไข/เก็บถาวรทีม
// Updates (rename/archive) an existing team.
export async function updateTeam(id: string, fields: UpdateTeamFields): Promise<Team> {
  const { team } = await apiFetch<{ team: Team }>(`/teams/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(fields) });
  return team;
}
