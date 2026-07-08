import { useState } from "react";
import { Eye, EyeOff, LogIn, Mail } from "lucide-react";
import { AuthLayout } from "./AuthLayout";

export function SignInPage({
  onSignIn,
  onSwitchToSignUp,
}: {
  onSignIn: (email: string) => void;
  onSwitchToSignUp: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน");
      return;
    }
    setError("");
    onSignIn(email.trim());
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>เข้าสู่ระบบ</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-7">ยินดีต้อนรับกลับ กรอกข้อมูลเพื่อเข้าใช้งาน TCS ERP</p>

      <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-foreground">รหัสผ่าน</label>
            <button
              type="button"
              onClick={() => setResetSent(true)}
              className="text-xs text-[#c9a84c] hover:text-[#a07830] transition-colors"
            >
              ลืมรหัสผ่าน?
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
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
          {resetSent && (
            <p className="text-xs text-[#2aa36b] mt-1.5">ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว</p>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-[#c9a84c]"
          />
          <span className="text-xs text-muted-foreground">จดจำฉันไว้ในระบบ</span>
        </label>

        {error && <p className="text-xs text-[#e05252]">{error}</p>}

        <button
          type="submit"
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
        >
          <LogIn size={15} /> เข้าสู่ระบบ
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-7">
        ยังไม่มีบัญชี?{" "}
        <button onClick={onSwitchToSignUp} className="text-[#c9a84c] font-medium hover:text-[#a07830] transition-colors">
          สมัครสมาชิก
        </button>
      </p>
    </AuthLayout>
  );
}
