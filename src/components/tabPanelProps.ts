/**
 * props ของแผงเนื้อหาที่คู่กับแท็บใน `Tabs.tsx` — ให้ `aria-controls`/`aria-labelledby` ชี้กันถูกเสมอ
 * อยู่คนละไฟล์กับคอมโพเนนต์เพื่อให้ fast refresh ของ Vite ทำงาน
 */
export function tabPanelProps(idPrefix: string, key: string) {
  return { role: "tabpanel" as const, id: `${idPrefix}-panel-${key}`, "aria-labelledby": `${idPrefix}-tab-${key}`, tabIndex: 0 };
}
