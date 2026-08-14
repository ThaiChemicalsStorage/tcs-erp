// บีบอัดรูปภาพฝั่งเบราว์เซอร์เป็น WebP ก่อนอัปโหลด เพื่อลดพื้นที่จัดเก็บและแบนด์วิดท์
// Browser-side image compression to WebP before upload, to cut storage/bandwidth — pure Canvas API,
// no server-side library. Used by every image upload site in the app (profile picture, company
// logo/stamp, signature upload, Service checklist photos, Scope of Work attachments).

const MAX_RAW_BYTES = 20 * 1024 * 1024; // reject before decoding, so a huge input can't hang the tab

export function isCompressibleImage(file: File): boolean {
  return file.type.startsWith("image/");
}

// บีบอัดไฟล์รูปภาพ: ย่อขนาดถ้าเกิน maxDimension (ไม่ขยายภาพเล็ก) แล้วแปลงเป็น WebP
// Compresses an image file: downscales it if it exceeds maxDimension (never upscales a smaller
// image), then re-encodes it as WebP via an off-screen canvas. Returns both the data URL (for
// immediate preview/storage as before) and the raw Blob (for callers that need its byte size or an
// ArrayBuffer, e.g. size-cap checks or base64 encoding).
export async function compressImageFile(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<{ dataUrl: string; blob: Blob }> {
  const maxDimension = opts.maxDimension ?? 1920;
  const quality = opts.quality ?? 0.8;

  if (file.size > MAX_RAW_BYTES) {
    throw new Error(`Image file too large to process (${Math.floor(file.size / 1024 / 1024)}MB)`);
  }

  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Image compression failed"))),
      "image/webp",
      quality,
    );
  });

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read compressed image"));
    reader.readAsDataURL(blob);
  });

  return { dataUrl, blob };
}
