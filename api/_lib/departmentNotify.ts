import { usersCollection, notificationsCollection, rolesCollection } from "./collections.js";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import { nowIso } from "../../src/lib/products.js";
import type { NotificationType } from "../../src/lib/notifications.js";

/**
 * ส่งแจ้งเตือนถึง "ทุกคนในแผนกปลายทาง" — แยกออกมาเป็นของกลาง 2026-08-27 ตอนที่ฝ่ายโครงการขอให้
 * การอนุมัติใบเบิกส่งต่อไปสโตร์ และใบขอซื้อส่งต่อไปจัดซื้อ
 *
 * เดิมตรรกะนี้เขียนแทรกอยู่ที่เดียวใน `deliveryOrderHandler.ts` (route "ส่งถึงแผนก") ยกออกมาแทนที่จะ
 * ก๊อป เพราะจุดเปราะของมันอยู่ที่การจับคู่ ไม่ใช่การ insert — ดูหัวข้อถัดไป
 *
 * ⚠️ **การจับคู่ใช้ `User.department` ซึ่งเป็น "ข้อความ" ไม่ใช่ id** และข้อมูลจริงบนระบบนี้ยังไม่ตรงกัน:
 * TODO.md บันทึกไว้ว่าพนักงานบางคนยังเป็นค่าเก่าอย่าง `"Technic"`/`"Purchase"` ที่ไม่ตรงกับแถวไหนใน
 * ตาราง `departments` เลย ฟังก์ชันนี้จึงรับ**ชื่อได้หลายแบบต่อหนึ่งแผนก** (ทั้งชื่อไทยเต็ม ชื่อสั้น และ
 * ค่าเก่าภาษาอังกฤษ) เพื่อให้ยังส่งถึงคนที่ควรได้รับ ระหว่างที่ข้อมูลยังไม่ถูกจัดให้ตรง
 *
 * และ **คืนจำนวนผู้รับจริงกลับไปเสมอ** ให้ผู้เรียกเอาไปบอกผู้ใช้ได้ — ถ้าเป็น 0 แปลว่าไม่มีใครได้รับเลย
 * ซึ่งเป็นความล้มเหลวแบบเงียบที่แย่ที่สุดของฟีเจอร์นี้: กดอนุมัติแล้วคิดว่าส่งต่อเรียบร้อย ทั้งที่ไม่มีใครรู้
 */

/**
 * ชื่อแผนกที่ยอมรับสำหรับแต่ละปลายทาง — ตัวแรกคือชื่อที่ถูกต้องตามตาราง `departments` ที่ระบบ seed มา
 * (`api/_lib/systemSeed.ts`) ที่เหลือคือค่าที่พบได้จริงในข้อมูลเก่า เก็บไว้ที่นี่ที่เดียวจะได้ไล่แก้ง่าย
 * เมื่อวันหนึ่งข้อมูลพนักงานถูกจัดให้ตรงกับตารางจริงทั้งหมดแล้ว
 */
export const STORE_DEPARTMENT_NAMES = ["ฝ่ายคลังสินค้า", "คลังสินค้า", "สโตร์", "Store", "Stores"];
export const PURCHASING_DEPARTMENT_NAMES = ["ฝ่ายจัดซื้อ", "จัดซื้อ", "Purchase", "Purchasing"];

export interface DepartmentNotification {
  type: NotificationType;
  title: string;
  description: string;
  module: string;
  /** ฟิลด์ deep-link ของเอกสารนั้น ๆ เช่น `{ relatedMaterialRequisitionId: "MR-2569-0001" }` */
  related: Record<string, string>;
}

/**
 * ส่งแจ้งเตือนถึงพนักงาน active ทุกคนที่แผนกตรงกับชื่อใน `departmentNames`
 * ไม่ส่งถึงตัวผู้กระทำเอง (คนกดอนุมัติไม่ต้องได้แจ้งเตือนจากการกดของตัวเอง)
 *
 * @returns จำนวนคนที่ได้รับจริง — ผู้เรียกควรส่งค่านี้กลับไปให้ UI
 */
