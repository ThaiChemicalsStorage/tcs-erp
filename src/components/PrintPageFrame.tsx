/**
 * กรอบระยะขอบกระดาษของใบพิมพ์ — ใช้แทน `@page { margin: 12mm }`
 *
 * **ทำไมต้องมี:** URL/วันที่/ชื่อหน้าที่โผล่มุมกระดาษตอนกดพิมพ์ (เช่น `192.168.1.129:3000/#purchaseOrder`)
 * ไม่ได้มาจากแอป เป็นหัว/ท้ายกระดาษที่เบราว์เซอร์วาดลงใน **ขอบของ `@page`** เอง ปิดไม่ได้จาก CSS
 * ทางเดียวที่ทำให้หายคือ `@page { margin: 0 }` แล้วชดเชยระยะขอบกระดาษด้วยวิธีอื่น (พิสูจน์แล้วที่
 * `src/pages/quotation/PrintDocument.tsx:88-92` เจ้าของสั่งให้ทำกับใบที่เหลือทุกใบ 2026-09-18)
 *
 * **ทำไมต้องเป็นตาราง ไม่ใช่ `padding` เฉย ๆ:** `padding` ของกล่องเดียวให้ขอบบนเฉพาะหน้าแรกและขอบล่าง
 * เฉพาะหน้าสุดท้าย เอกสารที่ยาวเกินหนึ่งหน้า (ใบสั่งซื้อรายการเยอะ การ์ดสต๊อก) หน้าที่ 2 เป็นต้นไปจะมี
 * เนื้อหาชนขอบกระดาษแล้วโดนเครื่องพิมพ์ตัดทิ้ง · เบราว์เซอร์พิมพ์ `<thead>`/`<tfoot>` ซ้ำทุกหน้า
 * แถวเปล่าสูง 12mm ในนั้นจึงเป็นขอบบน-ล่างที่ได้ครบทุกหน้า ส่วนซ้าย-ขวาใช้ `padding` ของ `<div>` ได้
 * เพราะ padding แนวนอนติดไปกับทุกชิ้นส่วนที่ถูกหั่นข้ามหน้าอยู่แล้ว
 *
 * ⚠️ `padding` ต้องอยู่บน `<div>` **ไม่ใช่บน `<table>`** — สเปกสั่งให้ทิ้ง padding ของตารางที่
 * `border-collapse: collapse` (CSS 2.2 §17.6.2) เคยพลาดมาแล้วจนใบพิมพ์ออกมาไม่มีขอบ
 */
export function PrintPageFrame({
  children,
  size = "A4 portrait",
  margin = "12mm",
}: {
  children: React.ReactNode;
  /** ค่าของ `@page { size }` เช่น `"A4 landscape"` สำหรับใบที่วางแนวนอน */
  size?: string;
  margin?: string;
}) {
  const spacer: React.CSSProperties = { padding: 0, border: "none" };
  return (
    <>
      <style>{`@media print { @page { size: ${size}; margin: 0 } }`}</style>
      <div style={{ paddingLeft: margin, paddingRight: margin }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <td style={spacer}><div style={{ height: margin }} /></td>
            </tr>
          </thead>
          <tfoot>
            <tr>
              <td style={spacer}><div style={{ height: margin }} /></td>
            </tr>
          </tfoot>
          <tbody>
            <tr>
              <td style={spacer}>{children}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
