import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * ชนิดของ request/response ที่ handler ทุกตัวใน `api/` รับ (2026-09-14)
 *
 * `server/app.ts` ส่ง req/res ของ Express เข้ามา ซึ่งมีครบทุกช่องข้างล่าง (`query` มาจาก query parser
 * แบบ "simple", `body` จาก `express.json()`, `status()`/`json()`/`send()` จาก Express response)
 * · นิยามไว้ที่นี่เองแทนการยืมชนิดจากแพ็กเกจของแพลตฟอร์ม deploy เดิม ซึ่งถอดออกไปแล้ว — รูปเหมือนเดิมทุกช่อง
 * handler ทุกตัวจึงใช้ต่อได้โดยไม่แก้
 */
export interface ApiRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  // body ที่ parse แล้วเป็นอะไรก็ได้ตามที่ client ส่งมา — handler ตรวจเองทุกช่องก่อนใช้
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  cookies: Record<string, string>;
}

export interface ApiResponse extends ServerResponse {
  status(statusCode: number): ApiResponse;
  json(body: unknown): ApiResponse;
  send(body: unknown): ApiResponse;
}
