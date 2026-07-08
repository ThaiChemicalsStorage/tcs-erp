import { useState } from "react";
import { ChevronRight, Save, X } from "lucide-react";
import type { Product, ProductCategory } from "../../lib/products";

export interface ProductDraft {
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
}

const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors";
const labelCls = "text-xs text-muted-foreground block mb-1.5";

export function ProductForm({
  mode,
  initial,
  categories,
  existingCodes,
  onSave,
  onCancel,
}: {
  mode: "create" | "edit";
  initial?: Product;
  categories: ProductCategory[];
  existingCodes: string[];
  onSave: (draft: ProductDraft) => void;
  onCancel: () => void;
}) {
  const activeCategories = categories.filter((c) => !c.archived || c.id === initial?.categoryId);

  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? activeCategories[0]?.id ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "");
  const [defaultPrice, setDefaultPrice] = useState(initial?.defaultPrice ?? 0);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [specifications, setSpecifications] = useState(initial?.specifications ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!code.trim()) e.code = "กรุณากรอกรหัสสินค้า";
    else if (existingCodes.includes(code.trim().toUpperCase())) e.code = "รหัสสินค้านี้ถูกใช้แล้ว";
    if (!name.trim()) e.name = "กรุณากรอกชื่อสินค้า";
    if (!categoryId) e.categoryId = "กรุณาเลือกหมวดหมู่";
    if (!unit.trim()) e.unit = "กรุณากรอกหน่วย";
    if (defaultPrice < 0) e.defaultPrice = "ราคาต้องไม่ติดลบ";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      categoryId,
      unit: unit.trim(),
      defaultPrice,
      description: description.trim(),
      specifications: specifications.trim(),
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> คลังสินค้า
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>
          {mode === "create" ? "เพิ่มสินค้าใหม่" : `แก้ไข: ${initial?.code}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={onCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <X size={13} /> ยกเลิก
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors">
            <Save size={13} /> บันทึกสินค้า
          </button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>รหัสสินค้า</label>
              <input className={`${inputCls} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="เช่น MAT-0008" />
              {errors.code && <p className="text-xs text-[#e05252] mt-1">{errors.code}</p>}
            </div>
            <div>
              <label className={labelCls}>หมวดหมู่</label>
              <select className={`${inputCls} appearance-none`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.archived ? " (เก็บถาวร)" : ""}</option>
                ))}
              </select>
              {errors.categoryId && <p className="text-xs text-[#e05252] mt-1">{errors.categoryId}</p>}
            </div>
          </div>

          <div>
            <label className={labelCls}>ชื่อสินค้า</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ถังเก็บสารเคมี HDPE 1000L" />
            {errors.name && <p className="text-xs text-[#e05252] mt-1">{errors.name}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>หน่วย</label>
              <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="เช่น ชิ้น, ชุด, เที่ยว" />
              {errors.unit && <p className="text-xs text-[#e05252] mt-1">{errors.unit}</p>}
            </div>
            <div>
              <label className={labelCls}>ราคาเริ่มต้น (฿)</label>
              <input type="number" min={0} className={`${inputCls} font-mono`} value={defaultPrice} onChange={(e) => setDefaultPrice(parseFloat(e.target.value) || 0)} />
              {errors.defaultPrice && <p className="text-xs text-[#e05252] mt-1">{errors.defaultPrice}</p>}
            </div>
          </div>

          <div>
            <label className={labelCls}>รายละเอียด</label>
            <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="คำอธิบายสินค้าหรือบริการ" />
          </div>

          <div>
            <label className={labelCls}>ข้อกำหนดเฉพาะ (ไม่บังคับ)</label>
            <textarea rows={3} className={`${inputCls} resize-none leading-relaxed`} value={specifications} onChange={(e) => setSpecifications(e.target.value)} placeholder="สเปกหรือคุณสมบัติเฉพาะของสินค้า" />
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed pt-1 border-t border-border">
            การแก้ไขสินค้าต้นแบบจะมีผลกับใบเสนอราคาที่สร้างใหม่เท่านั้น ใบเสนอราคาที่มีอยู่แล้วจะไม่เปลี่ยนแปลง
          </p>
        </div>
      </div>
    </div>
  );
}
