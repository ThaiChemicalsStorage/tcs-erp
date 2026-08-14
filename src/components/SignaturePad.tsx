import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Eraser, PenLine, Upload } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { compressImageFile } from "../lib/imageCompression";

const STROKE_COLOR = "#0b1d3a";
const STROKE_WIDTH = 2.4;
const PAD_HEIGHT = 150;
const MAX_UPLOAD_BYTES = 1_000_000;
const labelCls = "text-xs text-muted-foreground block mb-1.5";
type Mode = "draw" | "upload";

// จัดรูปแบบวันเวลาที่เซ็นตามภาษาที่เลือก (ไทยใช้ พ.ศ. ตามค่าเริ่มต้นของ th-TH)
// Formats the signing timestamp in the active language (th-TH gives the Buddhist year by default).
function formatSignedAt(iso: string, lang: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(lang === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Signature capture with two entry modes — Draw (canvas, pointer events throughout so a mouse, a
 * finger and a stylus all take the identical code path, `touch-action: none` so a stroke doesn't
 * scroll the page underneath on a tablet) and Upload (pick an existing image, same file-type/size
 * validation as ImageUploadField.tsx). Switching modes discards whatever was pending in the mode
 * being left — nothing is silently carried over into the other mode's confirm.
 *
 * Once confirmed (by either mode) the result is a plain base64 data URL like any other signature,
 * and the component locks into a read-only preview so an accidental re-open can't silently alter a
 * signature someone already gave. Clearing/redoing is an explicit action.
 *
 * The parent owns the value (`dataUrl`/`signerName`/`signedAt`); this component only reports a
 * confirmed signature or a request to clear one.
 *
 * `requireName` defaults to true for the on-site/remote customer-signing use — a signer who isn't
 * necessarily in the system needs to type who they are. Settings' "personal signature" reuse passes
 * `requireName={false}` since the signer is always the logged-in user: no input is shown and the
 * caller's `signerName` (their profile name) is sent straight through on confirm.
 *
 * `allowUpload` defaults to true (Settings' reuse). The Service module's customer-facing sign-off
 * (on-site and the remote LINE-approval page) passes `allowUpload={false}` — a customer must draw
 * their own signature in front of the engineer or on their own device, not attach an arbitrary
 * image file standing in for one; the mode toggle isn't rendered at all in that case, and Draw is
 * the only path to a value.
 */
export function SignaturePad({
  dataUrl,
  signerName,
  signedAt,
  disabled = false,
  requireName = true,
  allowUpload = true,
  onConfirm,
  onClear,
}: {
  dataUrl: string;
  signerName: string;
  signedAt: string | null;
  disabled?: boolean;
  requireName?: boolean;
  allowUpload?: boolean;
  onConfirm: (signature: { dataUrl: string; name: string }) => void;
  onClear: () => void;
}) {
  const { t, lang } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const [mode, setMode] = useState<Mode>("draw");
  const [hasStroke, setHasStroke] = useState(false);
  const [uploadedDataUrl, setUploadedDataUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [name, setName] = useState(signerName);
  const nameId = useId();

  // Truthiness, not `!== ""` — a legacy report predating these fields can arrive with `undefined`
  // despite the type, and that must read as unsigned, not as a signature with a broken <img>.
  const signed = !!dataUrl;
  const hasValue = mode === "draw" ? hasStroke : !!uploadedDataUrl;

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
  // cascading render. Also re-fires on `mode` — the canvas unmounts while Upload mode is active, so
  // switching back to Draw hands prepareCanvas a fresh (zero-sized-until-now) element to measure.
  useEffect(() => {
    if (signed || mode !== "draw") return;
    prepareCanvas();
  }, [signed, mode, prepareCanvas]);

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

  const clearUpload = () => {
    setUploadedDataUrl("");
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Switching modes discards whatever was pending in the mode being left, so a stray canvas stroke
  // can never sneak into an Upload confirm (or vice versa) once the toggle is clicked.
  const switchMode = (next: Mode) => {
    if (next === mode || disabled) return;
    if (mode === "draw") clearPad();
    else clearUpload();
    setMode(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadError(t("settings.image.onlyImages")); return; }
    try {
      const { dataUrl, blob } = await compressImageFile(file);
      if (blob.size > MAX_UPLOAD_BYTES) { setUploadError(t("settings.image.tooLarge")); return; }
      setUploadError("");
      setUploadedDataUrl(dataUrl);
    } catch {
      setUploadError(t("settings.image.readError"));
    }
  };

  const clear = () => (mode === "draw" ? clearPad() : clearUpload());

  const confirm = () => {
    const finalDataUrl = mode === "draw" ? (hasStroke ? canvasRef.current?.toDataURL("image/webp", 0.92) ?? "" : "") : uploadedDataUrl;
    if (!finalDataUrl || (requireName && !name.trim())) return;
    onConfirm({ dataUrl: finalDataUrl, name: requireName ? name.trim() : signerName });
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
              onClick={() => { onClear(); setName(signerName); setMode("draw"); clearPad(); clearUpload(); }}
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
    // Same border/bg/p-3 card as the engineer's read-only box and the signed-state preview below,
    // with the canvas as the card's first element — so the actual signing box's top edge lines up
    // with the engineer box beside it. The signer-name field sits under the canvas instead of above
    // it for the same reason: above it used to push this whole card lower than the engineer's.
    <div className="border border-border rounded-lg bg-secondary/40 p-3">
      {allowUpload && (
        <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 w-fit mb-2.5">
          <button
            type="button"
            onClick={() => switchMode("draw")}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-all disabled:cursor-not-allowed ${
              mode === "draw" ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <PenLine size={11} /> {t("signaturePad.modeDraw")}
          </button>
          <button
            type="button"
            onClick={() => switchMode("upload")}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium transition-all disabled:cursor-not-allowed ${
              mode === "upload" ? "bg-[#c9a84c] text-[#0b1d3a]" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Upload size={11} /> {t("signaturePad.modeUpload")}
          </button>
        </div>
      )}

      {mode === "draw" ? (
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
          aria-label={t("signaturePad.canvasLabel")}
          className={`w-full bg-white border border-border rounded-lg ${disabled ? "opacity-60" : "cursor-crosshair"}`}
          style={{ height: PAD_HEIGHT, touchAction: "none" }}
        />
      ) : (
        <div>
          <div
            className={`w-full bg-white border border-border rounded-lg flex items-center justify-center overflow-hidden ${disabled ? "opacity-60" : ""}`}
            style={{ height: PAD_HEIGHT }}
          >
            {uploadedDataUrl ? (
              <img src={uploadedDataUrl} alt={t("signaturePad.uploadPreviewAlt")} className="max-h-full max-w-full object-contain" />
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:cursor-not-allowed"
              >
                <Upload size={18} />
                <span className="text-xs">{t("common.upload")}</span>
              </button>
            )}
          </div>
          {uploadedDataUrl && !disabled && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] text-muted-foreground hover:text-[#c9a84c] underline underline-offset-2 mt-1"
            >
              {t("signaturePad.changeFile")}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { void handleFile(e.target.files?.[0]); }}
          />
          {uploadError && <p role="alert" className="text-xs text-[#e05252] mt-1.5">{uploadError}</p>}
        </div>
      )}
      {requireName && (
        <div className="mt-2.5">
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
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-[10px] text-muted-foreground">{mode === "draw" ? t("signaturePad.hint") : t("settings.image.sizeHint")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={disabled || !hasValue}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Eraser size={12} /> {t("signaturePad.clear")}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={disabled || !hasValue || (requireName && !name.trim())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={12} /> {t("signaturePad.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
