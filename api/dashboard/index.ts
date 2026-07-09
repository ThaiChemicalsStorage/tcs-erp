import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError } from "../_lib/http.js";
import { requirePermission } from "../_lib/auth.js";
import { customersCollection, leadsCollection, quotesCollection, productsCollection, categoriesCollection } from "../_lib/collections.js";

const WON_STATUS = "ปิดการขายสำเร็จ";
const LOST_STATUS = "เสียโอกาส";
const MONTHS_BACK = 12;

/** Builds the last N "YYYY-MM" keys ending at the current calendar month, oldest first — used to zero-fill months with no real quotes so the chart never renders blank. */
function lastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, async () => {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
    await requirePermission(req, "dashboard:view");

    const [customers, leads, quotes, products, categories] = await Promise.all([
      customersCollection(), leadsCollection(), quotesCollection(), productsCollection(), categoriesCollection(),
    ]);

    const [
      totalCustomers, totalLeads, totalQuotations, totalProducts,
      wonDeals, lostDeals, revenueAgg, revenueByMonthAgg, productsByCategoryAgg, categoryDocs,
    ] = await Promise.all([
      customers.countDocuments({ deletedAt: null }),
      leads.countDocuments({ deletedAt: null }),
      quotes.countDocuments({}),
      products.countDocuments({ archived: false }),
      quotes.countDocuments({ status: WON_STATUS }),
      quotes.countDocuments({ status: LOST_STATUS }),
      quotes.aggregate<{ _id: null; total: number }>([
        { $match: { status: WON_STATUS } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).toArray(),
      quotes.aggregate<{ _id: string; revenue: number }>([
        { $match: { status: WON_STATUS, issueDate: { $regex: /^\d{4}-\d{2}-\d{2}$/ } } },
        { $group: { _id: { $substr: ["$issueDate", 0, 7] }, revenue: { $sum: "$amount" } } },
      ]).toArray(),
      products.aggregate<{ _id: string; count: number }>([
        { $match: { archived: false } },
        { $group: { _id: "$categoryId", count: { $sum: 1 } } },
      ]).toArray(),
      categories.find({}).toArray(),
    ]);

    const totalRevenue = revenueAgg[0]?.total ?? 0;

    const revenueByMonthMap = new Map(revenueByMonthAgg.map((r) => [r._id, r.revenue]));
    const revenueByMonth = lastNMonthKeys(MONTHS_BACK).map((month) => ({ month, revenue: revenueByMonthMap.get(month) ?? 0 }));

    const categoryNameById = new Map(categoryDocs.map((c) => [c._id.toString(), c.name]));
    const totalCategorizedProducts = productsByCategoryAgg.reduce((sum, c) => sum + c.count, 0);
    const categoryBreakdown = productsByCategoryAgg
      .map((c) => ({
        categoryId: c._id,
        categoryName: categoryNameById.get(c._id) ?? "ไม่ระบุหมวดหมู่",
        count: c.count,
        percentage: totalCategorizedProducts > 0 ? Math.round((c.count / totalCategorizedProducts) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.status(200).json({
      kpis: { totalCustomers, totalLeads, totalQuotations, totalProducts, totalRevenue, wonDeals, lostDeals },
      revenueByMonth,
      categoryBreakdown,
    });
  });
}
