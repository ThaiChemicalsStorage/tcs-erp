export type StatusBadgeStatus = "archived" | "active" | "inactive";

const STATUS_CLASSES: Record<StatusBadgeStatus, string> = {
  archived: "bg-[#5a7299]/10 text-[#5a7299] border border-[#5a7299]/20",
  active: "bg-[#2aa36b]/10 text-[#2aa36b] border border-[#2aa36b]/20",
  inactive: "bg-[#e08a3c]/10 text-[#e08a3c] border border-[#e08a3c]/20",
};

export function StatusBadge({ status, label }: { status: StatusBadgeStatus; label: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${STATUS_CLASSES[status]}`}>
      {label}
    </span>
  );
}
