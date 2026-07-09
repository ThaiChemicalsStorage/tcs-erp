import { apiFetch } from "./apiClient.js";

export interface DashboardKpis {
  totalCustomers: number;
  totalLeads: number;
  totalQuotations: number;
  totalProducts: number;
  totalRevenue: number;
  wonDeals: number;
  lostDeals: number;
}

export interface DashboardStats {
  kpis: DashboardKpis;
  revenueByMonth: { month: string; revenue: number }[];
  categoryBreakdown: { categoryId: string; categoryName: string; count: number; percentage: number }[];
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/dashboard");
}
