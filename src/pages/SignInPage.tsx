import { useState } from "react";
import { Eye, EyeOff, LogIn, User as UserIcon } from "lucide-react";
import { AuthLayout } from "./AuthLayout";

export function SignInPage({
  onSignIn,
}: {
  /** Returns an error message on failure, or null on success. */
  onSignIn: (identifier: string, password: string) => string | null;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError("กรุณากรอกชื่อผู้ใช้/อีเมลและรหัสผ่านให้ครบถ้วน");
      return;
    }
    const result = onSignIn(identifier.trim(), password);
    setError(result ?? "");
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>เข้าสู่ระบบ</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-7">ยินดีต้อนรับกลับ กรอกข้อมูลเพื่อเข้าใช้งาน TCS ERP</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-foreground block mb-1.5">ชื่อผู้ใช้ หรือ อีเมล</label>
          <div className="relative">
            <UserIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="username หรือ you@tcs-erp.co.th"
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

      <p className="text-center text-xs text-muted-foreground mt-7">
        ลืมรหัสผ่านหรือยังไม่มีบัญชี? ติดต่อผู้ดูแลระบบ (Administrator) เพื่อขอสิทธิ์เข้าใช้งาน
      </p>
    </AuthLayout>
  );
}
