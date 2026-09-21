import type { TranslationKey } from "./i18n";

export type Permission =
  | "dashboard:view"
  | "dashboard:tabOverview"
  | "dashboard:tabSales"
  | "dashboard:tabService"
  | "dashboard:tabPurchasing"
  | "dashboard:tabInventory"
  | "dashboard:tabProduction"
  | "dashboard:tabProject"
  | "dashboard:tabBd"
  | "dashboard:tabAccounting"
  | "quotations:view"
  | "quotations:viewAll"
  | "quotations:viewTeam"
  | "quotations:viewDepartment"
  | "quotations:create"
  | "quotations:edit"
  | "quotations:delete"
  | "quotations:approve"
  | "quotations:reject"
  | "quotations:export"
  | "products:view"
  | "products:create"
  | "products:edit"
  | "products:delete"
  | "products:export"
  | "users:manage"
  | "roles:manage"
  | "company:manage"
  | "departments:manage"
  | "teams:manage"
  | "auditLog:view"
  | "customers:view"
  | "customers:create"
  | "customers:edit"
  | "customers:archive"
  | "quotationTemplates:manage"
  | "quotationTemplates:view"
  | "quotationTemplates:create"
  | "quotationTemplates:edit"
  | "quotationTemplates:duplicate"
  | "quotationTemplates:activate"
  | "quotationTemplates:archive"
  | "quotationTemplates:import"
  | "scopeOfWork:view"
  | "scopeOfWork:viewAll"
  | "scopeOfWork:viewTeam"
  | "scopeOfWork:viewDepartment"
  | "scopeOfWork:create"
  | "scopeOfWork:edit"
  | "scopeOfWork:finalize"
  | "scopeOfWork:print"
  | "scopeOfWork:delete"
  | "scopeOfWork:chasePo"
  | "deliveryOrder:view"
  | "deliveryOrder:viewAll"
  | "deliveryOrder:viewTeam"
  | "deliveryOrder:viewDepartment"
  | "deliveryOrder:create"
  | "deliveryOrder:edit"
  | "deliveryOrder:finalize"
  | "deliveryOrder:print"
  | "deliveryOrder:delete"
  | "service:view"
  | "service:viewAll"
  | "service:create"
  | "service:edit"
  | "service:delete"
  | "service:complete"
  | "service:print"
  | "serviceTemplates:view"
  | "serviceTemplates:create"
  | "serviceTemplates:edit"
  | "serviceTemplates:archive"
  | "ar:view"
  | "ar:create"
  | "ar:issue"
  | "ar:cancel"
  | "stock:view"
  | "stock:adjust"
  // คำขอเพิ่มสินค้า (2026-08-27) — แผนกอื่นขอเพิ่มสินค้าได้ แต่ "ตั้งรหัสไม่ได้"
  // การตั้งรหัสผูกกับ :review ซึ่งเป็นสิทธิ์ของสโตร์ ไม่ใช่ :create ที่ทุกแผนกมีได้
  | "productRequest:view"
  | "productRequest:viewAll"
  | "productRequest:create"
  | "productRequest:review"
  | "project:view"
  | "project:viewAll"
  | "project:create"
  | "project:edit"
  | "project:finalize"
  | "project:print"
  | "project:delete"
  | "materialRequisition:view"
  | "materialRequisition:viewAll"
  | "materialRequisition:create"
  | "materialRequisition:edit"
  | "materialRequisition:finalize"
  | "materialRequisition:print"
  | "materialRequisition:delete"
  | "jobOrder:view"
  | "jobOrder:viewAll"
  | "jobOrder:create"
  | "jobOrder:edit"
  | "jobOrder:finalize"
  | "jobOrder:print"
  | "jobOrder:delete"
  | "purchaseRequest:view"
  | "purchaseRequest:viewAll"
  | "purchaseRequest:create"
  | "purchaseRequest:edit"
  | "purchaseRequest:editApproved"
  | "purchaseRequest:finalize"
  | "purchaseRequest:print"
  | "purchaseRequest:delete"
  | "productionOrder:view"
  | "productionOrder:viewAll"
  | "productionOrder:create"
  | "productionOrder:edit"
  | "productionOrder:finalize"
  | "productionOrder:print"
  | "productionOrder:delete"
  | "purchaseOrder:view"
  | "purchaseOrder:viewAll"
  | "purchaseOrder:create"
  | "purchaseOrder:edit"
  | "purchaseOrder:finalize"
  | "purchaseOrder:print"
  | "purchaseOrder:delete"
  // ใบรับสินค้า (2026-09-03) — ของแผนกสโตร์ `:receive` แยกจาก `:edit` เพราะการบันทึกรับของ
  // เขียนสต๊อกและตั้งหนี้จริง ต่างจากการแก้เลขที่/หมายเหตุบนหัวใบ
  | "receivingReport:view"
  | "receivingReport:viewAll"
  | "receivingReport:create"
  | "receivingReport:edit"
  | "receivingReport:receive"
  | "receivingReport:print"
  | "receivingReport:delete"
  // ทะเบียนเจ้าหนี้ / ภาษีซื้อ (2026-09-03) — ฝั่งบัญชี อ่านจากหนี้ที่ใบรับสินค้าตั้งไว้
  | "ap:view"
  | "ap:manage"
  | "costControl:view"
  | "costControl:viewAll"
  | "costControl:create"
  | "costControl:edit"
  | "costControl:finalize"
  | "costControl:print"
  | "costControl:delete"
  // ทะเบียนผู้ขาย (2026-08-31) — ข้อมูลหลักของฝ่ายจัดซื้อ ไม่ใช่เอกสาร จึงมีแค่ 4 สิทธิ์
  // แบบเดียวกับ customers:* ไม่ใช่ 7 สิทธิ์แบบเอกสารที่มี finalize/print
  | "vendor:view"
  | "vendor:create"
  | "vendor:edit"
  | "vendor:archive"
  /**
   * อนุมัติผู้ขายในทะเบียน (2026-09-21) — เจ้าของสั่งว่าจัดซื้อกรอกข้อมูลแล้วต้อง "นำส่งข้อมูลไปที่บัญชี
   * ให้บัญชีอนุมัติก่อนเปิด PO สั่งซื้อ" · เป็นสิทธิ์ของ**ฝ่ายบัญชี** ไม่ใช่จัดซื้อ จึงต้องแยกจาก
   * `vendor:edit` · **ห้ามเอา `ap:manage` มาใช้แทน** มันแปลว่า "บันทึกการจ่ายเงิน" คนละเรื่องกัน
   */
  | "vendor:approve"
  // ทะเบียนรหัสแผนก/บัญชีสำหรับใบ PR/PO (2026-08-31) — ข้อมูลหลักเหมือนทะเบียนผู้ขาย 4 สิทธิ์
  | "codeRegister:view"
  | "codeRegister:create"
  | "codeRegister:edit"
  | "codeRegister:archive";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard:view",
  "dashboard:tabOverview",
  "dashboard:tabSales",
  "dashboard:tabService",
  "dashboard:tabPurchasing",
  "dashboard:tabInventory",
  "dashboard:tabProduction",
  "dashboard:tabProject",
  "dashboard:tabBd",
  "dashboard:tabAccounting",
  "quotations:view",
  "quotations:viewAll",
  "quotations:viewTeam",
  "quotations:viewDepartment",
  "quotations:create",
  "quotations:edit",
  "quotations:delete",
  "quotations:approve",
  "quotations:reject",
  "quotations:export",
  "products:view",
  "products:create",
  "products:edit",
  "products:delete",
  "products:export",
  "users:manage",
  "roles:manage",
  "company:manage",
  "departments:manage",
  "teams:manage",
  "auditLog:view",
  "customers:view",
  "customers:create",
  "customers:edit",
  "customers:archive",
  "quotationTemplates:manage",
  "quotationTemplates:view",
  "quotationTemplates:create",
  "quotationTemplates:edit",
  "quotationTemplates:duplicate",
  "quotationTemplates:activate",
  "quotationTemplates:archive",
  "quotationTemplates:import",
  "scopeOfWork:view",
  "scopeOfWork:viewAll",
  "scopeOfWork:viewTeam",
  "scopeOfWork:viewDepartment",
  "scopeOfWork:create",
  "scopeOfWork:edit",
  "scopeOfWork:finalize",
  "scopeOfWork:print",
  "scopeOfWork:delete",
  "scopeOfWork:chasePo",
  "deliveryOrder:view",
  "deliveryOrder:viewAll",
  "deliveryOrder:viewTeam",
  "deliveryOrder:viewDepartment",
  "deliveryOrder:create",
  "deliveryOrder:edit",
  "deliveryOrder:finalize",
  "deliveryOrder:print",
  "deliveryOrder:delete",
  "service:view",
  "service:viewAll",
  "service:create",
  "service:edit",
  "service:delete",
  "service:complete",
  "service:print",
  "serviceTemplates:view",
  "serviceTemplates:create",
  "serviceTemplates:edit",
  "serviceTemplates:archive",
  "ar:view",
  "ar:create",
  "ar:issue",
  "ar:cancel",
  "stock:view",
  "stock:adjust",
  "productRequest:view",
  "productRequest:viewAll",
  "productRequest:create",
  "productRequest:review",
  "project:view",
  "project:viewAll",
  "project:create",
  "project:edit",
  "project:finalize",
  "project:print",
  "project:delete",
  "materialRequisition:view",
  "materialRequisition:viewAll",
  "materialRequisition:create",
  "materialRequisition:edit",
  "materialRequisition:finalize",
  "materialRequisition:print",
  "materialRequisition:delete",
  "jobOrder:view",
  "jobOrder:viewAll",
  "jobOrder:create",
  "jobOrder:edit",
  "jobOrder:finalize",
  "jobOrder:print",
  "jobOrder:delete",
  "purchaseRequest:view",
  "purchaseRequest:viewAll",
  "purchaseRequest:create",
  "purchaseRequest:edit",
  "purchaseRequest:editApproved",
  "purchaseRequest:finalize",
  "purchaseRequest:print",
  "purchaseRequest:delete",
  "productionOrder:view",
  "productionOrder:viewAll",
  "productionOrder:create",
  "productionOrder:edit",
  "productionOrder:finalize",
  "productionOrder:print",
  "productionOrder:delete",
  "purchaseOrder:view",
  "purchaseOrder:viewAll",
  "purchaseOrder:create",
  "purchaseOrder:edit",
  "purchaseOrder:finalize",
  "purchaseOrder:print",
  "purchaseOrder:delete",
  "receivingReport:view",
  "receivingReport:viewAll",
  "receivingReport:create",
  "receivingReport:edit",
  "receivingReport:receive",
  "receivingReport:print",
  "receivingReport:delete",
  "ap:view",
  "ap:manage",
  "costControl:view",
  "costControl:viewAll",
  "costControl:create",
  "costControl:edit",
  "costControl:finalize",
  "costControl:print",
  "costControl:delete",
  "vendor:view",
  "vendor:create",
  "vendor:edit",
  "vendor:archive",
  "vendor:approve",
  "codeRegister:view",
  "codeRegister:create",
  "codeRegister:edit",
  "codeRegister:archive",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "dashboard:view": "ดูแดชบอร์ด",
  "dashboard:tabOverview": "แดชบอร์ด: แท็บภาพรวม",
  "dashboard:tabSales": "แดชบอร์ด: แท็บขาย (ต้องดูใบเสนอราคาได้ด้วย)",
  "dashboard:tabService": "แดชบอร์ด: แท็บบริการ (ต้องดูรายงานบริการได้ด้วย)",
  "dashboard:tabPurchasing": "แดชบอร์ด: แท็บจัดซื้อ (ต้องดูใบสั่งซื้อหรือใบขอซื้อได้ด้วย)",
  "dashboard:tabInventory": "แดชบอร์ด: แท็บคลังสินค้า (ต้องดูสต๊อก ใบรับสินค้า หรือคำขอเพิ่มสินค้าได้ด้วย)",
  "dashboard:tabProduction": "แดชบอร์ด: ส่วนผลิต (ต้องดูใบสั่งผลิตได้ด้วย)",
  "dashboard:tabProject": "แดชบอร์ด: ส่วนโครงการ (ต้องดูใบสั่งงานหรือโครงการได้ด้วย)",
  "dashboard:tabBd": "แดชบอร์ด: ส่วน BD (ต้องดู Cost Control ได้ด้วย)",
  "dashboard:tabAccounting": "แดชบอร์ด: แท็บบัญชี (ต้องดูเอกสารลูกหนี้หรือเจ้าหนี้ได้ด้วย)",
  "quotations:view": "ดูใบเสนอราคา",
  "quotations:viewAll": "ดูใบเสนอราคาของผู้อื่น",
  "quotations:viewTeam": "ดูใบเสนอราคาของทีมตัวเอง",
  "quotations:viewDepartment": "ดูใบเสนอราคาของแผนกตัวเอง",
  "quotations:create": "สร้างใบเสนอราคา",
  "quotations:edit": "แก้ไขใบเสนอราคา",
  "quotations:delete": "ลบ/ยกเลิกใบเสนอราคา",
  "quotations:approve": "อนุมัติใบเสนอราคา",
  "quotations:reject": "ปฏิเสธใบเสนอราคา",
  "quotations:export": "ส่งออกใบเสนอราคา (พิมพ์/PDF)",
  "products:view": "ดูคลังสินค้า",
  "products:create": "เพิ่มสินค้า",
  "products:edit": "แก้ไขสินค้า",
  "products:delete": "ลบ/เก็บถาวรสินค้า",
  "products:export": "ส่งออกข้อมูลสินค้า",
  "users:manage": "จัดการผู้ใช้งาน",
  "roles:manage": "จัดการบทบาทและสิทธิ์",
  "company:manage": "จัดการข้อมูลบริษัท",
  "departments:manage": "จัดการแผนก",
  "teams:manage": "จัดการทีม",
  "auditLog:view": "ดูบันทึกการใช้งาน (Audit Log)",
  "customers:view": "ดูข้อมูลลูกค้า",
  "customers:create": "เพิ่มข้อมูลลูกค้า",
  "customers:edit": "แก้ไขข้อมูลลูกค้า",
  "customers:archive": "เก็บถาวร/กู้คืนข้อมูลลูกค้า",
  "quotationTemplates:manage": "จัดการ Template ใบเสนอราคา (สิทธิ์เต็มรูปแบบ — ครอบคลุมทุกสิทธิ์ย่อยด้านล่าง)",
  "quotationTemplates:view": "เข้าถึงหน้าจัดการ Template ใบเสนอราคา",
  "quotationTemplates:create": "สร้าง Template ใบเสนอราคาใหม่",
  "quotationTemplates:edit": "แก้ไขเนื้อหา Template ใบเสนอราคา",
  "quotationTemplates:duplicate": "ทำสำเนา Template ใบเสนอราคา",
  "quotationTemplates:activate": "เปิด/ปิดใช้งาน Template ใบเสนอราคา",
  "quotationTemplates:archive": "เก็บถาวร/กู้คืน Template ใบเสนอราคา",
  "quotationTemplates:import": "นำเข้า Template จากไฟล์ Excel",
  "scopeOfWork:view": "ดู Scope of Work",
  "scopeOfWork:viewAll": "ดู Scope of Work ของผู้อื่น",
  "scopeOfWork:viewTeam": "ดู Scope of Work ของทีมตัวเอง",
  "scopeOfWork:viewDepartment": "ดู Scope of Work ของแผนกตัวเอง",
  "scopeOfWork:create": "สร้าง Scope of Work",
  "scopeOfWork:edit": "แก้ไขและบันทึก Scope of Work",
  "scopeOfWork:finalize": "อนุมัติ / ไม่อนุมัติ Scope of Work",
  "scopeOfWork:print": "พิมพ์ / ส่งออก Scope of Work",
  "scopeOfWork:delete": "ลบ Scope of Work",
  "scopeOfWork:chasePo": "ทวงเลข PO (ส่งแจ้งเตือนถึงพนักงานขาย)",
  "deliveryOrder:view": "ดูใบส่งมอบสินค้า",
  "deliveryOrder:viewAll": "ดูใบส่งมอบสินค้าของผู้อื่น",
  "deliveryOrder:viewTeam": "ดูใบส่งมอบสินค้าของทีมตัวเอง",
  "deliveryOrder:viewDepartment": "ดูใบส่งมอบสินค้าของแผนกตัวเอง",
  "deliveryOrder:create": "สร้างใบส่งมอบสินค้า",
  "deliveryOrder:edit": "แก้ไขและบันทึกใบส่งมอบสินค้า",
  "deliveryOrder:finalize": "อนุมัติ / ไม่อนุมัติใบส่งมอบสินค้า",
  "deliveryOrder:print": "พิมพ์ / ส่งออกใบส่งมอบสินค้า",
  "deliveryOrder:delete": "ลบใบส่งมอบสินค้า",
  "service:view": "ดูรายงานบริการ",
  "service:viewAll": "ดูรายงานบริการของผู้อื่น",
  "service:create": "สร้างรายงานบริการ",
  "service:edit": "แก้ไขรายงานบริการ",
  "service:delete": "ลบรายงานบริการ",
  "service:complete": "ยืนยันสถานะเสร็จสิ้นของรายงานบริการ",
  "service:print": "พิมพ์ / ส่งออกรายงานบริการ",
  "serviceTemplates:view": "เข้าถึงหน้าจัดการ Template รายงานบริการ",
  "serviceTemplates:create": "สร้าง Template รายงานบริการใหม่",
  "serviceTemplates:edit": "แก้ไข Template รายงานบริการ",
  "serviceTemplates:archive": "เก็บถาวร/กู้คืน Template รายงานบริการ",
  "ar:view": "ดูข้อมูลบัญชีลูกหนี้ (งวดบิล/เอกสาร)",
  "ar:create": "จัดการ checklist และแนบเอกสารงวดบิล",
  "ar:issue": "ออกเอกสาร AR / ใบกำกับภาษี / ใบวางบิล",
  "ar:cancel": "ยกเลิกเอกสารบัญชีลูกหนี้",
  "stock:view": "ดูสต๊อกสินค้าและประวัติการปรับสต๊อก",
  "stock:adjust": "รับเข้า/ตัดออก/ปรับยอดสต๊อกสินค้า",
  "productRequest:view": "ดูคำขอเพิ่มสินค้า",
  "productRequest:viewAll": "ดูคำขอเพิ่มสินค้าของผู้อื่น",
  "productRequest:create": "ขอเพิ่มสินค้าใหม่ (ตั้งรหัสสินค้าเองไม่ได้)",
  "productRequest:review": "อนุมัติคำขอและตั้งรหัสสินค้า (สโตร์)",
  "project:view": "ดูโครงการ",
  "project:viewAll": "ดูโครงการของผู้อื่น",
  "project:create": "สร้างโครงการ",
  "project:edit": "แก้ไขและบันทึกโครงการ (แบ่งรายการเข้าสาขาการจัดหา)",
  "project:finalize": "อนุมัติ / ไม่อนุมัติโครงการ",
  "project:print": "พิมพ์ / ส่งออกโครงการ",
  "project:delete": "ลบโครงการ",
  "materialRequisition:view": "ดูใบเบิกและใบคืนวัสดุ",
  "materialRequisition:viewAll": "ดูใบเบิกและใบคืนวัสดุของผู้อื่น",
  "materialRequisition:create": "สร้างใบเบิกและใบคืนวัสดุ",
  "materialRequisition:edit": "แก้ไขและบันทึกใบเบิกและใบคืนวัสดุ",
  "materialRequisition:finalize": "อนุมัติ / ไม่อนุมัติใบเบิกและใบคืนวัสดุ",
  "materialRequisition:print": "พิมพ์ / ส่งออกใบเบิกและใบคืนวัสดุ",
  "materialRequisition:delete": "ลบใบเบิกและใบคืนวัสดุ",
  "jobOrder:view": "ดูใบสั่งงาน",
  "jobOrder:viewAll": "ดูใบสั่งงานของผู้อื่น",
  "jobOrder:create": "สร้างใบสั่งงาน",
  "jobOrder:edit": "แก้ไขและบันทึกใบสั่งงาน",
  "jobOrder:finalize": "อนุมัติ / ไม่อนุมัติใบสั่งงาน",
  "jobOrder:print": "พิมพ์ / ส่งออกใบสั่งงาน",
  "jobOrder:delete": "ลบใบสั่งงาน",
  "purchaseRequest:view": "ดูใบขอซื้อ",
  "purchaseRequest:viewAll": "ดูใบขอซื้อของผู้อื่น",
  "purchaseRequest:create": "สร้างใบขอซื้อ",
  "purchaseRequest:edit": "แก้ไขและบันทึกใบขอซื้อ",
  "purchaseRequest:editApproved": "แก้ไขใบขอซื้อที่อนุมัติแล้ว (ฝ่ายจัดซื้อ)",
  "purchaseRequest:finalize": "อนุมัติ / ไม่อนุมัติใบขอซื้อ",
  "purchaseRequest:print": "พิมพ์ / ส่งออกใบขอซื้อ",
  "purchaseRequest:delete": "ลบใบขอซื้อ",
  "productionOrder:view": "ดูใบสั่งผลิต",
  "productionOrder:viewAll": "ดูใบสั่งผลิตของผู้อื่น",
  "productionOrder:create": "สร้างใบสั่งผลิต",
  "productionOrder:edit": "แก้ไขและบันทึกใบสั่งผลิต",
  "productionOrder:finalize": "อนุมัติ / ไม่อนุมัติใบสั่งผลิต",
  "productionOrder:print": "พิมพ์ / ส่งออกใบสั่งผลิต",
  "productionOrder:delete": "ลบใบสั่งผลิต",
  "purchaseOrder:view": "ดูใบสั่งซื้อ",
  "purchaseOrder:viewAll": "ดูใบสั่งซื้อของผู้อื่น",
  "purchaseOrder:create": "สร้างใบสั่งซื้อ",
  "purchaseOrder:edit": "แก้ไขและบันทึกใบสั่งซื้อ",
  "purchaseOrder:finalize": "อนุมัติ / ไม่อนุมัติใบสั่งซื้อ",
  "purchaseOrder:print": "พิมพ์ / ส่งออกใบสั่งซื้อ",
  "purchaseOrder:delete": "ลบใบสั่งซื้อ",
  "receivingReport:view": "ดูใบรับสินค้า",
  "receivingReport:viewAll": "ดูใบรับสินค้าของผู้อื่น",
  "receivingReport:create": "สร้างใบรับสินค้าจากใบสั่งซื้อ",
  "receivingReport:edit": "แก้ไขหัวใบรับสินค้า",
  "receivingReport:receive": "บันทึกรับของ / ยกเลิกรอบการรับ (เขียนสต๊อกและตั้งหนี้)",
  "receivingReport:print": "พิมพ์ / ส่งออกใบรับสินค้า",
  "receivingReport:delete": "ลบใบรับสินค้า",
  "ap:view": "ดูทะเบียนเจ้าหนี้และทะเบียนภาษีซื้อ",
  "ap:manage": "บันทึกการจ่ายเงินในทะเบียนเจ้าหนี้",
  "costControl:view": "ดู Cost Control",
  "costControl:viewAll": "ดู Cost Control ของผู้อื่น",
  "costControl:create": "สร้าง Cost Control",
  "costControl:edit": "แก้ไขและบันทึก Cost Control",
  "costControl:finalize": "อนุมัติ / ไม่อนุมัติ Cost Control",
  "costControl:print": "พิมพ์ / ส่งออก Cost Control",
  "costControl:delete": "ลบ Cost Control",
  "vendor:view": "ดูทะเบียนผู้ขาย",
  "vendor:create": "เพิ่มผู้ขาย",
  "vendor:edit": "แก้ไขผู้ขาย",
  "vendor:archive": "เก็บถาวร/กู้คืนผู้ขาย",
  "vendor:approve": "อนุมัติผู้ขายในทะเบียน (บัญชี)",
  "codeRegister:view": "ดูทะเบียนรหัส",
  "codeRegister:create": "เพิ่มรหัส",
  "codeRegister:edit": "แก้ไขรหัส",
  "codeRegister:archive": "เก็บถาวร/กู้คืนรหัส",
};

