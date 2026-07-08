import { FilePen, Clock, CheckCircle2, Ban } from "lucide-react";

export type QuoteStatus = "ร่าง" | "รออนุมัติ" | "อนุมัติแล้ว" | "ยกเลิก";
export type QuoteInterest = "น่าสนใจ" | "ไม่น่าสนใจ" | null;

export interface SubDetail {
  id: string;
  text: string;
}

export interface QuoteLine {
  id: number;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;
  notes: string;
  specifications: string;
  tags: string[];
  subDetails: SubDetail[];
}

export interface Quote {
  id: string;
  client: string;
  date: string;
  valid: string;
  amount: number;
  status: QuoteStatus;
  salesperson: string;
  interest: QuoteInterest;
  lines: QuoteLine[];
  discount: number;
  contactName: string;
  contactPhone: string;
  address: string;
  taxId: string;
  poRef: string;
  paymentTerms: string;
  issueDate: string;
  expiryDate: string;
}

export type QuoteDraftFields = Pick<
  Quote,
  "client" | "status" | "lines" | "discount" | "salesperson" | "contactName" | "contactPhone" | "address" | "taxId" | "poRef" | "paymentTerms" | "issueDate" | "expiryDate"
> & { amount: number };

export const VAT_RATE = 7;

export const statusStyle: Record<QuoteStatus, string> = {
  "ร่าง": "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20",
  "รออนุมัติ": "bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20",
  "อนุมัติแล้ว": "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20",
  "ยกเลิก": "bg-[#e05252]/10 text-[#e05252] border border-[#e05252]/20",
};

export const statusIcon: Record<QuoteStatus, React.ReactNode> = {
  "ร่าง": <FilePen size={10} />,
  "รออนุมัติ": <Clock size={10} />,
  "อนุมัติแล้ว": <CheckCircle2 size={10} />,
  "ยกเลิก": <Ban size={10} />,
};

const PAYMENT_TERMS = ["ชำระภายใน 30 วัน", "ชำระภายใน 60 วัน", "ชำระทันที", "แบ่งชำระ 3 งวด"];
export const paymentTermsOptions = PAYMENT_TERMS;

export function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function todayIso(): string {
  return toIsoDate(new Date());
}
export function plusDaysIso(days: number): string {
  return toIsoDate(new Date(Date.now() + days * 86400000));
}

let lineIdCounter = 1000;
export function newLineId(): number {
  lineIdCounter += 1;
  return Date.now() + lineIdCounter;
}

