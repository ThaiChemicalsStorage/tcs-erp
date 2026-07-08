import { Boxes, ShieldCheck, TrendingUp } from "lucide-react";

const features = [
  { icon: Boxes, text: "ติดตามคลังเคมีภัณฑ์แบบเรียลไทม์" },
  { icon: TrendingUp, text: "แดชบอร์ดภาพรวมธุรกิจครบวงจร" },
  { icon: ShieldCheck, text: "จัดการใบเสนอราคาอย่างปลอดภัย" },
];

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background font-[Inter,sans-serif] text-foreground">
      {/* Branding panel */}
      <div className="hidden lg:flex lg:w-[42%] bg-[#0b1d3a] flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #c9a84c 0%, transparent 45%), radial-gradient(circle at 80% 70%, #c9a84c 0%, transparent 40%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#c9a84c] flex items-center justify-center">
              <span className="text-[#0b1d3a] text-base font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>ท</span>
            </div>
            <div>
              <p className="text-white text-lg font-semibold leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>TCS ERP</p>
              <p className="text-[#c9a84c] text-[10px] font-mono uppercase tracking-widest">คลังเคมีภัณฑ์ไทย</p>
            </div>
          </div>
        </div>

        <div className="relative">
          <h1 className="text-white text-3xl font-semibold leading-snug mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
            ระบบบริหารจัดการ<br />คลังเคมีภัณฑ์อุตสาหกรรม
          </h1>
          <p className="text-[#a8bed8] text-sm leading-relaxed mb-8 max-w-sm">
            บริหารคำสั่งซื้อ ใบเสนอราคา และภาพรวมธุรกิจของบริษัท ไทย เคมิคอลส์ สโตเรจ จำกัด ไว้ในที่เดียว
          </p>
          <div className="space-y-3.5">
            {features.map((f) => (
              <div key={f.text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#c9a84c]/15 border border-[#c9a84c]/25 flex items-center justify-center flex-shrink-0">
                  <f.icon size={15} className="text-[#c9a84c]" />
                </div>
                <span className="text-[#e8edf5] text-sm">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-[#5a7299] text-xs font-mono">© 2567 TCS ERP · บริษัท ไทย เคมิคอลส์ สโตเรจ จำกัด</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand mark */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <div className="w-9 h-9 rounded-lg bg-[#c9a84c] flex items-center justify-center">
              <span className="text-[#0b1d3a] text-sm font-bold" style={{ fontFamily: "'Playfair Display', serif" }}>ท</span>
            </div>
            <p className="text-foreground text-base font-semibold" style={{ fontFamily: "'Playfair Display', serif" }}>TCS ERP</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
