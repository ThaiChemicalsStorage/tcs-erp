import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Eraser, PenLine } from "lucide-react";
import { useI18n } from "../lib/i18n";

const STROKE_COLOR = "#0b1d3a";
const STROKE_WIDTH = 2.4;
const PAD_HEIGHT = 150;
const labelCls = "text-xs text-muted-foreground block mb-1.5";

// จัดรูปแบบวันเวลาที่เซ็นตามภาษาที่เลือก (ไทยใช้ พ.ศ. ตามค่าเริ่มต้นของ th-TH)
// Formats the signing timestamp in the active language (th-TH gives the Buddhist year by default).
function formatSignedAt(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Canvas signature capture for on-site signing — pointer events throughout, so a mouse, a finger
 * and a stylus all take the identical code path (no separate touch handlers to drift apart), and
 * `touch-action: none` keeps a drawing stroke from scrolling the page underneath on a tablet.
 *
 * Deliberately a *sibling* convention to ImageUploadField.tsx rather than an extension of it: both
 * hand a base64 data URL to their parent and share its label/border/button styling, but a drawn
 * signature has no file to pick, needs a signer name captured alongside it, and — once confirmed —
 * locks into a preview so an accidental swipe can't silently alter a signature someone already
 * gave. Clearing is an explicit action.
 *
 * The parent owns the value (`dataUrl`/`signerName`/`signedAt`); this component only reports a
 * confirmed signature or a request to clear one.
 */
export function SignaturePad({
  dataUrl,
  signerName,
  signedAt,
  disabled = false,
  onConfirm,
  onClear,
}: {
  dataUrl: string;
  signerName: string;
  signedAt: string | null;
  disabled?: boolean;
  onConfirm: (signature: { dataUrl: string; name: string }) => void;
  onClear: () => void;
}) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);
  const [name, setName] = useState(signerName);
  const nameId = useId();

  // Truthiness, not `!== ""` — a legacy report predating these fields can arrive with `undefined`
  // despite the type, and that must read as unsigned, not as a signature with a broken <img>.
  const signed = !!dataUrl;

  // ปรับความละเอียด canvas ตาม devicePixelRatio เพื่อให้เส้นคมชัดบนจอความละเอียดสูง
  // Scales the backing store to devicePixelRatio so strokes stay crisp on a HiDPI/retina screen —
  // without this the canvas renders at CSS pixels and the signature looks visibly soft.
  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    if (width === 0) return;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(PAD_HEIGHT * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  // Sizing the canvas is DOM synchronization, so it belongs in an effect; `hasStroke` is reset by
  // whichever action emptied the pad (Clear / แก้ไข) rather than here, so this never triggers a
  // cascading render.
  useEffect(() => {
    if (signed) return;
    prepareCanvas();
  }, [signed, prepareCanvas]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    // Capture so a stroke that wanders outside the canvas keeps reporting to us and ends cleanly,
    // instead of leaving the pad stuck in a drawing state.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const { x, y } = pointAt(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A single tap is a legitimate mark (a dot), so record it rather than requiring a drag.
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointAt(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStroke || !name.trim()) return;
    onConfirm({ dataUrl: canvas.toDataURL("image/png"), name: name.trim() });
  };

  if (signed) {
    // No label above the card, deliberately: the caller already renders its own heading
    // ("Customer"), and a second label here pushed this card a line lower than the read-only
    // engineer card beside it, so the two columns didn't line up. The "captured signature" caption
    // lives with the signer's details below the image instead.
    return (
      <div className="border border-border rounded-lg bg-secondary/40 p-3">
        <div className="bg-white border border-border rounded-lg h-[110px] flex items-center justify-center overflow-hidden">
          <img src={dataUrl} alt={t("signaturePad.signedLabel")} className="max-h-full max-w-full object-contain" />
        </div>
        <div className="flex items-end justify-between gap-3 mt-2.5">
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">{t("signaturePad.signedLabel")}</p>
            <p className="text-sm text-foreground truncate">{signerName || t("common.dash")}</p>
            {signedAt && (
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {t("signaturePad.signedAt")} {formatSignedAt(signedAt, lang)}
              </p>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={() => { onClear(); setName(signerName); setHasStroke(false); }}
              className="flex-shrink-0 text-xs text-muted-foreground hover:text-[#c9a84c] underline underline-offset-2 transition-colors"
            >
              {t("signaturePad.redo")}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={nameId} className={labelCls}>
        <span className="flex items-center gap-1"><PenLine size={10} /> {t("signaturePad.signerName")}</span>
      </label>
      <input
        id={nameId}
        value={name}
        disabled={disabled}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("signaturePad.signerNamePlaceholder")}
        className="h-9 w-full px-3 text-sm bg-secondary border border-border rounded-lg outline-none focus:border-[#c9a84c]/50 transition-colors disabled:opacity-60"
      />
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
        aria-label={t("signaturePad.canvasLabel")}
        className={`w-full mt-2 bg-white border border-border rounded-lg ${disabled ? "opacity-60" : "cursor-crosshair"}`}
        style={{ height: PAD_HEIGHT, touchAction: "none" }}
      />
      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-[10px] text-muted-foreground">{t("signaturePad.hint")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearPad}
            disabled={disabled || !hasStroke}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eraser size={12} /> {t("signaturePad.clear")}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={disabled || !hasStroke || !name.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={12} /> {t("signaturePad.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
