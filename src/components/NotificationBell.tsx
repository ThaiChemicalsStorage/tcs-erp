import { useEffect, useState } from "react";
import { Bell, BellRing, Send, CheckCircle2, XCircle, AlertTriangle, CheckCheck, Ban, Check, Trash2, Trophy, TrendingDown, XOctagon, Mail, Wrench, PackagePlus, Warehouse, ShoppingCart, Store, KeyRound, Hash } from "lucide-react";
import type { Notification, NotificationType } from "../lib/notifications";
import { useI18n, type TranslationKey } from "../lib/i18n";

const TYPE_ICON: Record<NotificationType, React.ReactNode> = {
  quotation_submitted: <Send size={14} />,
  quotation_approved: <CheckCircle2 size={14} />,
  quotation_rejected: <XCircle size={14} />,
  quotation_high_value: <AlertTriangle size={14} />,
  quotation_customer_accepted: <CheckCheck size={14} />,
  quotation_customer_rejected: <Ban size={14} />,
  quotation_won: <Trophy size={14} />,
  quotation_lost: <TrendingDown size={14} />,
  quotation_cancelled: <XOctagon size={14} />,
  scope_of_work_document_sent: <Mail size={14} />,
  scope_of_work_po_chase: <BellRing size={14} />,
  scope_of_work_submitted: <Send size={14} />,
  scope_of_work_approved: <CheckCircle2 size={14} />,
  scope_of_work_rejected: <XCircle size={14} />,
  delivery_order_sent_to_department: <Send size={14} />,
  delivery_order_submitted: <Send size={14} />,
  delivery_order_approved: <CheckCircle2 size={14} />,
  delivery_order_rejected: <XCircle size={14} />,
  service_report_created: <Wrench size={14} />,
  service_report_completed: <CheckCircle2 size={14} />,
  service_report_customer_approved: <CheckCheck size={14} />,
  service_report_customer_rejected: <Ban size={14} />,
  material_requisition_submitted: <Send size={14} />,
  material_requisition_approved: <Warehouse size={14} />,
  purchase_request_submitted: <Send size={14} />,
  job_order_submitted: <Send size={14} />,
  production_order_submitted: <Send size={14} />,
  purchase_order_submitted: <Send size={14} />,
  cost_control_submitted: <Send size={14} />,
  store_receipt_submitted: <Send size={14} />,
  purchase_request_approved: <ShoppingCart size={14} />,
  purchase_request_edited: <ShoppingCart size={14} />,
  purchase_request_purchasing_approved: <ShoppingCart size={14} />,
  vendor_submitted: <Store size={14} />,
  vendor_approved: <Store size={14} />,
  vendor_rejected: <Store size={14} />,
  code_entry_submitted: <Hash size={14} />,
  code_entry_approved: <Hash size={14} />,
  code_entry_rejected: <Hash size={14} />,
  product_request_submitted: <PackagePlus size={14} />,
  product_request_approved: <CheckCircle2 size={14} />,
  product_request_rejected: <XCircle size={14} />,
  stock_low: <AlertTriangle size={14} />,
  password_reset_requested: <KeyRound size={14} />,
};

// แปลงเวลาเป็นข้อความ "เมื่อกี้ / ผ่านมากี่นาที/ชั่วโมง/วัน"
// Formats a timestamp as a relative "time ago" string
function timeAgo(iso: string, t: (key: TranslationKey) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("notif.justNow");
  if (mins < 60) return t("notif.minutesAgo").replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("notif.hoursAgo").replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  return t("notif.daysAgo").replace("{n}", String(days));
}

// กระดิ่งแจ้งเตือนพร้อมแผงรายการ อ่านแล้ว/ยังไม่อ่าน และการจัดการรายการ
// Notification bell with a dropdown panel listing read/unread items and actions
export function NotificationBell({
  notifications,
  currentUserId,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onNavigate,
}: {
  notifications: Notification[];
  currentUserId: string;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  onNavigate: (n: Notification) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const mine = notifications
    .filter((n) => n.recipientUserId === currentUserId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const unread = mine.filter((n) => !n.read).length;
  const badgeText = unread > 99 ? "99+" : String(unread);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const openNotification = (n: Notification) => {
    if (!n.read) onMarkRead(n.id);
    onNavigate(n);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-10 h-10 rounded-lg flex items-center justify-center text-[#3d5173] hover:bg-[#f4f6fa] hover:text-foreground transition-colors"
        aria-label={t("notif.bellAria")}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#b93636] text-white text-[11px] font-bold flex items-center justify-center leading-none">
            {badgeText}
          </span>
        )}
      </button>
      {open && (
        <>
          {/* แถบหัวเอกสารทุกหน้าเป็น sticky z-20 และมาทีหลังแถบบนใน DOM — แผงนี้กับฉากรับคลิกจึงต้องสูงกว่า
              ไม่งั้นแถบหัวเอกสารทับแผง และคลิกนอกแผงทะลุไปกดปุ่มบนแถบนั้นแทนการปิดแผง (2026-10-06) · ต่ำกว่า dialog z-50 */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-[26rem] max-w-[90vw] bg-card border border-border rounded-xl shadow-[0_12px_28px_-8px_rgba(11,29,58,0.22)] z-40 overflow-hidden flex flex-col max-h-[32rem]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-[15px] font-semibold text-foreground">{t("notif.title")}</p>
              {unread > 0 && (
                <button onClick={onMarkAllRead} className="flex items-center gap-1 text-[13px] font-medium text-[#1a5fb4] hover:underline">
                  <Check size={12} /> {t("notif.markAllRead")}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {mine.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-10">{t("empty.notifications.title")}</p>
              ) : (
                mine.map((n) => (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${n.title} — ${n.description}`}
                    className={`group flex items-start gap-3 px-4 py-3 border-b border-border/60 last:border-0 cursor-pointer transition-colors ${
                      n.read ? "hover:bg-secondary/40" : "bg-[#f4f7fc] hover:bg-[#e8f0fb]"
                    }`}
                    onClick={() => openNotification(n)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      openNotification(n);
                    }}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.read ? "bg-secondary text-muted-foreground" : "bg-[#e8f0fb] text-[#1a5fb4]"}`}>
                      {TYPE_ICON[n.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#1a5fb4] flex-shrink-0" />}
                        <p className={`text-xs truncate ${n.read ? "text-foreground" : "font-semibold text-foreground"}`} title={n.title}>{n.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono text-muted-foreground">{n.module}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{timeAgo(n.createdAt, t)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
                      className="opacity-50 hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-[#e05252] transition-all flex-shrink-0 p-1"
                      aria-label={t("notif.deleteAria")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