export const PERMISSION_LABEL_KEY: Record<Permission, TranslationKey> = {
  "dashboard:view": "permission.dashboardView",
  "dashboard:tabOverview": "permission.dashboardTabOverview",
  "dashboard:tabSales": "permission.dashboardTabSales",
  "dashboard:tabService": "permission.dashboardTabService",
  "dashboard:tabPurchasing": "permission.dashboardTabPurchasing",
  "dashboard:tabInventory": "permission.dashboardTabInventory",
  "dashboard:tabProduction": "permission.dashboardTabProduction",
  "dashboard:tabProject": "permission.dashboardTabProject",
  "dashboard:tabBd": "permission.dashboardTabBd",
  "dashboard:tabAccounting": "permission.dashboardTabAccounting",
  "quotations:view": "permission.quotationsView",
  "quotations:viewAll": "permission.quotationsViewAll",
  "quotations:viewTeam": "permission.quotationsViewTeam",
  "quotations:viewDepartment": "permission.quotationsViewDepartment",
  "quotations:create": "permission.quotationsCreate",
  "quotations:edit": "permission.quotationsEdit",
  "quotations:delete": "permission.quotationsDelete",
  "quotations:approve": "permission.quotationsApprove",
  "quotations:reject": "permission.quotationsReject",
  "quotations:export": "permission.quotationsExport",
  "products:view": "permission.productsView",
  "products:create": "permission.productsCreate",
  "products:edit": "permission.productsEdit",
  "products:delete": "permission.productsDelete",
  "products:export": "permission.productsExport",
  "users:manage": "permission.usersManage",
  "roles:manage": "permission.rolesManage",
  "company:manage": "permission.companyManage",
  "departments:manage": "permission.departmentsManage",
  "teams:manage": "permission.teamsManage",
  "auditLog:view": "permission.auditLogView",
  "customers:view": "permission.customersView",
  "customers:create": "permission.customersCreate",
  "customers:edit": "permission.customersEdit",
  "customers:archive": "permission.customersArchive",
  "quotationTemplates:manage": "permission.quotationTemplatesManage",
  "quotationTemplates:view": "permission.quotationTemplatesView",
  "quotationTemplates:create": "permission.quotationTemplatesCreate",
  "quotationTemplates:edit": "permission.quotationTemplatesEdit",
  "quotationTemplates:duplicate": "permission.quotationTemplatesDuplicate",
  "quotationTemplates:activate": "permission.quotationTemplatesActivate",
  "quotationTemplates:archive": "permission.quotationTemplatesArchive",
  "quotationTemplates:import": "permission.quotationTemplatesImport",
  "scopeOfWork:view": "permission.scopeOfWorkView",
  "scopeOfWork:viewAll": "permission.scopeOfWorkViewAll",
  "scopeOfWork:viewTeam": "permission.scopeOfWorkViewTeam",
  "scopeOfWork:viewDepartment": "permission.scopeOfWorkViewDepartment",
  "scopeOfWork:create": "permission.scopeOfWorkCreate",
  "scopeOfWork:edit": "permission.scopeOfWorkEdit",
  "scopeOfWork:finalize": "permission.scopeOfWorkFinalize",
  "scopeOfWork:print": "permission.scopeOfWorkPrint",
  "scopeOfWork:delete": "permission.scopeOfWorkDelete",
  "scopeOfWork:chasePo": "permission.scopeOfWorkChasePo",
  "deliveryOrder:view": "permission.deliveryOrderView",
  "deliveryOrder:viewAll": "permission.deliveryOrderViewAll",
  "deliveryOrder:viewTeam": "permission.deliveryOrderViewTeam",
  "deliveryOrder:viewDepartment": "permission.deliveryOrderViewDepartment",
  "deliveryOrder:create": "permission.deliveryOrderCreate",
  "deliveryOrder:edit": "permission.deliveryOrderEdit",
  "deliveryOrder:finalize": "permission.deliveryOrderFinalize",
  "deliveryOrder:print": "permission.deliveryOrderPrint",
  "deliveryOrder:delete": "permission.deliveryOrderDelete",
  "service:view": "permission.serviceView",
  "service:viewAll": "permission.serviceViewAll",
  "service:create": "permission.serviceCreate",
  "service:edit": "permission.serviceEdit",
  "service:delete": "permission.serviceDelete",
  "service:complete": "permission.serviceComplete",
  "service:print": "permission.servicePrint",
  "serviceTemplates:view": "permission.serviceTemplatesView",
  "serviceTemplates:create": "permission.serviceTemplatesCreate",
  "serviceTemplates:edit": "permission.serviceTemplatesEdit",
  "serviceTemplates:archive": "permission.serviceTemplatesArchive",
  "ar:view": "permission.arView",
  "ar:create": "permission.arCreate",
  "ar:issue": "permission.arIssue",
  "ar:cancel": "permission.arCancel",
  "stock:view": "permission.stockView",
  "stock:adjust": "permission.stockAdjust",
  "productRequest:view": "permission.productRequestView",
  "productRequest:viewAll": "permission.productRequestViewAll",
  "productRequest:create": "permission.productRequestCreate",
  "productRequest:review": "permission.productRequestReview",
  "project:view": "permission.projectView",
  "project:viewAll": "permission.projectViewAll",
  "project:create": "permission.projectCreate",
  "project:edit": "permission.projectEdit",
  "project:finalize": "permission.projectFinalize",
  "project:print": "permission.projectPrint",
  "project:delete": "permission.projectDelete",
  "materialRequisition:view": "permission.materialRequisitionView",
  "materialRequisition:viewAll": "permission.materialRequisitionViewAll",
  "materialRequisition:create": "permission.materialRequisitionCreate",
  "materialRequisition:edit": "permission.materialRequisitionEdit",
  "materialRequisition:finalize": "permission.materialRequisitionFinalize",
  "materialRequisition:print": "permission.materialRequisitionPrint",
  "materialRequisition:delete": "permission.materialRequisitionDelete",
  "jobOrder:view": "permission.jobOrderView",
  "jobOrder:viewAll": "permission.jobOrderViewAll",
  "jobOrder:create": "permission.jobOrderCreate",
  "jobOrder:edit": "permission.jobOrderEdit",
  "jobOrder:finalize": "permission.jobOrderFinalize",
  "jobOrder:print": "permission.jobOrderPrint",
  "jobOrder:delete": "permission.jobOrderDelete",
  "purchaseRequest:view": "permission.purchaseRequestView",
  "purchaseRequest:viewAll": "permission.purchaseRequestViewAll",
  "purchaseRequest:create": "permission.purchaseRequestCreate",
  "purchaseRequest:edit": "permission.purchaseRequestEdit",
  "purchaseRequest:editApproved": "permission.purchaseRequestEditApproved",
  "purchaseRequest:finalize": "permission.purchaseRequestFinalize",
  "purchaseRequest:print": "permission.purchaseRequestPrint",
  "purchaseRequest:delete": "permission.purchaseRequestDelete",
  "productionOrder:view": "permission.productionOrderView",
  "productionOrder:viewAll": "permission.productionOrderViewAll",
  "productionOrder:create": "permission.productionOrderCreate",
  "productionOrder:edit": "permission.productionOrderEdit",
  "productionOrder:finalize": "permission.productionOrderFinalize",
  "productionOrder:print": "permission.productionOrderPrint",
  "productionOrder:delete": "permission.productionOrderDelete",
  "purchaseOrder:view": "permission.purchaseOrderView",
  "purchaseOrder:viewAll": "permission.purchaseOrderViewAll",
  "purchaseOrder:create": "permission.purchaseOrderCreate",
  "purchaseOrder:edit": "permission.purchaseOrderEdit",
  "purchaseOrder:finalize": "permission.purchaseOrderFinalize",
  "purchaseOrder:print": "permission.purchaseOrderPrint",
  "purchaseOrder:delete": "permission.purchaseOrderDelete",
  "receivingReport:view": "permission.receivingReportView",
  "receivingReport:viewAll": "permission.receivingReportViewAll",
  "receivingReport:create": "permission.receivingReportCreate",
  "receivingReport:edit": "permission.receivingReportEdit",
  "receivingReport:receive": "permission.receivingReportReceive",
  "receivingReport:print": "permission.receivingReportPrint",
  "receivingReport:delete": "permission.receivingReportDelete",
  "ap:view": "permission.apView",
  "ap:manage": "permission.apManage",
  "costControl:view": "permission.costControlView",
  "costControl:viewAll": "permission.costControlViewAll",
  "costControl:create": "permission.costControlCreate",
  "costControl:edit": "permission.costControlEdit",
  "costControl:finalize": "permission.costControlFinalize",
  "costControl:print": "permission.costControlPrint",
  "costControl:delete": "permission.costControlDelete",
  "vendor:view": "permission.vendorView",
  "vendor:create": "permission.vendorCreate",
  "vendor:edit": "permission.vendorEdit",
  "vendor:archive": "permission.vendorArchive",
  "vendor:approve": "permission.vendorApprove",
  "codeRegister:view": "permission.codeRegisterView",
  "codeRegister:create": "permission.codeRegisterCreate",
  "codeRegister:edit": "permission.codeRegisterEdit",
  "codeRegister:archive": "permission.codeRegisterArchive",
};

