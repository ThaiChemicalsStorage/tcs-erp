import { FilePen, Clock, CheckCircle2, Ban, Send, CheckCheck, Trophy, XCircle, Frown } from "lucide-react";
import type { User } from "./users";
import { type Role, hasPermission } from "./roles";

export type QuoteStatus =
  | "ร่าง"
  | "รออนุมัติ"
  | "อนุมัติแล้ว"
  | "ส่งให้ลูกค้าแล้ว"
  | "ลูกค้ายอมรับ"
  | "ปิดการขายสำเร็จ"
  | "ลูกค้าปฏิเสธ"
  | "เสียโอกาส"
  | "ยกเลิก";
export type QuoteInterest = "น่าสนใจ" | "ไม่น่าสนใจ" | null;

export type ApprovalAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "sent_to_customer"
  | "customer_accepted"
  | "customer_rejected"
  | "marked_won"
  | "marked_lost"
  | "cancelled";

export const approvalActionLabel: Record<ApprovalAction, string> = {
  submitted: "ส่งขออนุมัติ",
  approved: "อนุมัติ",
  rejected: "ปฏิเสธ (ส่งกลับแก้ไข)",
  sent_to_customer: "ส่งให้ลูกค้า",
  customer_accepted: "ลูกค้ายอมรับ",
  customer_rejected: "ลูกค้าปฏิเสธ",
  marked_won: "ปิดการขายสำเร็จ",
  marked_lost: "ปิดการขายไม่สำเร็จ",
  cancelled: "ยกเลิกใบเสนอราคา",
};

export interface ApprovalHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  action: ApprovalAction;
  comment: string;
  createdAt: string;
}

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
  contactEmail: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  deliveryAddress: string;
  project: string;
  poRef: string;
  paymentTerms: string;
  issueDate: string;
  expiryDate: string;
  remarks: string;
  /** User id of the creator, used for ownership-scoped edit permission. Empty string for legacy/seed quotes. */
  createdByUserId: string;
  approvalHistory: ApprovalHistoryEntry[];
}

export type QuoteDraftFields = Pick<
  Quote,
  | "client" | "status" | "lines" | "discount" | "salesperson"
  | "contactName" | "contactPhone" | "contactEmail" | "address" | "taxId"
  | "deliveryMethod" | "deliveryAddress" | "project"
  | "poRef" | "paymentTerms" | "issueDate" | "expiryDate" | "remarks"
> & { amount: number };

export const VAT_RATE = 7;

export const statusStyle: Record<QuoteStatus, string> = {
  "ร่าง": "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20",
  "รออนุมัติ": "bg-[#c9a84c]/10 text-[#c9a84c] border border-[#c9a84c]/20",
  "อนุมัติแล้ว": "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20",
  "ส่งให้ลูกค้าแล้ว": "bg-[#3b6fc9]/10 text-[#3b6fc9] border border-[#3b6fc9]/20",
  "ลูกค้ายอมรับ": "bg-[#1f9d8a]/10 text-[#1f9d8a] border border-[#1f9d8a]/20",
  "ปิดการขายสำเร็จ": "bg-[#157347]/10 text-[#157347] border border-[#157347]/20",
  "ลูกค้าปฏิเสธ": "bg-[#e08a3c]/10 text-[#e08a3c] border border-[#e08a3c]/20",
  "เสียโอกาส": "bg-[#e05252]/10 text-[#e05252] border border-[#e05252]/20",
  "ยกเลิก": "bg-[#8a94a6]/10 text-[#8a94a6] border border-[#8a94a6]/20",
};

export const statusIcon: Record<QuoteStatus, React.ReactNode> = {
  "ร่าง": <FilePen size={10} />,
  "รออนุมัติ": <Clock size={10} />,
  "อนุมัติแล้ว": <CheckCircle2 size={10} />,
  "ส่งให้ลูกค้าแล้ว": <Send size={10} />,
  "ลูกค้ายอมรับ": <CheckCheck size={10} />,
  "ปิดการขายสำเร็จ": <Trophy size={10} />,
  "ลูกค้าปฏิเสธ": <XCircle size={10} />,
  "เสียโอกาส": <Frown size={10} />,
  "ยกเลิก": <Ban size={10} />,
};

