import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useI18n } from "../lib/i18n";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

// แสดงหน้าจอ error สำรอง แยกออกมาเป็น function component เพื่อใช้ hook แปลภาษาได้
// Renders the error fallback screen, split out from the class component so it can use the i18n hook
function ErrorBoundaryFallback() {
  const { t } = useI18n();
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
      <div className="w-12 h-12 rounded-full bg-[#e05252]/10 flex items-center justify-center">
        <AlertTriangle size={22} className="text-[#e05252]" />
      </div>
      <p className="text-sm font-medium text-foreground">{t("boot.errorBoundary.title")}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{t("boot.errorBoundary.message")}</p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors"
      >
        <RotateCw size={14} /> {t("boot.errorBoundary.reload")}
      </button>
    </div>
  );
}

// ดัก error ที่เกิดขึ้นระหว่าง render ของหน้าลูก แล้วแสดงหน้าจอ error สำรองแทนที่จะพังทั้งแอป
// Catches render errors in child pages and shows a fallback screen instead of crashing the whole app
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[ErrorBoundary] a page crashed while rendering", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryFallback />;
    }
    return this.props.children;
  }
}