export const PERMISSION_GROUPS: { label: string; labelKey: TranslationKey; permissions: Permission[] }[] = [
  { label: "แดชบอร์ด", labelKey: "nav.dashboard", permissions: ["dashboard:view", "dashboard:tabOverview", "dashboard:tabSales", "dashboard:tabService", "dashboard:tabPurchasing", "dashboard:tabInventory", "dashboard:tabProduction", "dashboard:tabProject", "dashboard:tabBd", "dashboard:tabAccounting"] },
  {
    label: "ใบเสนอราคา",
    labelKey: "nav.quotations",
    permissions: [
      "quotations:view",
      "quotations:viewAll",
      "quotations:viewTeam",
      "quotations:viewDepartment",
      "quotations:create",
      "quotations:edit",
      "quotations:delete",
      "quotations:approve",
      "quotations:reject",
      "quotations:export",
      "quotationTemplates:manage",
      "quotationTemplates:view",
      "quotationTemplates:create",
      "quotationTemplates:edit",
      "quotationTemplates:duplicate",
      "quotationTemplates:activate",
      "quotationTemplates:archive",
      "quotationTemplates:import",
      "scopeOfWork:view",
      "scopeOfWork:viewAll",
      "scopeOfWork:viewTeam",
      "scopeOfWork:viewDepartment",
      "scopeOfWork:create",
      "scopeOfWork:edit",
      "scopeOfWork:finalize",
      "scopeOfWork:print",
      "scopeOfWork:delete",
      "scopeOfWork:chasePo",
      "deliveryOrder:view",
      "deliveryOrder:viewAll",
      "deliveryOrder:viewTeam",
      "deliveryOrder:viewDepartment",
      "deliveryOrder:create",
      "deliveryOrder:edit",
      "deliveryOrder:finalize",
      "deliveryOrder:print",
      "deliveryOrder:delete",
    ],
  },
  {
    label: "คลังสินค้า",
    labelKey: "nav.products",
    permissions: [
      "products:view", "products:create", "products:edit", "products:delete", "products:export",
      "stock:view", "stock:adjust",
      "productRequest:view", "productRequest:viewAll", "productRequest:create", "productRequest:review",
      // ใบรับสินค้าอยู่กลุ่มคลังสินค้า ไม่ใช่จัดซื้อ — สโตร์เป็นคนรับของและเป็นเจ้าของใบ (2026-09-03)
      "receivingReport:view", "receivingReport:viewAll", "receivingReport:create", "receivingReport:edit",
      "receivingReport:receive", "receivingReport:print", "receivingReport:delete",
    ],
  },
  {
    label: "ลูกค้า",
    labelKey: "nav.customers",
    permissions: ["customers:view", "customers:create", "customers:edit", "customers:archive"],
  },
  {
    label: "บริการ",
    labelKey: "nav.service",
    permissions: [
      "service:view",
      "service:viewAll",
      "service:create",
      "service:edit",
      "service:delete",
      "service:complete",
      "service:print",
      "serviceTemplates:view",
      "serviceTemplates:create",
      "serviceTemplates:edit",
      "serviceTemplates:archive",
    ],
  },
  {
    label: "บัญชีลูกหนี้",
    labelKey: "permission.group.accounting",
    permissions: ["ar:view", "ar:create", "ar:issue", "ar:cancel", "ap:view", "ap:manage"],
  },
  {
    label: "โครงการ",
    labelKey: "nav.project",
    permissions: [
      "project:view",
      "project:viewAll",
      "project:create",
      "project:edit",
      "project:finalize",
      "project:print",
      "project:delete",
      "materialRequisition:view",
      "materialRequisition:viewAll",
      "materialRequisition:create",
      "materialRequisition:edit",
      "materialRequisition:finalize",
      "materialRequisition:print",
      "materialRequisition:delete",
      "jobOrder:view",
      "jobOrder:viewAll",
      "jobOrder:create",
      "jobOrder:edit",
      "jobOrder:finalize",
      "jobOrder:print",
      "jobOrder:delete",
      "purchaseRequest:view",
      "purchaseRequest:viewAll",
      "purchaseRequest:create",
      "purchaseRequest:edit",
      "purchaseRequest:editApproved",
      "purchaseRequest:finalize",
      "purchaseRequest:print",
      "purchaseRequest:delete",
    ],
  },
  {
    label: "ผลิต",
    labelKey: "nav.group.production",
    permissions: ["productionOrder:view", "productionOrder:viewAll", "productionOrder:create", "productionOrder:edit", "productionOrder:finalize", "productionOrder:print", "productionOrder:delete"],
  },
  {
    // จัดซื้อ (2026-08-28) — ตามผังกระบวนการจัดซื้อของเจ้าของ: ใบขอซื้อ (อยู่กลุ่ม "โครงการ" ตามเดิม
    // เพราะฝ่ายที่ขอเป็นเจ้าของใบ) → ใบสั่งซื้อ → ใบตรวจรับสินค้า → ใบรับวางบิล สามใบหลังเป็นของจัดซื้อ
    label: "จัดซื้อ",
    labelKey: "nav.group.purchasing",
    permissions: [
      "purchaseOrder:view", "purchaseOrder:viewAll", "purchaseOrder:create", "purchaseOrder:edit",
      "purchaseOrder:finalize", "purchaseOrder:print", "purchaseOrder:delete",
      "vendor:view", "vendor:create", "vendor:edit", "vendor:archive", "vendor:approve",
      "codeRegister:view", "codeRegister:create", "codeRegister:edit", "codeRegister:archive",
    ],
  },
  {
    label: "BD",
    labelKey: "nav.group.bd",
    permissions: [
      "costControl:view", "costControl:viewAll", "costControl:create", "costControl:edit",
      "costControl:finalize", "costControl:print", "costControl:delete",
    ],
  },
  {
    label: "ระบบ",
    labelKey: "permissionGroup.system",
    permissions: ["users:manage", "roles:manage", "company:manage", "departments:manage", "teams:manage", "auditLog:view"],
  },
];

