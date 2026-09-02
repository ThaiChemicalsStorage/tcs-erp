import { useUserDirectory } from "../lib/userDirectory";
import { printDateOrBlank } from "../lib/printFormat";

/**
 * ช่องลายเซ็นบนใบพิมพ์ — เพิ่ม 2026-09-02 ตามคำสั่งเจ้าของ *"ทำให้คนที่สร้างเอกสารไหนก็ตามให้ขึ้น
 * ลายเซ็นเป็นคนสร้าง ละก็ใครที่เป็นคนในการกดอนุมัติให้ขึ้นลายเซ็นเป็นคนนั้น"*
 *
 * เดิมมีแค่ 3 ใบ (ใบเสนอราคา / Scope of Work / รายงานเซอร์วิส) ที่วางรูปลายเซ็นจริงลงบนกระดาษ อีก 9 ใบ
 * พิมพ์เส้นว่างกับชื่อที่เป็นตัวอักษรเท่านั้น คอมโพเนนต์นี้คือรูปแบบเดียวที่ทุกใบใช้ร่วมกัน
 *
 * **รูปมาจากโปรไฟล์ผู้ใช้ ไม่ได้เก็บลงในตัวเอกสาร** — จงใจ เพราะเป็นแบบที่ใบเสนอราคาใช้อยู่ก่อนแล้ว
 * และเพราะลายเซ็นที่ฝังลงเอกสารตอนกดอนุมัติจะกลายเป็นสำเนาที่แก้ไม่ได้เมื่อเจ้าตัวเปลี่ยนลายเซ็น
 * ผลข้างเคียงที่ยอมรับ: ถ้าเจ้าตัวลบลายเซ็นในโปรไฟล์ ใบเก่าก็จะไม่มีรูปอีกต่อไป (ชื่อยังอยู่ครบ)
 *
 * ผู้ใช้ที่ยังไม่เคยอัปโหลดลายเซ็นจะได้เส้นว่างเหมือนเดิม ไม่ใช่ช่องพัง — เส้นนั้นเซ็นด้วยปากกาได้
 */
export function PrintSignatureLine({ userId, height = 32 }: {
  /** id ผู้ใช้เจ้าของลายเซ็น (`createdBy` / `approvedByUserId` ของเอกสาร) */
  userId: string | null | undefined;
  /** ความสูงของพื้นที่เหนือเส้น หน่วย px — ปรับตามความหนาแน่นของแต่ละฟอร์ม */
  height?: number;
}) {
  const { byId } = useUserDirectory();
  const dataUrl = byId(userId)?.signatureDataUrl ?? "";
  return (
    <div
      style={{ height: `${height}px`, display: "flex", alignItems: "flex-end", justifyContent: "center", overflow: "hidden" }}
    >
      {dataUrl
        ? <img src={dataUrl} alt="" style={{ maxHeight: `${height - 2}px`, maxWidth: "80%", objectFit: "contain" }} />
        : null}
    </div>
  );
}

/**
 * ช่องลายเซ็นเต็มรูปแบบ: รูป → เส้น → ป้ายกำกับกับชื่อ → วันที่
 *
 * ชื่อที่พิมพ์ใช้ `name` ที่เอกสารเก็บไว้เป็นหลัก (เป็นช่องข้อความที่เจ้าหน้าที่แก้เองได้) แล้วค่อยถอย
 * ไปใช้ชื่อเต็มของเจ้าของลายเซ็น — ตรงกับที่ `handleApprove()` ฝั่งเซิร์ฟเวอร์ทำอยู่ คือไม่ทับชื่อที่
 * พิมพ์ไว้เอง วันที่ที่ว่างพิมพ์เป็นเส้นประให้เขียนมือ ไม่ใช่ขีดกลาง เพราะเป็นช่องที่ตั้งใจเว้นไว้
 */
export function PrintSignatureBox({ label, userId, name, date, height = 32 }: {
  label: string;
  userId: string | null | undefined;
  name?: string;
  date?: string;
  height?: number;
}) {
  const { byId } = useUserDirectory();
  const printedName = (name ?? "").trim() || byId(userId)?.fullName || "";
  const printedDate = printDateOrBlank(date);
  return (
    <div style={{ textAlign: "center" }}>
      <PrintSignatureLine userId={userId} height={height} />
      <div style={{ borderTop: "1px solid #000", marginTop: "2px", paddingTop: "2px" }}>
        <p>{label}{printedName ? `: ${printedName}` : ""}</p>
        <p>วันที่: {printedDate || "....... / ....... / ......."}</p>
      </div>
    </div>
  );
}
