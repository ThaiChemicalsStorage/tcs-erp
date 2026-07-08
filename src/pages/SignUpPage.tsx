import { useState } from "react";
import { Eye, EyeOff, Mail, User, UserPlus } from "lucide-react";
import { AuthLayout } from "./AuthLayout";

export function SignUpPage({
  onSignUp,
  onSwitchToSignIn,
}: {
  onSignUp: (name: string, email: string) => void;
  onSwitchToSignIn: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
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
    if (!agree) {
      setError("กรุณายอมรับข้อตกลงการใช้งานก่อนสมัครสมาชิก");
      return;
    }
    setError("");
    onSignUp(name.trim(), email.trim());
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>สมัครสมาชิก</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-7">สร้างบัญชีเพื่อเริ่มใช้งาน TCS ERP</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">ชื่อ-นามสกุล</label>
          <div className="relative">
            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อ นามสกุล"
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">อีเมล</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@tcs-erp.co.th"
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">รหัสผ่าน</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 6 ตัวอักษร"
              className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg pl-3 pr-10 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">ยืนยันรหัสผ่าน</label>
          <input
            type={showPassword ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="กรอกรหัสผ่านอีกครั้ง"
            className="w-full text-sm text-foreground bg-secondary border border-border rounded-lg px-3 py-2.5 outline-none focus:border-[#c9a84c]/50 transition-colors"
          />
        </div>

        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
            className="w-4 h-4 mt-0.5 rounded border-border accent-[#c9a84c]"
          />
          <span className="text-xs text-muted-foreground">ฉันยอมรับข้อตกลงการใช้งานและนโยบายความเป็นส่วนตัวของ TCS ERP</span>
        </label>

        {error && <p className="text-xs text-[#e05252]">{error}</p>}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
        >
          <UserPlus size={15} /> สร้างบัญชี
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-7">
        มีบัญชีอยู่แล้ว?{" "}
        <button onClick={onSwitchToSignIn} className="text-[#c9a84c] font-medium hover:text-[#a07830] transition-colors">
          เข้าสู่ระบบ
        </button>
      </p>
    </AuthLayout>
  );
}
