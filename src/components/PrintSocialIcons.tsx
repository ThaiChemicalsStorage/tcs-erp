// ไอคอน Facebook/Line ขนาดเล็กสำหรับใช้ในหัวกระดาษเอกสารที่พิมพ์ (ใบเสนอราคา/Scope of Work/ใบส่งมอบ)
// Small Facebook/Line icons for document print letterheads (Quotation/Scope of Work/Delivery Order).
export function FacebookIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0 }} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path fill="#fff" d="M15.6 12.7h-2.4V20h-3v-7.3H8.4V10h1.8V8.5c0-2.1 1.1-3.5 3.4-3.5h2v2.7h-1.5c-.8 0-.9.4-.9 1V10h2.6l-.2 2.7z" />
    </svg>
  );
}

export function LineAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0 }} aria-hidden="true">
      <rect width="24" height="24" rx="5.5" fill="#06C755" />
      <path fill="#fff" d="M12 4.9c-4 0-7.2 2.6-7.2 5.9 0 2.9 2.6 5.4 6.1 5.8.24.05.56.16.64.37.07.19.05.48.02.67l-.1.62c-.03.19-.15.73.64.4.79-.33 4.25-2.5 5.8-4.29 1.07-1.17 1.58-2.36 1.58-3.57 0-3.3-3.23-5.9-7.2-5.9z" />
    </svg>
  );
}
