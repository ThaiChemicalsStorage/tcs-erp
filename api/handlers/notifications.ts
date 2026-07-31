import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requireUser } from "../_lib/auth.js";
import { notificationsCollection, toObjectId, withStringId } from "../_lib/collections.js";

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  // Real per-user filtering server-side — unlike the old localStorage simulation, other
  // users' notifications never leave the database.
  const ctx = await requireUser(req);
  const notifications = await notificationsCollection();
  const docs = await notifications.find({ recipientUserId: ctx.user.id }).sort({ createdAt: -1 }).toArray();
  res.status(200).json({ notifications: docs.map(withStringId) });
}

async function handleMarkAllRead(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);
  const notifications = await notificationsCollection();
  await notifications.updateMany({ recipientUserId: ctx.user.id, read: false }, { $set: { read: true } });
  res.status(204).end();
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requireUser(req);
  const objectId = toObjectId(id);
  const notifications = await notificationsCollection();
  const target = await notifications.findOne({ _id: objectId });
  if (!target || target.recipientUserId !== ctx.user.id) throw new HttpError(404, "ไม่พบการแจ้งเตือน");

  if (req.method === "PATCH") {
    await notifications.updateOne({ _id: objectId }, { $set: { read: true } });
    const updated = await notifications.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบการแจ้งเตือน");
    res.status(200).json({ notification: withStringId(updated) });
    return;
  }

  if (req.method === "DELETE") {
    await notifications.deleteOne({ _id: objectId });
    res.status(204).end();
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    const parts = getPathSegments(req, "/api/notifications");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1 && parts[0] === "mark-all-read") return handleMarkAllRead(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
