// แสดงสวิตช์เปิด/ปิดแบบ toggle
// Renders an on/off toggle switch button.
export function Toggle({ checked, onChange, labelledBy }: { checked: boolean; onChange: (v: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`w-[40px] h-[22px] rounded-full border transition-colors relative flex-shrink-0 ${checked ? "bg-[#c9a84c] border-transparent" : "bg-muted border-border"}`}
    >
      <span
        className={`absolute left-0 top-[3px] w-[16px] h-[16px] rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[21px]" : "translate-x-[3px]"}`}
      />
    </button>
  );
}
