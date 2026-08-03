import { useEffect, useState } from "react";

// จัดการข้อความ toast ที่แสดงชั่วคราวแล้วหายไปเองอัตโนมัติ
// Manages a toast message that auto-dismisses after a timeout
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 2800);
    return () => clearTimeout(t);
  }, [message]);

  return { message, show: setMessage };
}
