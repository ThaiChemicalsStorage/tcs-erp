import { useState } from "react";
import {
  ChevronRight, Printer, Copy, Save, Send, CheckCircle2, Building2, Hash, CalendarDays,
} from "lucide-react";
import type { Company } from "../../lib/storage";
import type { Product, ProductCategory } from "../../lib/products";
import {
  type Quote, type QuoteStatus, type QuoteInterest, type QuoteLine,
  statusIcon, computeTotals,
} from "../../lib/quotes";
import { InterestButtons } from "./InterestButtons";
import { LineItemsEditor } from "./LineItemsEditor";

export function QuoteDocument({
  mode,
  quote,
  nextId,
  company,
  products,
  categories,
  onBack,
  onSave,
  onDuplicate,
  onInterestChange,
  showToast,
}: {
  mode: "new" | "detail";
  quote?: Quote;
  nextId: string;
  company: Company;
  products: Product[];
  categories: ProductCategory[];
  onBack: () => void;
  onSave: (data: { client: string; status: QuoteStatus; lines: QuoteLine[]; discount: number; amount: number }) => void;
  onDuplicate: () => void;
  onInterestChange: (v: QuoteInterest) => void;
  showToast: (msg: string) => void;
}) {
  const isDetail = mode === "detail" && !!quote;

  const [client, setClient] = useState(quote?.client ?? "เมอริเดียน คอร์ป");
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>(quote?.status ?? "ร่าง");
  const [lines, setLines] = useState<QuoteLine[]>(quote?.lines ?? []);
  const [discount, setDiscount] = useState(quote?.discount ?? 0);

  const { total } = computeTotals(lines, discount);

  const save = (status: QuoteStatus, message: string) => {
    setQuoteStatus(status);
    onSave({ client, status, lines, discount, amount: total });
    showToast(message);
  };

  return (
    <div className="flex-1 overflow-y-auto print:overflow-visible print:block print:h-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-3 print:hidden">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} className="rotate-180" /> ใบเสนอราคา
        </button>
        <ChevronRight size={13} className="text-muted-foreground" />
        <span className="text-sm text-[#c9a84c] font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>
          {isDetail ? quote!.id : "สร้างใหม่"}
        </span>

        {isDetail && (
          <div className="flex items-center gap-2 ml-3 pl-3 border-l border-border">
            <span className="text-xs text-muted-foreground">ความสนใจ:</span>
            <InterestButtons value={quote!.interest} onChange={onInterestChange} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!isDetail && (
            <div className="flex gap-1 bg-muted rounded-lg p-0.5 mr-1">
              {(["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"] as QuoteStatus[]).map((s) => (
                <button key={s} onClick={() => setQuoteStatus(s)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${quoteStatus === s ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <Printer size={13} /> พิมพ์ / PDF
          </button>
          {isDetail && (
            <button onClick={onDuplicate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
              <Copy size={13} /> คัดลอก
            </button>
          )}
          <button onClick={() => save(quoteStatus, "บันทึกใบเสนอราคาเรียบร้อยแล้ว")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all">
            <Save size={13} /> บันทึก
          </button>
          <button
            onClick={() => save(quoteStatus === "ร่าง" ? "รออนุมัติ" : quoteStatus, "ส่งใบเสนอราคาเรียบร้อยแล้ว")}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
          >
            <Send size={13} /> ส่งใบเสนอราคา
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-5xl mx-auto print:p-0 print:max-w-none">
        {/* Document header band */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="bg-[#0b1d3a] px-7 py-5 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-7 h-7 rounded-md bg-[#c9a84c] flex items-center justify-center">
                  <span className="text-[#0b1d3a] text-xs font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>ท</span>
                </div>
                <span className="text-white text-base font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>TCS ERP</span>
              </div>
              <p className="text-[#a8bed8] text-xs mt-1">{company.name} · {company.address}</p>
              <p className="text-[#a8bed8] text-xs">โทร: {company.phone} · อีเมล: {company.email}</p>
            </div>
            <div className="text-right">
              <p className="text-[#c9a84c] text-xl font-bold font-mono tracking-wider">ใบเสนอราคา</p>
              <p className="text-[#a8bed8] text-xs font-mono mt-1">QUOTATION</p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#c9a84c]/20 text-[#c9a84c] border border-[#c9a84c]/30">
                {statusIcon[quoteStatus]}
                {quoteStatus}
              </div>
            </div>
          </div>

          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-0 border-b border-border">
            <div className="p-6 border-r border-border">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><Building2 size={10} /> ข้อมูลลูกค้า</p>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">ชื่อลูกค้า / บริษัท</label>
                  <input className="w-full text-sm font-medium text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" value={client} onChange={(e) => setClient(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">ผู้ติดต่อ</label>
                    <input className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="คุณสมชาย วงศ์ดี" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">เบอร์โทร</label>
                    <input className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="081-234-5678" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">ที่อยู่</label>
                  <input className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="45 ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ 10110" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="0105563012345" />
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-1.5"><Hash size={10} /> รายละเอียดเอกสาร</p>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">เลขที่ใบเสนอราคา</label>
                    <input readOnly className="w-full text-xs font-mono text-[#c9a84c] font-semibold bg-secondary border border-border rounded-lg px-3 py-2 outline-none" value={isDetail ? quote!.id : nextId} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">อ้างอิง PO</label>
                    <input className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="PO-2567-7734" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1 flex items-center gap-1"><CalendarDays size={9} /> วันที่ออกเอกสาร</label>
                    <input type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="2024-12-14" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1 flex items-center gap-1"><CalendarDays size={9} /> วันหมดอายุ</label>
                    <input type="date" className="w-full text-xs font-mono text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="2025-01-14" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">พนักงานขาย</label>
                  <input className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors" defaultValue="นภา ลาเรนต์ (CFO)" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">เงื่อนไขการชำระเงิน</label>
                  <select className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors appearance-none">
                    <option>ชำระภายใน 30 วัน</option>
                    <option>ชำระภายใน 60 วัน</option>
                    <option>ชำระทันที</option>
                    <option>แบ่งชำระ 3 งวด</option>
                  </select>
                </div>
                {isDetail && (
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">ระดับความสนใจของลูกค้า</label>
                    <InterestButtons value={quote!.interest} onChange={onInterestChange} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <LineItemsEditor lines={lines} onChange={setLines} discount={discount} onDiscountChange={setDiscount} products={products} categories={categories} />

        {/* Remarks + Signature */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>หมายเหตุ / เงื่อนไข</p>
            <textarea rows={5} className="w-full text-xs text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors resize-none leading-relaxed"
              defaultValue={"1. ราคานี้ยังไม่รวมค่าขนส่งและค่าติดตั้ง\n2. ราคามีผลภายใน 30 วันนับจากวันที่ในเอกสาร\n3. การส่งมอบภายใน 45 วันทำการหลังได้รับ PO\n4. การชำระเงินมัดจำ 30% ก่อนเริ่มผลิต"} />
          </div>
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs font-semibold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>ลายมือชื่อผู้มีอำนาจ</p>
            <div className="space-y-3">
              {["ผู้เสนอราคา", "ผู้อนุมัติ"].map((role) => (
                <div key={role}>
                  <p className="text-[10px] text-muted-foreground font-mono mb-1">{role}</p>
                  <div className="h-14 border border-dashed border-border rounded-lg bg-muted/30 flex items-end px-3 pb-2">
                    <div className="w-full border-b border-border/60" />
                  </div>
                  <div className="flex justify-between mt-1">
                    <p className="text-[10px] text-muted-foreground font-mono">ชื่อ: ................................</p>
                    <p className="text-[10px] text-muted-foreground font-mono">วันที่: ...............</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-[#0b1d3a]/5 border border-[#0b1d3a]/10 rounded-xl p-4 flex items-start gap-3">
          <div className="w-5 h-5 rounded-full bg-[#c9a84c]/20 flex items-center justify-center flex-shrink-0 mt-0.5"><CheckCircle2 size={11} className="text-[#c9a84c]" /></div>
          <p className="text-xs text-muted-foreground leading-relaxed">เอกสารนี้ออกโดยระบบ TCS ERP · ใบเสนอราคาฉบับนี้ไม่ถือเป็นสัญญาผูกพันจนกว่าจะได้รับการยืนยันเป็นลายลักษณ์อักษรจากทั้งสองฝ่าย · สอบถามข้อมูลเพิ่มเติม: info@tcs-erp.co.th หรือ [เบอร์โทรศัพท์]</p>
        </div>
      </div>
    </div>
  );
}