export function newSubDetailId(): string {
  return `sd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function blankLine(): QuoteLine {
  return { id: newLineId(), description: "", unit: "ชิ้น", qty: 1, unitPrice: 0, discount: 0, notes: "", specifications: "", tags: [], subDetails: [] };
}

export function blankQuoteTemplate(): QuoteLine[] {
  return [
    {
      id: newLineId(), description: "เครื่องจักรอุตสาหกรรม รุ่น X-500", unit: "เครื่อง", qty: 2, unitPrice: 285000, discount: 5,
      notes: "• ราคารวมการฝึกอบรมการใช้งานเบื้องต้น 1 วัน\n• รับประกันตัวเครื่อง 2 ปี ไม่รวมอะไหล่สิ้นเปลือง",
      specifications: "กำลังไฟ: 380V 3 เฟส · น้ำหนัก: 1,250 กก. · ขนาด: 2.4 x 1.8 x 2.1 ม.",
      tags: ["เครื่องจักร", "รับประกัน 2 ปี"],
      subDetails: [
        { id: newSubDetailId(), text: "จัดส่งและติดตั้งหน้างาน" },
        { id: newSubDetailId(), text: "ทดสอบระบบก่อนส่งมอบ" },
      ],
    },
    { id: newLineId(), description: "ชุดอะไหล่สำรอง (ชุดมาตรฐาน)", unit: "ชุด", qty: 5, unitPrice: 12500, discount: 0, notes: "", specifications: "", tags: [], subDetails: [] },
    {
      id: newLineId(), description: "บริการติดตั้งและทดสอบ", unit: "ครั้ง", qty: 1, unitPrice: 45000, discount: 10,
      notes: "ขอบเขตงาน:\n1. เดินระบบท่อและงานไฟฟ้าที่เกี่ยวข้อง\n2. ทดสอบแรงดันระบบ\n3. อบรมการใช้งานให้ทีมลูกค้า",
      specifications: "",
      tags: ["บริการ"],
      subDetails: [
        { id: newSubDetailId(), text: "สำรวจหน้างานก่อนติดตั้ง" },
        { id: newSubDetailId(), text: "ติดตั้งและเดินระบบท่อ" },
        { id: newSubDetailId(), text: "ทดสอบแรงดันและความปลอดภัย" },
        { id: newSubDetailId(), text: "อบรมการใช้งานให้ทีมลูกค้า" },
      ],
    },
  ];
}

export function lineSubtotal(l: QuoteLine): number {
  return l.qty * l.unitPrice * (1 - l.discount / 100);
}

export function computeTotals(lines: QuoteLine[], discountPct: number) {
  const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const discountAmt = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmt;
  const vatAmt = afterDiscount * (VAT_RATE / 100);
  const total = afterDiscount + vatAmt;
  return { subtotal, discountAmt, afterDiscount, vatAmt, total };
}

export function cloneLines(lines: QuoteLine[]): QuoteLine[] {
  return lines.map((l) => ({
    ...l,
    id: newLineId(),
    tags: [...l.tags],
    subDetails: l.subDetails.map((sd) => ({ ...sd, id: newSubDetailId() })),
  }));
}

export function nextQuoteId(quotes: Quote[]): string {
  const year = 2567;
  const maxNum = quotes
    .map((q) => parseInt(q.id.split("-").pop() ?? "0", 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `QT-${year}-${String(maxNum + 1).padStart(4, "0")}`;
}

const seedMeta = {
  contactName: "คุณสมชาย วงศ์ดี",
  contactPhone: "081-234-5678",
  address: "45 ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ 10110",
  taxId: "0105563012345",
  poRef: "PO-2567-7734",
  paymentTerms: PAYMENT_TERMS[0],
  issueDate: "2024-12-14",
  expiryDate: "2025-01-14",
};

export const initialQuotes: Quote[] = [
  {
    id: "QT-2567-0041", client: "เมอริเดียน คอร์ป", date: "14 ธ.ค. 2567", valid: "14 ม.ค. 2568", amount: 892500,
    status: "อนุมัติแล้ว", salesperson: "นภา ลาเรนต์", interest: "น่าสนใจ", discount: 0, lines: blankQuoteTemplate(), ...seedMeta,
  },
  {
    id: "QT-2567-0040", client: "เอเพ็กซ์ โกลบอล", date: "13 ธ.ค. 2567", valid: "13 ม.ค. 2568", amount: 2140000,
    status: "รออนุมัติ", salesperson: "สมชาย วงศ์ดี", interest: "น่าสนใจ", discount: 0, lines: blankQuoteTemplate(), ...seedMeta,
  },
  {
    id: "QT-2567-0039", client: "สเตอร์ลิง ไดนามิกส์", date: "12 ธ.ค. 2567", valid: "12 ม.ค. 2568", amount: 345000,
    status: "ร่าง", salesperson: "อรุณ ศรีสวัสดิ์", interest: null, discount: 0, lines: [blankLine()],
    contactName: "", contactPhone: "", address: "", taxId: "", poRef: "", paymentTerms: PAYMENT_TERMS[0], issueDate: "2024-12-12", expiryDate: "2025-01-12",
  },
  {
    id: "QT-2567-0038", client: "ดูรอง เฟรร์ เอสเอ", date: "10 ธ.ค. 2567", valid: "10 ม.ค. 2568", amount: 678900,
    status: "ยกเลิก", salesperson: "วิภา เจริญสุข", interest: "ไม่น่าสนใจ", discount: 0, lines: [blankLine()], ...seedMeta,
  },
  {
    id: "QT-2567-0037", client: "นากามูระ โฮลดิ้งส์", date: "9 ธ.ค. 2567", valid: "9 ม.ค. 2568", amount: 1250000,
    status: "อนุมัติแล้ว", salesperson: "นภา ลาเรนต์", interest: "น่าสนใจ", discount: 0, lines: blankQuoteTemplate(), ...seedMeta,
  },
  {
    id: "QT-2567-0036", client: "แบล็กเวลล์ แอนด์ ซันส์", date: "7 ธ.ค. 2567", valid: "7 ม.ค. 2568", amount: 540000,
    status: "ร่าง", salesperson: "ธีรพัฒน์ มานะ", interest: null, discount: 0, lines: [blankLine()],
    contactName: "", contactPhone: "", address: "", taxId: "", poRef: "", paymentTerms: PAYMENT_TERMS[0], issueDate: "2024-12-07", expiryDate: "2025-01-07",
  },
  {
    id: "QT-2567-0035", client: "ฮาร์ทเวลล์ อินดัสทรีส์", date: "5 ธ.ค. 2567", valid: "5 ม.ค. 2568", amount: 320000,
    status: "รออนุมัติ", salesperson: "สมชาย วงศ์ดี", interest: "ไม่น่าสนใจ", discount: 0, lines: [blankLine()], ...seedMeta,
  },
];
