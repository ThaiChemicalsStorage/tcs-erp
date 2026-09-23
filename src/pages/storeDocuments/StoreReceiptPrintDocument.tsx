import type { CompanyHeaderInfo } from "../../lib/storage";
import type { StoreReceipt, StoreReceiptSourceLine } from "../../lib/storeReceipt";
import { storeReceiptCodeInfo, type StoreReceiptCode } from "../../lib/storeCodes";
import { PrintLetterhead } from "../../components/PrintLetterhead";
import { PrintSignatureLine } from "../../components/PrintSignature";
import { PrintPageFrame } from "../../components/PrintPageFrame";
import { printAmount, printDate, printDateOrBlank, printNumber, printText, printTextOrBlank } from "../../lib/printFormat";

/**
 * ใบพิมพ์ใบรับคืน / รับเข้าคลังของสโตร์ (2026-09-23)
 *
 * **ยังไม่มีฟอร์มกระดาษจริง** — เจ้าของยังไม่ได้ส่งมา จึงวางตามฟอร์มคู่ของมัน คือใบเบิกและใบคืนวัสดุ FM-ST-04
 * (`MaterialRequisitionPrintDocument.tsx`) ทุกอย่าง: หัวจดหมายบริษัท, หัวใบแบบช่องขีดเส้นใต้, ตารางรายการ
 * เส้นดำตัวเล็ก, และช่องเซ็นสองคอลัมน์ เพื่อให้สโตร์เห็นสองใบนี้เป็นชุดเดียวกัน · **ไม่พิมพ์รหัสฟอร์ม (FM-…)**
 * เพราะใบนี้ยังไม่มีรหัสฟอร์ม ISO ของตัวเอง — ห้ามแต่งขึ้นเอง ถ้าเจ้าของส่งฟอร์มมาค่อยเปลี่ยนตามนั้น
 *
 * หัวใบ ตาราง และช่องเซ็นเปลี่ยนตามชนิดของรหัส (`storeReceiptCodeInfo(code).kind`):
 *  - **return** — อ้างใบเบิกต้นทาง, คอลัมน์ "จ่ายไป" คู่กับ "คืนครั้งนี้", เซ็น ผู้คืน / ผู้รับคืน
 *  - **receive** — เลขอ้างอิง, จำนวนรับพร้อมต้นทุนและมูลค่า (GC ของลูกค้าไม่คิดมูลค่า), เซ็น ผู้ส่งมอบ / ผู้รับเข้าคลัง
 *  - **adjust** — เหตุผลการปรับยอดพิมพ์เป็นกล่องเด่น, คอลัมน์ยอดที่ถูกต้อง/นับได้จริง
 *
 * ภาษาไทยฮาร์ดโค้ดเสมอ ห้ามเรียก `useI18n` — เอกสารที่พิมพ์ออกไปต้องไม่เปลี่ยนภาษาตามคนกด (ดู docs/CLAUDE.md)
 * ชื่อรหัสจึงเป็นตารางภาษาไทยของไฟล์นี้เอง ตรงกับชื่อในโปรแกรมบัญชีที่บริษัทใช้
 */
const PRINT_NAME: Record<StoreReceiptCode, string> = {
  JD: "รับคืนวัตถุดิบจากการผลิต", J1: "รับวัตถุดิบผลิต JD-SHELL#J1", J2: "รับวัตถุดิบผลิต JD-ASSEMBLY#J2",
  J3: "รับวัตถุดิบผลิต JD-STEEL#J3", JP: "รับคืนวัตถุดิบจากโครงการ", JB: "รับคืนวัตถุดิบจากไฟฟ้า",
  JS: "รับคืนงานเหล็กโครงการ", JC: "รับคืนจากการซ่อมเคลม", JT: "รับคืนเครื่องมือ",
  FG: "รับสินค้าสำเร็จรูปจากการผลิต", FP: "รับสินค้าสำเร็จรูปงานโครงการ", GC: "ใบรับสินค้าของลูกค้า",
  JN: "รับเพื่อน็อตเป็นชุด", JU: "ปรับปรุงเพิ่ม/ลดสินค้า", TK: "ปรับปรุงจากการตรวจนับ",
};

const TITLE: Record<"return" | "receive" | "adjust", string> = {
  return: "ใบรับคืนวัสดุ",
  receive: "ใบรับสินค้าเข้าคลัง",
  adjust: "ใบปรับปรุงยอดสินค้า",
};

const th = "border border-black px-1.5 py-1 font-semibold text-center";
const td = "border border-black px-1.5 py-1";

