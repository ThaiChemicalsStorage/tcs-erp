export interface ProductCategory {
  id: string;
  name: string;
  archived: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export const defaultCategories: ProductCategory[] = [
  { id: "cat-materials", name: "วัสดุ", archived: false },
  { id: "cat-equipment", name: "อุปกรณ์", archived: false },
  { id: "cat-services", name: "บริการ", archived: false },
  { id: "cat-labor", name: "ค่าแรง", archived: false },
  { id: "cat-installation", name: "การติดตั้ง", archived: false },
  { id: "cat-software", name: "ซอฟต์แวร์", archived: false },
  { id: "cat-hardware", name: "ฮาร์ดแวร์", archived: false },
];

const now = "2024-12-01T00:00:00.000Z";

export const defaultProducts: Product[] = [
  {
    id: "prod-1", code: "MAT-0001", name: "ถังเก็บสารเคมี HDPE 1000L", categoryId: "cat-materials",
    unit: "ใบ", defaultPrice: 18500, description: "ถังเก็บสารเคมีชนิด HDPE ทนกรด-ด่าง ความจุ 1,000 ลิตร",
    specifications: "วัสดุ: HDPE · ความหนา: 8 มม. · อุณหภูมิใช้งาน: -10°C ถึง 60°C", archived: false, createdAt: now, updatedAt: now,
  },
  {
    id: "prod-2", code: "EQP-0001", name: "ปั๊มถ่ายสารเคมีไฟฟ้า", categoryId: "cat-equipment",
    unit: "เครื่อง", defaultPrice: 32000, description: "ปั๊มถ่ายสารเคมีระบบไฟฟ้า เหมาะสำหรับของเหลวกัดกร่อน",
    specifications: "กำลังไฟ: 1.5 kW · อัตราการไหล: 60 ลิตร/นาที", archived: false, createdAt: now, updatedAt: now,
  },
  {
    id: "prod-3", code: "SRV-0001", name: "บริการขนส่งสารเคมีอันตราย", categoryId: "cat-services",
    unit: "เที่ยว", defaultPrice: 4500, description: "บริการขนส่งสารเคมีอันตรายตามมาตรฐาน DOT/UN พร้อมเอกสารกำกับ",
    specifications: "", archived: false, createdAt: now, updatedAt: now,
  },
  {
    id: "prod-4", code: "LAB-0001", name: "ค่าแรงติดตั้งระบบท่อ", categoryId: "cat-labor",
    unit: "วัน", defaultPrice: 3500, description: "ค่าแรงช่างติดตั้งระบบท่อลำเลียงสารเคมี",
    specifications: "", archived: false, createdAt: now, updatedAt: now,
  },
  {
    id: "prod-5", code: "INS-0001", name: "บริการติดตั้งและทดสอบระบบ", categoryId: "cat-installation",
    unit: "ครั้ง", defaultPrice: 45000, description: "ติดตั้งและทดสอบระบบจัดเก็บสารเคมีทั้งระบบก่อนส่งมอบ",
    specifications: "", archived: false, createdAt: now, updatedAt: now,
  },
  {
    id: "prod-6", code: "SFT-0001", name: "ระบบซอฟต์แวร์ติดตามสต็อกสารเคมี", categoryId: "cat-software",
    unit: "ไลเซนส์", defaultPrice: 25000, description: "ซอฟต์แวร์ติดตามปริมาณและอายุการเก็บสารเคมีแบบเรียลไทม์",
    specifications: "ไลเซนส์ต่อปี · รองรับผู้ใช้งานสูงสุด 10 คน", archived: false, createdAt: now, updatedAt: now,
  },
  {
    id: "prod-7", code: "HDW-0001", name: "ชุดวาล์วควบคุมแรงดัน", categoryId: "cat-hardware",
    unit: "ชุด", defaultPrice: 8900, description: "ชุดวาล์วควบคุมแรงดันสำหรับถังเก็บสารเคมีแรงดันสูง",
    specifications: "", archived: false, createdAt: now, updatedAt: now,
  },
];

const PRODUCTS_KEY = "tcs_erp_products";
const CATEGORIES_KEY = "tcs_erp_categories";

export function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(PRODUCTS_KEY);
    return raw ? JSON.parse(raw) : defaultProducts;
  } catch {
    return defaultProducts;
  }
}
export function saveProducts(products: Product[]) {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
}

export function loadCategories(): ProductCategory[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : defaultCategories;
  } catch {
    return defaultCategories;
  }
}
export function saveCategories(categories: ProductCategory[]) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