export const SUPER_ADMIN_ONLY_PERMISSIONS: Permission[] = ["roles:manage", "company:manage", "departments:manage", "teams:manage"];

/**
 * Permissions that cannot work alone: granting the key without its listed dependencies produces a
 * screen that **hard-fails**, not one that merely hides a button.
 *
 * Deliberately narrow. This map is only for cases where a page/editor's own boot fetch is gated by
 * a *different* permission than the one that unlocks it, so the whole view errors out for a role
 * that holds one but not the other. It is NOT a list of "sensible pairings" (e.g. `service:print`
 * without `service:view`) — those degrade gracefully into an unreachable button, and folding them
 * in here would quietly override deliberate admin choices.
 *
 * Every entry below is `ServiceReportEditor.tsx`: its boot `Promise.all` calls
 * `fetchServiceTemplates()` unconditionally, for viewing an existing report as much as for creating
 * one (`ServicePage.openReport()` mounts the same component), so any role that can reach that
 * editor also needs `serviceTemplates:view` or gets a permanent error state.
 *
 * Cross-module fetches that already `.catch()` into a safe fallback — `QuoteDocument`'s Scope of
 * Work lookup, `ScopeOfWorkDocument`'s Delivery Order lookup — are correctly absent: they're
 * client-gated *and* fail soft. `GET /api/quotation-templates` is absent for a different reason:
 * it accepts `quotations:create` OR `quotationTemplates:view` server-side, so the wizard can't hit
 * this failure mode at all.
 */
export const PERMISSION_DEPENDENCIES: Partial<Record<Permission, Permission[]>> = {
  "service:view": ["serviceTemplates:view"],
  "service:create": ["serviceTemplates:view"],
  "service:edit": ["serviceTemplates:view"],
};

/**
 * Expands a permission list with everything PERMISSION_DEPENDENCIES says it needs, transitively.
 * Input order is preserved and additions are appended, so the result is stable and diffable.
 * Unknown strings pass through untouched — this normalizes, it doesn't validate.
 */
export function withPermissionDependencies(permissions: Permission[]): Permission[] {
  const result: Permission[] = [];
  const seen = new Set<Permission>();
  const queue = [...permissions];
  while (queue.length > 0) {
    const permission = queue.shift() as Permission;
    if (seen.has(permission)) continue;
    seen.add(permission);
    result.push(permission);
    queue.push(...(PERMISSION_DEPENDENCIES[permission] ?? []));
  }
  return result;
}

/** The permissions in `permissions` that depend on `permission` — i.e. what breaks if it's removed. */
export function permissionsRequiring(permission: Permission, permissions: Permission[]): Permission[] {
  return permissions.filter((p) => p !== permission && withPermissionDependencies([p]).includes(permission));
}
