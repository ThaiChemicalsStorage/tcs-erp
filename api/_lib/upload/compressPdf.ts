import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { UploadConfig } from "./uploadConfig.js";

/**
 * บีบอัด PDF ด้วย Ghostscript ตามข้อ 4.2 ของ `docs/UPLOAD_COMPRESSION_TASK.md`
 *
 * **กฎเหล็กของไฟล์นี้: ห้ามโยน error ออกไปไม่ว่ากรณีใด** — ข้อ 4.2.3 และข้อห้ามข้อ 4 ในข้อ 12
 * ระบุว่าการบีบอัดที่ล้มเหลวต้องไม่ทำให้ผู้ใช้อัปโหลดไม่ได้ ทุกทางออกที่ผิดพลาดจึงคืนไฟล์เดิม
 * พร้อมเหตุผล ไม่ใช่ throw · เคสที่เจอจริงได้: ไม่มี Ghostscript ติดตั้ง (เครื่อง dev ของ Windows),
 * PDF มีรหัสผ่าน, PDF เสียหาย, ไฟล์ใหญ่จนเกินเวลา
 */

export interface CompressedPdf {
  data: Buffer;
  status: "compressed" | "skipped" | "failed";
  /** เหตุผลตอนไม่ได้บีบ — เขียนลง log และเก็บไว้ในแถวของไฟล์เพื่อให้ตามสืบได้ทีหลัง */
  reason?: string;
}

/** ชื่อ binary ต่างกันระหว่าง Linux (คอนเทนเนอร์จริง) กับ Windows (เครื่อง dev) */
const GS_BINARIES = process.platform === "win32" ? ["gswin64c", "gswin32c", "gs"] : ["gs"];

function run(bin: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; err?: string }> {
  return new Promise((resolve) => {
    const child = execFile(bin, args, { timeout: timeoutMs, windowsHide: true }, (error) => {
      if (!error) return resolve({ ok: true });
      // `killed` = ชนเวลาที่ตั้งไว้ · ENOENT = ไม่มี binary ตัวนี้ในเครื่อง
      const killed = (error as NodeJS.ErrnoException & { killed?: boolean }).killed;
      const code = (error as NodeJS.ErrnoException).code;
      resolve({ ok: false, err: killed ? "timeout" : code === "ENOENT" ? "not-installed" : error.message.slice(0, 200) });
    });
    child.on("error", () => { /* จัดการใน callback แล้ว — กัน unhandled 'error' event */ });
  });
}

export async function compressPdf(buffer: Buffer, cfg: UploadConfig): Promise<CompressedPdf> {
  let dir: string | null = null;
  try {
    dir = await mkdtemp(path.join(tmpdir(), "tcs-pdf-"));
    const input = path.join(dir, "in.pdf");
    const output = path.join(dir, "out.pdf");
    await writeFile(input, buffer);

    /**
     * ใกล้เคียง preset `/ebook` แต่ตั้ง dpi เองเพื่อให้ปรับจาก env ได้ (ข้อ 5 ห้าม hardcode)
     * `-dSAFER` สำคัญมาก: กัน PostScript ในไฟล์ที่ผู้ใช้อัปโหลดมาอ่าน/เขียนไฟล์บนเซิร์ฟเวอร์
     */
    const args = [
      "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.4", "-dPDFSETTINGS=/ebook",
      "-dNOPAUSE", "-dQUIET", "-dBATCH", "-dSAFER",
      "-dDetectDuplicateImages=true",
      "-dDownsampleColorImages=true", `-dColorImageResolution=${cfg.pdfImageDpi}`,
      "-dDownsampleGrayImages=true", `-dGrayImageResolution=${cfg.pdfImageDpi}`,
      "-dDownsampleMonoImages=true", `-dMonoImageResolution=${cfg.pdfImageDpi * 2}`,
      `-sOutputFile=${output}`, input,
    ];

    let result: { ok: boolean; err?: string } = { ok: false, err: "not-installed" };
    for (const bin of GS_BINARIES) {
      result = await run(bin, args, cfg.compressTimeoutMs);
      if (result.ok || result.err !== "not-installed") break;
    }

    if (!result.ok) {
      const reason = result.err === "not-installed"
        ? "ไม่มี Ghostscript ในเครื่องนี้"
        : result.err === "timeout"
        ? `บีบอัดนานเกิน ${Math.round(cfg.compressTimeoutMs / 1000)} วินาที`
        : `Ghostscript ล้มเหลว: ${result.err}`;
      console.warn(`[upload] PDF ไม่ถูกบีบอัด — ${reason} (เก็บไฟล์เดิม)`);
      return { data: buffer, status: "failed", reason };
    }

    const compressed = await readFile(output);

    /**
     * ข้อ 4.2.2: ไม่เล็กลงอย่างน้อย 10% ให้เก็บไฟล์เดิม — PDF ที่เป็นข้อความล้วนบีบแทบไม่ลง
     * และบางครั้ง Ghostscript ทำให้ **ใหญ่ขึ้น** เพราะฝังฟอนต์ใหม่เข้าไป
     */
    if (compressed.length > buffer.length * 0.9) {
      return { data: buffer, status: "skipped", reason: "บีบแล้วเล็กลงไม่ถึง 10%" };
    }
    // ไฟล์ว่างเปล่า = Ghostscript จบด้วย exit 0 แต่ผลลัพธ์ใช้ไม่ได้ (เจอได้กับ PDF ที่เสียหายบางแบบ)
    if (compressed.length === 0) {
      return { data: buffer, status: "failed", reason: "Ghostscript คืนไฟล์ว่าง" };
    }
    return { data: compressed, status: "compressed" };
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : "ไม่ทราบสาเหตุ";
    console.warn(`[upload] PDF ไม่ถูกบีบอัด — ${reason} (เก็บไฟล์เดิม)`);
    return { data: buffer, status: "failed", reason };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => { /* โฟลเดอร์ชั่วคราว ลบไม่ได้ก็ช่าง */ });
  }
}
