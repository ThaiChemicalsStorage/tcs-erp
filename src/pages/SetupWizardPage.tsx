import { useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { AuthLayout } from "./AuthLayout";

export interface SetupWizardFields {
  fullName: string;
  employeeId: string;
  username: string;
  email: string;
  password: string;
}

export function SetupWizardPage({ onComplete }: { onComplete: (fields: SetupWizardFields) => void }) {
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !employeeId.trim() || !username.trim() || !email.trim() || !password) {
      setError("กรุณากรอกข้อมูลให้ครบทุกช่อง");
      return;
    }
    if (password.length < 6) {
      setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน");
      return;
    }
    setError("");
    onComplete({ fullName: fullName.trim(), employeeId: employeeId.trim(), username: username.trim(), email: email.trim(), password });
  };

  const inputCls = "w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors";

  return (
    <AuthLayout>
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={18} className="text-[#c9a84c]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#c9a84c]">การตั้งค่าเริ่มต้นระบบ</span>
      </div>
      <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>สร้างบัญชี Super Admin</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-7">
        ยังไม่มีผู้ใช้งานในระบบ กรุณาสร้างบัญชีผู้ดูแลระบบสูงสุดคนแรก บัญชีนี้จะได้รับสิทธิ์การเข้าถึงทั้งหมดโดยอัตโนมัติ
        ขั้นตอนนี้จะแสดงเพียงครั้งเดียวเท่านั้น
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">ชื่อ-นามสกุล</label>
          <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="เช่น นภา ลาเรนต์" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">รหัสพนักงาน</label>
            <input type="text" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls} placeholder="EMP-0001" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">ชื่อผู้ใช้ (Username)</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputCls} placeholder="username" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">อีเมล</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@tcs-erp.co.th" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">รหัสผ่าน</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-9`}
                placeholder="อย่างน้อย 6 ตัวอักษร"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">ยืนยันรหัสผ่าน</label>
            <input type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} placeholder="พิมพ์ซ้ำ" />
          </div>
        </div>

        {error && <p className="text-xs text-[#e05252]">{error}</p>}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
        >
          <ShieldCheck size={15} /> สร้างบัญชี Super Admin
        </button>
      </form>
    </AuthLayout>
  );
}
