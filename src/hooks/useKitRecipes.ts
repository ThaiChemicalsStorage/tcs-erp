import { useEffect, useState } from "react";
import { fetchKitRecipes, type KitRecipe } from "../lib/products";

/**
 * สูตรของสินค้าชุดทุกตัว (2026-09-29) — โหลดครั้งเดียวต่อหน้าเว็บ (`GET /api/products/kits` เปิดให้ทุกคนที่ล็อกอิน ผู้ใช้ที่ไม่มี
 * สิทธิ์ดูคลังก็ยังเห็นชิ้นส่วนบนเอกสารของตัวเองได้) · โหลดไม่สำเร็จ = map ว่าง เอกสารยังใช้งานได้ตามปกติ แค่ไม่แตกชิ้นส่วน
 */
export function useKitRecipes(): Map<string, KitRecipe> {
  const [kits, setKits] = useState<Map<string, KitRecipe>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    fetchKitRecipes().then((m) => { if (!cancelled) setKits(m); }).catch(() => { /* ไม่แตกชิ้นส่วน */ });
    return () => { cancelled = true; };
  }, []);
  return kits;
}