export async function notifyDepartments(
  departmentNames: string[],
  actingUserId: string,
  notification: DepartmentNotification,
): Promise<number> {
  const users = await usersCollection();
  const recipients = await users
    .find({ department: { $in: departmentNames }, status: "active" }, { projection: { _id: 1 } })
    .toArray();
  const recipientIds = recipients.map((u) => u._id.toString()).filter((uid) => uid !== actingUserId);
  if (recipientIds.length === 0) return 0;

  const createdAt = nowIso();
  const notifications = await notificationsCollection();
  await notifications.insertMany(recipientIds.map((recipientUserId) => ({
    recipientUserId,
    type: notification.type,
    title: notification.title,
    description: notification.description,
    module: notification.module,
    ...notification.related,
    createdAt,
    read: false,
  })));
  return recipientIds.length;
}

/**
 * พนักงาน active ทุกคนที่บทบาทมีสิทธิ์ที่ระบุ — ใช้หาผู้อนุมัติ
 *
 * ยกมาไว้ที่กลาง 2026-08-31 ตอนทำแจ้งเตือน "รออนุมัติ" ของเอกสาร 6 ใบบนเครื่องอนุมัติร่วม ก่อนหน้านั้น
 * ฟังก์ชันตัวนี้ถูก**ก๊อปไว้ 3 ไฟล์แบบตัวต่อตัว** (`scopeOfWorkHandler`, `deliveryOrderHandler`,
 * `serviceReportHandler`) และไม่มีตัวไหน export — การเพิ่มที่ใช้ที่ 4 จึงเป็นจังหวะที่ควรยุบ ไม่ใช่ก๊อปอีก
 *
 * **โหลดบทบาททั้งตารางมากรองในหน่วยความจำโดยตั้งใจ** — สิทธิ์เก็บเป็น array ในเอกสารบทบาท ไม่ใช่แถวต่อสิทธิ์
 * จึงเขียนเป็น query ไม่ได้ตรง ๆ และตารางบทบาทมีไม่กี่สิบแถว
 */
export async function activeUserIdsWithPermission(permission: Permission): Promise<string[]> {
  const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
  const [activeUsers, roleList] = await Promise.all([
    users.find({ status: "active" }, { projection: { roleKey: 1 } }).toArray(),
    roles.find({}).toArray(),
  ]);
  return activeUsers
    .filter((u) => roleHasPermission(findRole(roleList, u.roleKey), permission))
    .map((u) => u._id.toString());
}

/**
 * ส่งแจ้งเตือนถึงผู้ใช้ตาม id ที่ระบุ — คู่กับ `notifyDepartments` แต่เลือกผู้รับจาก**สิทธิ์** ไม่ใช่แผนก
 * ไม่ส่งถึงตัวผู้กระทำเอง และตัด id ซ้ำออก
 *
 * @returns จำนวนคนที่ได้รับจริง — 0 แปลว่าไม่มีใครได้รับเลย ซึ่งผู้เรียกควรเขียน log ไว้
 */
export async function notifyUsers(
  recipientUserIds: string[],
  actingUserId: string,
  notification: DepartmentNotification,
): Promise<number> {
  const recipients = [...new Set(recipientUserIds)].filter((uid) => uid && uid !== actingUserId);
  if (recipients.length === 0) return 0;

  const createdAt = nowIso();
  const notifications = await notificationsCollection();
  await notifications.insertMany(recipients.map((recipientUserId) => ({
    recipientUserId,
    type: notification.type,
    title: notification.title,
    description: notification.description,
    module: notification.module,
    ...notification.related,
    createdAt,
    read: false,
  })));
  return recipients.length;
}

/** ส่งแจ้งเตือนถึงคนเดียว เช่น แจ้งกลับผู้ขอเพิ่มสินค้าว่าสโตร์ตั้งรหัสให้แล้ว */
export async function notifyUser(
  recipientUserId: string,
  actingUserId: string,
  notification: DepartmentNotification,
): Promise<number> {
  if (!recipientUserId || recipientUserId === actingUserId) return 0;
  const notifications = await notificationsCollection();
  await notifications.insertOne({
    recipientUserId,
    type: notification.type,
    title: notification.title,
    description: notification.description,
    module: notification.module,
    ...notification.related,
    createdAt: nowIso(),
    read: false,
  });
  return 1;
}