/** The quotation approval-workflow state machine: which statuses each ApprovalAction may move a quote from/to. */
export const workflowTransitions: Record<ApprovalAction, { from: QuoteStatus[]; to: QuoteStatus }> = {
  submitted: { from: ["ร่าง"], to: "รออนุมัติ" },
  approved: { from: ["รออนุมัติ"], to: "อนุมัติแล้ว" },
  rejected: { from: ["รออนุมัติ"], to: "ร่าง" },
  sent_to_customer: { from: ["อนุมัติแล้ว"], to: "ส่งให้ลูกค้าแล้ว" },
  customer_accepted: { from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้ายอมรับ" },
  customer_rejected: { from: ["ส่งให้ลูกค้าแล้ว"], to: "ลูกค้าปฏิเสธ" },
  marked_won: { from: ["ลูกค้ายอมรับ"], to: "ปิดการขายสำเร็จ" },
  marked_lost: { from: ["ลูกค้าปฏิเสธ"], to: "เสียโอกาส" },
  cancelled: { from: ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"], to: "ยกเลิก" },
};

export function newHistoryId(): string {
  return `ah-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface QuotePermissions {
  canEdit: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canSendToCustomer: boolean;
  canMarkCustomerAccepted: boolean;
  canMarkCustomerRejected: boolean;
  canMarkWon: boolean;
  canMarkLost: boolean;
  canCancel: boolean;
}

export function computeQuotePermissions(quote: Quote | undefined, isNew: boolean, currentUser: User, roles: Role[]): QuotePermissions {
  const isOwner = !quote || !quote.createdByUserId || quote.createdByUserId === currentUser.id;
  const hasCreate = hasPermission(currentUser, roles, "quotations:create");
  const hasEdit = hasPermission(currentUser, roles, "quotations:edit");
  const hasApprove = hasPermission(currentUser, roles, "quotations:approve");
  const hasReject = hasPermission(currentUser, roles, "quotations:reject");
  const hasDelete = hasPermission(currentUser, roles, "quotations:delete");
  const editableByOwnerOrApprover = hasEdit && (isOwner || hasApprove);
  const status = quote?.status;

  return {
    canEdit: isNew ? hasCreate : editableByOwnerOrApprover,
    canSubmit: !isNew && status === "ร่าง" && (hasCreate || hasEdit) && isOwner,
    canApprove: !isNew && status === "รออนุมัติ" && hasApprove,
    canReject: !isNew && status === "รออนุมัติ" && hasReject,
    canSendToCustomer: !isNew && status === "อนุมัติแล้ว" && editableByOwnerOrApprover,
    canMarkCustomerAccepted: !isNew && status === "ส่งให้ลูกค้าแล้ว" && editableByOwnerOrApprover,
    canMarkCustomerRejected: !isNew && status === "ส่งให้ลูกค้าแล้ว" && editableByOwnerOrApprover,
    canMarkWon: !isNew && status === "ลูกค้ายอมรับ" && editableByOwnerOrApprover,
    canMarkLost: !isNew && status === "ลูกค้าปฏิเสธ" && editableByOwnerOrApprover,
    canCancel: !isNew && !!status && ["ร่าง", "รออนุมัติ", "อนุมัติแล้ว"].includes(status) && hasDelete,
  };
}

const PAYMENT_TERMS = ["ชำระภายใน 30 วัน", "ชำระภายใน 60 วัน", "ชำระทันที", "แบ่งชำระ 3 งวด"];
export const paymentTermsOptions = PAYMENT_TERMS;

export function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function convertDigitGroup(n: number, hasPrecedingDigits: boolean): string {
  if (n === 0) return "";
  const digits = String(n).split("").map(Number);
  const len = digits.length;
  let out = "";
  digits.forEach((d, i) => {
    const pos = len - i - 1;
    if (d === 0) return;
    if (pos === 0 && d === 1 && (len > 1 || hasPrecedingDigits)) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 1 && d === 1) out += "สิบ";
    else out += THAI_DIGITS[d] + THAI_POSITIONS[pos];
  });
  return out;
}

/** Converts a THB amount to its Thai-language words form, e.g. 802500 -> "(แปดแสนสองพันห้าร้อยบาทถ้วน)". */
export function bahtText(amount: number): string {
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const intPart = Math.floor(rounded);
  const satang = Math.round((rounded - intPart) * 100);

  let intText = "ศูนย์";
  if (intPart > 0) {
    const groups: number[] = [];
    let remaining = intPart;
    while (remaining > 0) {
      groups.unshift(remaining % 1000000);
      remaining = Math.floor(remaining / 1000000);
    }
    let hasPrior = false;
    intText = groups
      .map((g, i) => {
        if (g === 0) return "";
        const text = convertDigitGroup(g, hasPrior) + "ล้าน".repeat(groups.length - 1 - i);
        hasPrior = true;
        return text;
      })
      .join("");
  }

  const satangText = satang === 0 ? "ถ้วน" : `${convertDigitGroup(satang, false)}สตางค์`;
  return `(${intText}บาท${satangText})`;
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
  contactEmail: "somchai@example.com",
  address: "45 ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ 10110",
  taxId: "0105563012345",
  deliveryMethod: "",
  deliveryAddress: "",
  project: "",
  poRef: "PO-2567-7734",
  paymentTerms: PAYMENT_TERMS[0],
  issueDate: "2024-12-14",
  expiryDate: "2025-01-14",
  remarks: "",
  createdByUserId: "",
  approvalHistory: [] as ApprovalHistoryEntry[],
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
    contactName: "", contactPhone: "", contactEmail: "", address: "", taxId: "", deliveryMethod: "", deliveryAddress: "", project: "",
    poRef: "", paymentTerms: PAYMENT_TERMS[0], issueDate: "2024-12-12", expiryDate: "2025-01-12", remarks: "",
    createdByUserId: "", approvalHistory: [],
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
    contactName: "", contactPhone: "", contactEmail: "", address: "", taxId: "", deliveryMethod: "", deliveryAddress: "", project: "",
    poRef: "", paymentTerms: PAYMENT_TERMS[0], issueDate: "2024-12-07", expiryDate: "2025-01-07", remarks: "",
    createdByUserId: "", approvalHistory: [],
  },
  {
    id: "QT-2567-0035", client: "ฮาร์ทเวลล์ อินดัสทรีส์", date: "5 ธ.ค. 2567", valid: "5 ม.ค. 2568", amount: 320000,
    status: "รออนุมัติ", salesperson: "สมชาย วงศ์ดี", interest: "ไม่น่าสนใจ", discount: 0, lines: [blankLine()], ...seedMeta,
  },
];

const QUOTES_KEY = "tcs_erp_quotes";

export function loadQuotes(): Quote[] {
  try {
    const raw = localStorage.getItem(QUOTES_KEY);
    return raw ? JSON.parse(raw) : initialQuotes;
  } catch {
    return initialQuotes;
  }
}
export function saveQuotes(quotes: Quote[]) {
  localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
}