export function StoreReceiptPrintDocument({ doc, sourceLines, companyHeader }: {
  doc: StoreReceipt;
  sourceLines: StoreReceiptSourceLine[];
  companyHeader: CompanyHeaderInfo;
}) {
  const kind = storeReceiptCodeInfo(doc.receiptCode).kind;
  const formNumber = doc.documentNumber || doc.id;
  const src = new Map(sourceLines.map((s) => [s.lineId, s]));
  const chargeTo = [doc.chargeDepartmentName, doc.chargeTeamName].filter(Boolean).join(" / ");
  // ของลูกค้า (GC) รับเข้าโดยไม่คิดมูลค่า — ฝั่งเซิร์ฟเวอร์ลงต้นทุนแถวเป็น 0 ใบพิมพ์จึงไม่โชว์ต้นทุนให้เข้าใจผิด
  const priced = kind === "receive" && doc.receiptCode !== "GC";
  const printedLines = doc.lines.filter((l) => l.productId || l.productName);

  // หัวใบสองคอลัมน์ — แถวเปลี่ยนตามชนิด ไม่พิมพ์ช่องที่ชนิดนั้นไม่มีทางใช้ (จะได้ไม่เต็มไปด้วยขีด)
  const headerRows: [string, string, string, string][] = kind === "return"
    ? [
      ["อ้างอิงใบเบิก:", printText(doc.sourceRequisitionNumber), "เลขที่ใบรับคืน:", formNumber],
      ["รหัสงาน:", printText(doc.jobCode), "วันที่รับคืน:", printDate(doc.receivedDate)],
      ["ชื่อลูกค้า:", printText(doc.customerName), "คืนจากแผนก/ทีม:", printText(chargeTo)],
    ]
    : kind === "receive"
      ? [
        ["เลขที่อ้างอิง:", printText(doc.reference), "เลขที่ใบรับ:", formNumber],
        ["รหัสงาน:", printText(doc.jobCode), "วันที่รับ:", printDate(doc.receivedDate)],
        ["ชื่อลูกค้า:", printText(doc.customerName), "แผนก/ทีม:", printText(chargeTo)],
      ]
      : [
        ["เลขที่อ้างอิง:", printText(doc.reference), "เลขที่ใบปรับยอด:", formNumber],
        ["รหัสงาน:", printText(doc.jobCode), "วันที่ปรับยอด:", printDate(doc.receivedDate)],
      ];

  const qtyHeader = kind === "return" ? "คืนครั้งนี้"
    : kind === "adjust" ? (doc.receiptCode === "TK" ? "ยอดนับได้จริง" : "ยอดที่ถูกต้อง")
      : "จำนวนรับ";
  const headers = ["No.", "รหัสสินค้า", "รายการ", "หน่วย",
    ...(kind === "return" ? ["จ่ายไป"] : []),
    qtyHeader,
    ...(priced ? ["ต้นทุน/หน่วย", "มูลค่า"] : [])];
  const total = priced
    ? printedLines.reduce((sum, l) => sum + (l.qty ?? 0) * (l.unitCost ?? 0), 0)
    : 0;
  // บรรทัดที่เว้นต้นทุนไว้ = ใช้ต้นทุนเฉลี่ยเดิมตอนรับเข้า ยังไม่รู้มูลค่าจริงตอนพิมพ์ — ไม่รวมยอดให้เข้าใจผิด
  const totalKnown = priced && printedLines.every((l) => l.unitCost !== null);

  const signatureRows = [
    [
      { label: "ผู้จัดทำ", name: doc.preparedBy, date: doc.preparedAt, userId: doc.createdBy },
      { label: "ผู้อนุมัติ", name: doc.approvedBy, date: doc.approvedAt, userId: doc.approvedByUserId ?? "" },
    ],
    [
      { label: "แผนกสโตร์", name: doc.storeDeptBy, date: doc.storeDeptAt, userId: "" },
      { label: "แผนกต้นทุน", name: doc.costDeptBy, date: doc.costDeptAt, userId: "" },
    ],
    ...(kind === "adjust" ? [] : [[
      { label: kind === "return" ? "ผู้คืน" : "ผู้ส่งมอบ", name: doc.returnedBy, date: doc.receivedDate, userId: "" },
      { label: kind === "return" ? "ผู้รับคืน" : "ผู้รับเข้าคลัง", name: doc.receivedBy, date: doc.receivedDate, userId: "" },
    ]]),
  ];

  return (
    <div className="hidden print:block" style={{ fontFamily: "'Times New Roman', 'Noto Serif Thai', serif" }}>
      <PrintPageFrame>
        <PrintLetterhead
          companyHeader={companyHeader}
          docLabel={kind === "adjust" ? "STOCK ADJUST" : kind === "return" ? "RETURN" : "RECEIPT"}
          rightMeta={[
            { label: "เลขที่", value: formNumber },
            { label: "รหัสงาน", value: printText(doc.jobCode) },
          ]}
        />
        <h1 className="text-center text-lg font-bold">{TITLE[kind]}</h1>
        <p className="text-center text-xs mb-3">รหัส {doc.receiptCode} — {PRINT_NAME[doc.receiptCode]}</p>

        <table className="w-full text-xs mb-3" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {headerRows.map(([l1, v1, l2, v2]) => (
              <tr key={l1}>
                <td className="py-0.5 pr-2 font-semibold w-28">{l1}</td>
                <td className="py-0.5 border-b border-black">{v1}</td>
                <td className="py-0.5 pl-4 pr-2 font-semibold w-32">{l2}</td>
                <td className="py-0.5 border-b border-black w-40">{v2}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ปรับยอดต้องมีเหตุผลทุกใบ (เซิร์ฟเวอร์บังคับตอนอนุมัติ) — พิมพ์ก่อนตารางให้คนเซ็นอ่านก่อนเห็นตัวเลข */}
        {kind === "adjust" && (
          <div className="border border-black px-2 py-1 mb-3 text-xs" style={{ whiteSpace: "pre-wrap" }}>
            <span className="font-semibold">เหตุผลการปรับยอด :</span> {printText(doc.reason)}
          </div>
        )}

        <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>{headers.map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {printedLines.map((line, idx) => {
              const source = line.sourceLineId ? src.get(line.sourceLineId) : undefined;
              return (
                <tr key={line.id}>
                  <td className={`${td} text-center`}>{idx + 1}</td>
                  <td className={td}>{printText(line.productCode)}</td>
                  <td className={td}>{printText(line.productName)}</td>
                  <td className={`${td} text-center`}>{printText(line.unit)}</td>
                  {kind === "return" && <td className={`${td} text-center`}>{printNumber(source?.issued)}</td>}
                  <td className={`${td} text-center`}>{printNumber(line.qty)}</td>
                  {priced && <td className={`${td} text-right`}>{line.unitCost === null ? "ต้นทุนเฉลี่ย" : printAmount(line.unitCost)}</td>}
                  {priced && <td className={`${td} text-right`}>{line.unitCost === null ? "-" : printAmount((line.qty ?? 0) * line.unitCost)}</td>}
                </tr>
              );
            })}
            {printedLines.length === 0 && (
              <tr><td colSpan={headers.length} className={`${td} text-center`}>-</td></tr>
            )}
          </tbody>
          {priced && totalKnown && printedLines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={headers.length - 1} className={`${td} text-right font-semibold`}>รวมมูลค่า</td>
                <td className={`${td} text-right font-semibold`}>{printAmount(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {doc.receiptCode === "GC" && (
          <p className="text-[10px] mt-1">* สินค้าของลูกค้า รับฝากเข้าคลังโดยไม่คิดมูลค่า</p>
        )}
        {kind !== "adjust" && doc.reason.trim() !== "" && (
          <div className="border border-black px-2 py-1 mt-2 text-[10px]" style={{ whiteSpace: "pre-wrap" }}>
            <span className="font-semibold">หมายเหตุ :</span> {doc.reason}
          </div>
        )}
        {/* ใบที่รับเข้าคลังแล้ว บอกไว้บนกระดาษด้วยว่าสต๊อกในระบบขยับแล้วเมื่อไหร่ — กันคนเอาใบเดิมไปคีย์ซ้ำ */}
        {doc.postedAt && (
          <p className="text-[10px] mt-2">
            บันทึกรับเข้าคลังในระบบแล้ว วันที่ {printDate(doc.postedAt)}{doc.postedByName ? ` โดย ${doc.postedByName}` : ""}
          </p>
        )}

        {/* กันบล็อกลายเซ็นถูกหั่นคร่อมหน้า — รูปแบบเดียวกับใบเบิกและใบคืนวัสดุ */}
        <table className="w-full text-xs mt-6" style={{ borderCollapse: "collapse", breakInside: "avoid" }}>
          <tbody>
            {signatureRows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map(({ label, name, date, userId }) => (
                  <td key={label} className="w-1/2 py-2 text-center align-top">
                    <PrintSignatureLine userId={userId} height={32} />
                    <div className="border-b border-black mb-1 w-3/4 mx-auto" />
                    <p>{label}: {printTextOrBlank(name)}</p>
                    <p>วันที่: {printDateOrBlank(date) || "....... / ....... / ......."}</p>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </PrintPageFrame>
    </div>
  );
}
