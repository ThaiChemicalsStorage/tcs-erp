import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { paginate, type PrintLayout as Layout } from "../lib/printPagination";

/**
 * ใบพิมพ์แบบฟอร์มที่จัดหน้าเอง (2026-10-06 เจ้าของ: *"ถ้ามันขึ้นหน้าใหม่ … อยากให้เอาส่วนหัวกระดาษออกมาด้วย … ถ้าสินค้าไม่ได้ล้นมาอีกหน้า
 * แต่พวกผู้สั่งผลิตผู้อนุมัติล้นมาอีกหน้า ให้เอาหัวตารางพวกชื่อลูกค้ามาด้วย แล้วก็ทำให้เต็มหน้ากระดาษ พวกตารางลำดับก็ปล่อยเป็นช่องว่างไป"*)
 *
 * **ทุกหน้า**: หัวเอกสาร (`header`) + หัวตาราง (`tableHead`) + บรรทัดรายการ + **แถวว่างเติมจนเต็มหน้า** + ท้ายกระดาษ (`pageFooter`)
 * **หน้าสุดท้าย**: ต่อด้วย `footer` (หมายเหตุ/ช่องเซ็น) ชิดก้นหน้า · ถ้าช่องเซ็นไม่พอที่ในหน้าที่รายการจบ → ยกไปหน้าใหม่ที่มีหัว + ตารางแถวว่างเต็มหน้า
 *
 * **ทำไมต้องวัดเอง:** เบราว์เซอร์พิมพ์ซ้ำได้แค่ `<thead>` ของตารางที่ถูกหั่น — หัวเอกสารที่อยู่นอกตารางไม่ซ้ำ, ช่องเซ็นที่ `break-inside: avoid`
 * ถูกดันไปหน้าใหม่โดยไม่มีอะไรนำหน้า และ CSS ไม่รู้ว่าเหลือที่เท่าไหร่จึงเติมแถวว่างให้เต็มหน้าไม่ได้
 * จึงวัดความสูงจริงของแต่ละส่วน (ฟอนต์/ความกว้างเดียวกับตอนพิมพ์) แล้วแบ่งหน้าเอง แบบเดียวกับใบจ่าย/ใบรับคืน
 * (`StoreSlipPrint`) แต่ไม่ต้องฟิกจำนวนบรรทัด — แต่ละบรรทัดสูงไม่เท่ากันได้ (รายละเอียดย่อยหลายบรรทัด)
 *
 * **วัดหลังทุก render** (กล่องวัดซ่อนอยู่นอกจอตลอด) แล้ว set state เฉพาะเมื่อผลเปลี่ยน — ⚠️ วัดเฉพาะตอน `beforeprint` ไม่ได้: หน้าเอกสาร
 * เรียก `window.print()` จากใน `useEffect` ซึ่ง `flushSync` re-render ไม่ได้ (React กำลัง commit อยู่) ใบจะพิมพ์ด้วยผลวัดเก่า/ไม่มีผลวัด
 * `beforeprint` ยังวัดซ้ำให้อีกครั้ง (กรณีกด Ctrl+P เอง) และวัดใหม่เมื่อฟอนต์โหลดเสร็จ · ก่อนวัดได้ใช้หน้าเดียวต่อกันให้เบราว์เซอร์หั่นเอง
 *
 * ข้อกำหนดของผู้เรียก: `rows[i].node` และ `blankRow()` ต้องเป็น `<tr>` **หนึ่งแถว** (วัดตามลำดับแถว) · `tableHead` เป็น `<thead>` ·
 * margin ของแต่ละส่วนไม่ทะลุกล่อง (ห่อด้วย flow-root ให้แล้ว)
 */

const PX_PER_MM = 96 / 25.4;
/** กันพลาดจากการปัดเศษ/เส้นขอบ — หน้าล้นหนึ่งบรรทัดแย่กว่าเหลือที่ว่าง 3mm มาก */
const SAFETY_MM = 3;

export interface PrintFormRow {
  key: string;
  node: ReactNode;
  /**
   * จำนวน `<tr>` ใน `node` (ค่าเริ่มต้น 1) — รายการที่กินหลายแถว (ชื่อ + spec ของใบเสนอราคา/Scope of Work) ถูกวัดและวางเป็นก้อนเดียว
   * ไม่ถูกแยกคนละหน้า · ต้องตรงกับจำนวน `<tr>` จริง ไม่งั้นการวัดของบรรทัดถัด ๆ ไปเลื่อนทั้งหมด
   */
  span?: number;
}


