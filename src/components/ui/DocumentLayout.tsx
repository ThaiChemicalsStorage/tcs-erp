import { Fragment, type ReactNode } from "react";
import { ArrowLeft, Check, Info } from "lucide-react";

/**
 * โครงหน้าเอกสารแบบใหม่ (REDESIGN 2026-09-30, แบบ QuoteDocument) — ใช้กับทุกเอกสารที่มีเลขที่/การอนุมัติ
 *
 * แถบหัวสีขาวใต้แถบบน: ลิงก์ "← …ทั้งหมด" · เลขที่ (mono 22) + ป้ายสถานะ + สถานะบันทึก · ขวาสุด [รอง][เพิ่มเติม ▾][ปุ่มหลัก]
 * แล้วแท็บของเอกสาร (รายละเอียด / ตัวอย่างก่อนพิมพ์ / ประวัติ) ถ้ามี · ปุ่มของเอกสารอยู่ที่นี่ที่เดียว
 */
export function DocumentHeader({ backLabel, onBack, number, mono = true, status, meta, actions, tabs, children }: {
  backLabel?: ReactNode;
  onBack?: () => void;
  number: ReactNode;
  /** false = ชื่อเอกสารตัวปกติ (เช่นชื่อ Template) แทนเลขที่ตัว mono */
  mono?: boolean;
  status?: ReactNode;
  /** สถานะบันทึกอัตโนมัติ / ข้อความสั้นข้างเลขที่ */
  meta?: ReactNode;
  actions?: ReactNode;
  tabs?: ReactNode;
  /** แถวเสริมใต้หัว (เช่นแบนเนอร์) */
  children?: ReactNode;
}) {
  return (
    <div className="bg-card border-b border-border px-4 md:px-8 pt-3.5 flex flex-col gap-2.5 print:hidden">
      {onBack && (
        <button type="button" onClick={onBack} className="self-start text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft size={14} />
          {backLabel}
        </button>
      )}
      <div className="flex items-center gap-3.5 flex-wrap pb-3.5 min-w-0" style={tabs ? { paddingBottom: 0 } : undefined}>
        <h1 className={`${mono ? "font-mono text-[22px] font-medium tracking-tight" : "text-[22px] font-semibold"} text-foreground truncate`}>{number}</h1>
        {status}
        {meta && <div className="text-[13px] text-muted-foreground flex items-center gap-1.5">{meta}</div>}
        <span className="flex-1" />
        {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
      </div>
      {tabs}
      {children}
    </div>
  );
}

/** แท็บของหน้าเอกสาร (ใต้หัว) */
export function DocumentTabs<K extends string>({ tabs, active, onChange, ariaLabel }: {
  tabs: { key: K; label: string }[];
  active: K;
  onChange: (k: K) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 -mb-px mt-0.5 overflow-x-auto">
      {tabs.map((tab) => {
        const sel = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(tab.key)}
            className={`h-11 px-3 text-sm whitespace-nowrap border-b-2 transition-colors ${sel ? "border-[#c9a84c] text-foreground font-semibold" : "border-transparent text-muted-foreground font-medium hover:text-foreground"}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** แถบขั้นตอนของเอกสารในการ์ดขาว — ขั้นที่ผ่านแล้วเป็นวงกรมท่ามีเครื่องหมายถูก ขั้นปัจจุบันตัวหนา */
export function DocumentStepper({ steps, current, ariaLabel }: {
  steps: { label: string; hint?: string }[];
  /** index ของขั้นปัจจุบัน · ใส่ steps.length เมื่อครบทุกขั้นแล้ว */
  current: number;
  ariaLabel: string;
}) {
  return (
    <ol aria-label={ariaLabel} className="m-0 px-5 py-3.5 list-none bg-card border border-border rounded-xl flex items-center gap-2.5 overflow-x-auto print:hidden">
      {steps.map((step, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <Fragment key={i}>
            {i > 0 && <li aria-hidden="true" className={`flex-1 min-w-4 h-px ${done || now ? "bg-[#0b1d3a]/40" : "bg-[#d6dce6]"}`} />}
            <li aria-current={now ? "step" : undefined} className={`flex items-center gap-2 whitespace-nowrap text-sm ${now ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`} title={step.hint}>
              <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center flex-shrink-0 ${done ? "bg-[#0b1d3a] text-white" : now ? "bg-[#0b1d3a] text-white font-semibold" : "border border-[#c3ccda]"}`}>
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              {step.label}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

/** โครงสองคอลัมน์: การ์ดซ้าย + คอลัมน์ขวา 320px (จอแคบเรียงลงล่าง) */
export function DocumentColumns({ main, rail }: { main: ReactNode; rail: ReactNode }) {
  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 w-full flex flex-col gap-5">{main}</div>
      <aside className="w-full xl:w-80 flex-shrink-0 flex flex-col gap-4 print:hidden">{rail}</aside>
    </div>
  );
}

/** การ์ดยอดรวมสีกรมท่าบนคอลัมน์ขวา */
export function RailTotalCard({ label, amount, rows }: {
  label: ReactNode;
  amount: ReactNode;
  rows?: { label: ReactNode; value: ReactNode }[];
}) {
  return (
    <div className="rounded-xl bg-[#0b1d3a] text-white p-5 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-[#c5d3e8]">{label}</span>
        <span className="text-[26px] leading-tight font-semibold tabular-nums">{amount}</span>
      </div>
      {rows && rows.length > 0 && (
        <div className="pt-3 border-t border-white/10 flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-[#c5d3e8]">{r.label}</span>
              <span className="tabular-nums font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** การ์ดข้อมูลเล็กบนคอลัมน์ขวา */
export function RailCard({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl">
      <div className="px-5 py-3.5 border-b border-[#eef1f6] flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold text-foreground">{title}</h2>
        {actions}
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** กล่องฟ้า "ขั้นต่อไป" บอกผู้ใช้ว่าต้องทำอะไรต่อ */
export function NextStepHint({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-[#e8f0fb] border border-[#b9d0f0] px-4 py-3.5 flex gap-3">
      <Info size={18} className="text-[#1a5fb4] flex-shrink-0 mt-0.5" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-semibold text-[#1a5fb4]">{title}</span>
        <div className="text-[13px] text-[#26395a] leading-relaxed">{children}</div>
      </div>
    </div>
  );
}
