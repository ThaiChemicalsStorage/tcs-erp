import { notificationsCollection } from "./collections.js";
import { pushStaffLineForNotifications } from "./staffLine.js";
import type { NotificationType } from "../../src/lib/notifications.js";

/**
 * ทางเดียวที่แจ้งเตือนถูกบันทึก (2026-10-08, Tuhmo #50) — บันทึกลงกระดิ่งก่อน แล้วส่ง LINE ตามไปให้ประเภทที่ต้องลงมือ
 *
 * ก่อนหน้านี้แต่ละ handler เรียก `notifications.insertMany()` เองกระจาย ~10 จุด ถ้าเติม LINE ทีละจุดจะมีจุดที่ลืมแน่นอน
 * ตอนนี้ทุกจุดเรียกตัวนี้ — แจ้งเตือนใหม่ในอนาคตได้ LINE อัตโนมัติถ้าประเภทอยู่ใน `LINE_ACTION_TYPES`
 *
 * LINE ส่งไม่ออกไม่กระทบอะไร (`pushStaffLineForNotifications` ไม่ throw) แจ้งเตือนในกระดิ่งถูกบันทึกไปแล้วเสมอ
 */
export interface NotificationInsert {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  description: string;
  module: string;
  createdAt: string;
  read: boolean;
  [related: string]: unknown;
}

export async function insertNotifications(docs: NotificationInsert[]): Promise<void> {
  if (docs.length === 0) return;
  const notifications = await notificationsCollection();
  const result = await notifications.insertMany(docs as never[]);
  await pushStaffLineForNotifications(docs.map((d, i) => ({
    id: String(result.insertedIds[i]),
    recipientUserId: d.recipientUserId,
    type: d.type,
    title: d.title,
    description: d.description,
    module: d.module,
  })));
}