export function PaginatedPrintForm({
  header, firstPageHeader, tableHead, rows, blankRow, footer, pageFooter,
  tableStyle, style, className, breakAfterLast = false, marginMm = 12, pageHeightMm = 297, pageWidthMm = 210,
}: {
  /** ซ้ำทุกหน้า — ชื่อใบ เลขที่ หัวข้อมูลลูกค้า ฯลฯ */
  header: ReactNode;
  /** ต่อจาก `header` เฉพาะหน้าแรก — เช่นเช็คลิสต์ของ Scope of Work (เจ้าของ 2026-10-06: "มีไว้แค่ใบแรกก็พอ หน้าอื่นไม่ต้อง") */
  firstPageHeader?: ReactNode;
  /** `<thead>` ของตารางรายการ — ซ้ำทุกหน้า */
  tableHead: ReactNode;
  rows: PrintFormRow[];
  /** `<tr>` ว่างหนึ่งแถว (เส้นครบทุกช่อง) — ใช้เติมให้เต็มหน้า */
  blankRow: (key: string) => ReactNode;
  /** หน้าสุดท้ายเท่านั้น ต่อจากตาราง — หมายเหตุ/ช่องเซ็น */
  footer: ReactNode;
  /** ท้ายกระดาษทุกหน้า เช่นรหัสฟอร์ม */
  pageFooter?: ReactNode;
  tableStyle?: CSSProperties;
  /** ฟอนต์/สีของทั้งใบ — ใช้ทั้งตอนวัดและตอนพิมพ์ ความสูงจึงตรงกัน */
  style?: CSSProperties;
  /** class ของทั้งใบ (เช่นสีตัวอักษร Tailwind) — ใส่ทั้งกล่องวัดและกล่องพิมพ์ */
  className?: string;
  /** ขึ้นหน้าใหม่หลังหน้าสุดท้าย — เอกสารที่พิมพ์หลายชุดต่อกัน (ต้นฉบับ/สำเนา) แต่ละชุดต้องเริ่มหน้าใหม่ */
  breakAfterLast?: boolean;
  marginMm?: number;
  pageHeightMm?: number;
  pageWidthMm?: number;
}) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [, setTick] = useState(0);
  const measureRef = useRef<HTMLDivElement>(null);
  const contentWidthMm = pageWidthMm - marginMm * 2;
  const contentHeightMm = pageHeightMm - marginMm * 2;

  useEffect(() => {
    const remeasure = () => flushSync(() => setTick((t) => t + 1));
    window.addEventListener("beforeprint", remeasure);
    let alive = true;
    void document.fonts?.ready.then(() => { if (alive) setTick((t) => t + 1); });
    return () => { alive = false; window.removeEventListener("beforeprint", remeasure); };
  }, []);

  // ไม่มี deps โดยตั้งใจ — วัดหลังทุก render (ข้อมูลในใบเปลี่ยนได้ทุกครั้งที่ผู้ใช้พิมพ์) และ set เฉพาะเมื่อผลต่างจากเดิม จึงไม่วน
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const root = measureRef.current;
    const h = (sel: string) => root.querySelector<HTMLElement>(sel)?.getBoundingClientRect().height ?? 0;
    // แถวของ tbody เรียงตาม `rows` (แต่ละรายการกิน `span` แถว) แล้วตามด้วยแถวว่างตัวอย่างหนึ่งแถว
    const trs = [...root.querySelectorAll<HTMLElement>("[data-pf-table] > tbody > tr")].map((el) => el.getBoundingClientRect().height);
    let cursor = 0;
    const rowHeights = rows.map((r) => {
      const span = Math.max(1, r.span ?? 1);
      const sum = trs.slice(cursor, cursor + span).reduce((a, b) => a + b, 0);
      cursor += span;
      return sum;
    });
    const blankHeight = trs[cursor] ?? 0;
    const available = (contentHeightMm - SAFETY_MM) * PX_PER_MM - h("[data-pf-header]") - h("[data-pf-table] > thead") - h("[data-pf-pagefooter]");
    const footerHeight = h("[data-pf-footer]");
    const firstAvailable = available - h("[data-pf-first]");
    // หน้าแต่ละหน้าสูงตายตัว + overflow hidden — ถ้าช่องเซ็น (หรือบรรทัดเดียว) สูงเกินหนึ่งหน้า การจัดหน้าเองจะตัดเนื้อหาทิ้ง
    // จึงถอยไปให้เบราว์เซอร์หั่นเองแบบเดิม (ไม่สวยแต่ครบ) — เช่นใบสั่งงานที่ Out of Scope ยาวมาก
    const fits = firstAvailable > 0 && footerHeight <= available && rowHeights.every((rh) => rh <= available);
    const next = fits
      ? paginate({ available, firstAvailable, rowHeights, blankHeight: Math.max(1, blankHeight), footerHeight })
      : null;
    setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });

  const flow: CSSProperties = { display: "flow-root" };
  const table = (body: ReactNode) => (
    <table style={{ width: "100%", borderCollapse: "collapse", ...tableStyle }}>
      {tableHead}
      <tbody>{body}</tbody>
    </table>
  );

  return (
    <>
      {/* วัดบนจอ (มองไม่เห็น ไม่ถูกพิมพ์) ด้วยความกว้างเท่าพื้นที่พิมพ์จริง — อยู่ตลอด เพราะวัดหลังทุก render */}
      <div ref={measureRef} aria-hidden="true" className={`print:hidden ${className ?? ""}`}
        style={{ ...style, position: "fixed", left: "-100000px", top: 0, visibility: "hidden", width: `${contentWidthMm}mm` }}>
        <div data-pf-header="" style={flow}>{header}</div>
        <div data-pf-first="" style={flow}>{firstPageHeader}</div>
        <table data-pf-table="" style={{ width: "100%", borderCollapse: "collapse", ...tableStyle }}>
          {tableHead}
          <tbody>
            {rows.map((r) => <Fragment key={r.key}>{r.node}</Fragment>)}
            {blankRow("measure-blank")}
          </tbody>
        </table>
        <div data-pf-footer="" style={flow}>{footer}</div>
        <div data-pf-pagefooter="" style={flow}>{pageFooter}</div>
      </div>

      <div className={`hidden print:block ${className ?? ""}`} style={style}>
        <style>{`@media print { @page { size: A4 portrait; margin: 0 } }`}</style>
        {layout ? layout.pages.map((page, idx) => (
          <div key={idx} style={{
            position: "relative",
            width: `${pageWidthMm}mm`, height: `${pageHeightMm - 0.5}mm`, boxSizing: "border-box", padding: `${marginMm}mm`,
            overflow: "hidden", display: "flex", flexDirection: "column",
            breakAfter: page.last && !breakAfterLast ? "auto" : "page", pageBreakAfter: page.last && !breakAfterLast ? "auto" : "always",
          }}>
            {/* เลขหน้า (เจ้าของ 2026-10-06: "อยากมีเลขหน้าด้วย 1/2 2/2") — วางในขอบล่างของกระดาษ ไม่กินที่ของเนื้อหา จึงไม่กระทบการวัด
                เอกสารหลายชุด (ต้นฉบับ/สำเนา, ใบส่งมอบหลายงวด) นับแยกต่อชุด เพราะแต่ละชุดเป็น instance ของตัวเอง */}
            <div style={{ position: "absolute", right: `${marginMm}mm`, bottom: `${Math.max(3, marginMm / 2 - 2)}mm`, fontSize: "9px", lineHeight: 1 }}>
              {idx + 1}/{layout.pages.length}
            </div>
            <div style={flow}>{header}</div>
            {idx === 0 && firstPageHeader && <div style={flow}>{firstPageHeader}</div>}
            {table(<>
              {page.rows.map((i) => rows[i] && <Fragment key={rows[i].key}>{rows[i].node}</Fragment>)}
              {Array.from({ length: page.blanks }, (_, b) => <Fragment key={`blank-${idx}-${b}`}>{blankRow(`blank-${idx}-${b}`)}</Fragment>)}
            </>)}
            {page.last && <div style={flow}>{footer}</div>}
            <div style={{ ...flow, marginTop: "auto" }}>{pageFooter}</div>
          </div>
        )) : (
          <div style={{ padding: `${marginMm}mm`, ...(breakAfterLast ? { breakAfter: "page" as const } : {}) }}>
            <div style={flow}>{header}</div>
            {firstPageHeader && <div style={flow}>{firstPageHeader}</div>}
            {table(rows.map((r) => <Fragment key={r.key}>{r.node}</Fragment>))}
            <div style={{ ...flow, breakInside: "avoid" }}>{footer}</div>
            <div style={flow}>{pageFooter}</div>
          </div>
        )}
      </div>
    </>
  );
}
