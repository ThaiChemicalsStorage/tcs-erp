import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requireUser, requirePermission } from "../_lib/auth.js";
import { quotesCollection, usersCollection, rolesCollection, notificationsCollection, withStringId, type QuoteFields } from "../_lib/collections.js";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import { workflowTransitions, isWorkflowActionAllowed, REQUIRED_PERMISSION_HINT, type ApprovalAction } from "../_lib/quoteWorkflow.js";
import { HIGH_VALUE_THRESHOLD, type NotificationType } from "../../src/lib/notifications.js";
import { PERMISSION_LABELS } from "../../src/lib/permissions.js";

const QUOTE_YEAR = 2567;

const EDITABLE_FIELDS: (keyof QuoteFields)[] = [
  "client", "salesperson", "lines", "discount", "amount", "interest",
  "contactName", "contactPhone", "contactEmail", "address", "taxId",
  "deliveryMethod", "deliveryAddress", "project", "poRef", "paymentTerms",
  "issueDate", "expiryDate", "remarks",
  "jobTypeCode", "jobTypeName", "isPotentialOpportunity", "followUpDate",
];
// Workflow actions may not move `interest` — that's a plain-edit-only field.
const WORKFLOW_EDITABLE_FIELDS = EDITABLE_FIELDS.filter((f) => f !== "interest");

function isApprovalAction(v: unknown): v is ApprovalAction {
  return typeof v === "string" && v in workflowTransitions;
}

async function nextQuoteId(quotes: Awaited<ReturnType<typeof quotesCollection>>): Promise<string> {
  const docs = await quotes.find({}, { projection: { _id: 1 } }).toArray();
  const maxNum = docs
    .map((d) => parseInt(d._id.split("-").pop() ?? "0", 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `QT-${QUOTE_YEAR}-${String(maxNum + 1).padStart(4, "0")}`;
}

function thaiDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

function cloneLines(lines: QuoteFields["lines"]): QuoteFields["lines"] {
  let idCounter = Date.now();
  return lines.map((l) => ({
    ...l,
    id: idCounter++,
    tags: [...l.tags],
    subDetails: l.subDetails.map((sd, i) => ({ ...sd, id: `sd-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 7)}` })),
  }));
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    await requirePermission(req, "quotations:view");
    const quotes = await quotesCollection();
    const docs = await quotes.find({}).toArray();
    res.status(200).json({ quotes: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "quotations:create");
    const body: Partial<QuoteFields> = req.body ?? {};
    if (!body.client?.trim()) throw new HttpError(400, "กรุณากรอกชื่อลูกค้า");

    const quotes = await quotesCollection();
    const id = await nextQuoteId(quotes);
    const today = new Date();
    const doc: QuoteFields & { _id: string } = {
      _id: id,
      client: body.client.trim(),
      date: thaiDate(today),
      valid: thaiDate(new Date(today.getTime() + 30 * 86400000)),
      amount: typeof body.amount === "number" ? body.amount : 0,
      status: "ร่าง",
      salesperson: body.salesperson ?? "",
      interest: null,
      lines: body.lines ?? [],
      discount: body.discount ?? 0,
      contactName: body.contactName ?? "",
      contactPhone: body.contactPhone ?? "",
      contactEmail: body.contactEmail ?? "",
      address: body.address ?? "",
      taxId: body.taxId ?? "",
      deliveryMethod: body.deliveryMethod ?? "",
      deliveryAddress: body.deliveryAddress ?? "",
      project: body.project ?? "",
      poRef: body.poRef ?? "",
      paymentTerms: body.paymentTerms ?? "",
      issueDate: body.issueDate ?? "",
      expiryDate: body.expiryDate ?? "",
      remarks: body.remarks ?? "",
      jobTypeCode: body.jobTypeCode ?? "",
      jobTypeName: body.jobTypeName ?? "",
      isPotentialOpportunity: body.isPotentialOpportunity === true,
      followUpDate: body.followUpDate ?? "",
      createdByUserId: ctx.user.id,
      updatedBy: ctx.user.id,
      approvalHistory: [],
    };
    await quotes.insertOne(doc);
    res.status(201).json({ quote: withStringId(doc) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "PATCH") throw new HttpError(405, "Method not allowed");

  const ctx = await requireUser(req);
  const quotes = await quotesCollection();
  const target = await quotes.findOne({ _id: id });
  if (!target) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const isOwner = !target.createdByUserId || target.createdByUserId === ctx.user.id;
  const hasEdit = roleHasPermission(ctx.role, "quotations:edit");
  const hasApprove = roleHasPermission(ctx.role, "quotations:approve");
  if (!hasEdit || !(isOwner || hasApprove)) throw new HttpError(403, "Forbidden");

  const body: Partial<QuoteFields> = req.body ?? {};
  const update: Partial<QuoteFields> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) (update as Record<string, unknown>)[field] = body[field];
  }

  if (Object.keys(update).length > 0) {
    update.updatedBy = ctx.user.id;
    await quotes.updateOne({ _id: id }, { $set: update });
  }
  const updated = await quotes.findOne({ _id: id });
  if (!updated) throw new HttpError(404, "ไม่พบใบเสนอราคา");
  res.status(200).json({ quote: withStringId(updated) });
}

async function handleDuplicate(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "quotations:create");

  const quotes = await quotesCollection();
  const source = await quotes.findOne({ _id: id });
  if (!source) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const { _id: _sourceId, ...rest } = source;
  const newId = await nextQuoteId(quotes);
  const doc = {
    _id: newId,
    ...rest,
    status: "ร่าง" as const,
    interest: null,
    lines: cloneLines(source.lines),
    createdByUserId: ctx.user.id,
    updatedBy: ctx.user.id,
    approvalHistory: [],
  };
  await quotes.insertOne(doc);
  res.status(201).json({ quote: withStringId(doc) });
}

async function handleWorkflow(req: VercelRequest, res: VercelResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requireUser(req);

  const body = req.body ?? {};
  const rawAction = body.action;
  if (!isApprovalAction(rawAction)) throw new HttpError(400, "Invalid action");
  const action: ApprovalAction = rawAction;
  const comment: string = typeof body.comment === "string" ? body.comment : "";
  const draft: Partial<QuoteFields> = body.draft ?? {};

  const quotes = await quotesCollection();
  const target = await quotes.findOne({ _id: id });
  if (!target) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  const transition = workflowTransitions[action];
  if (!transition.from.includes(target.status)) throw new HttpError(400, "สถานะปัจจุบันไม่รองรับการดำเนินการนี้");

  const isOwner = !target.createdByUserId || target.createdByUserId === ctx.user.id;
  const perms = {
    create: roleHasPermission(ctx.role, "quotations:create"),
    edit: roleHasPermission(ctx.role, "quotations:edit"),
    approve: roleHasPermission(ctx.role, "quotations:approve"),
    reject: roleHasPermission(ctx.role, "quotations:reject"),
    delete: roleHasPermission(ctx.role, "quotations:delete"),
  };
  if (!isWorkflowActionAllowed(action, isOwner, perms)) {
    throw new HttpError(403, `ต้องมีสิทธิ์ "${PERMISSION_LABELS[REQUIRED_PERMISSION_HINT[action]]}"`);
  }

  const update: Partial<QuoteFields> = {};
  for (const field of WORKFLOW_EDITABLE_FIELDS) {
    if (field in draft) (update as Record<string, unknown>)[field] = draft[field];
  }
  update.status = transition.to;
  update.createdByUserId = target.createdByUserId || ctx.user.id;
  update.updatedBy = ctx.user.id;
  update.approvalHistory = [
    ...target.approvalHistory,
    {
      id: crypto.randomUUID(),
      userId: ctx.user.id,
      userName: ctx.user.fullName,
      roleName: ctx.role?.name ?? ctx.user.roleKey,
      action,
      comment,
      createdAt: new Date().toISOString(),
    },
  ];

  await quotes.updateOne({ _id: id }, { $set: update });
  const updated = await quotes.findOne({ _id: id });
  if (!updated) throw new HttpError(404, "ไม่พบใบเสนอราคา");

  await createWorkflowNotifications(action, updated, ctx.user.fullName, comment);

  res.status(200).json({ quote: withStringId(updated) });
}

async function createWorkflowNotifications(
  action: ApprovalAction,
  quote: QuoteFields & { _id: string },
  actorName: string,
  comment: string,
): Promise<void> {
  const createdAt = new Date().toISOString();
  type NotifDoc = {
    recipientUserId: string;
    type: NotificationType;
    title: string;
    description: string;
    module: string;
    relatedQuoteId: string;
    createdAt: string;
    read: boolean;
  };
  const docs: NotifDoc[] = [];
  const add = (recipientUserIds: string[], fields: Omit<NotifDoc, "recipientUserId" | "createdAt" | "read">) => {
    for (const recipientUserId of new Set(recipientUserIds)) {
      docs.push({ ...fields, recipientUserId, createdAt, read: false });
    }
  };

  if (action === "submitted") {
    const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
    const roleList = await roles.find({}).toArray();
    const activeUsers = await users.find({ status: "active" }).toArray();
    const approverIds = activeUsers.filter((u) => roleHasPermission(findRole(roleList, u.roleKey), "quotations:approve")).map((u) => u._id.toString());
    add(approverIds, {
      type: "quotation_submitted",
      title: "ใบเสนอราคารออนุมัติ",
      description: `${actorName} ส่งใบเสนอราคา ${quote._id} (${quote.client}) เพื่อขออนุมัติ`,
      module: "ใบเสนอราคา",
      relatedQuoteId: quote._id,
    });
    if (quote.amount >= HIGH_VALUE_THRESHOLD) {
      const level2Ids = activeUsers.filter((u) => u.roleKey === "approver_2").map((u) => u._id.toString());
      add(level2Ids, {
        type: "quotation_high_value",
        title: "ใบเสนอราคามูลค่าสูงรออนุมัติ",
        description: `ใบเสนอราคา ${quote._id} (${quote.client}) มูลค่า ${quote.amount.toLocaleString("th-TH")} บาท ต้องได้รับการอนุมัติ`,
        module: "ใบเสนอราคา",
        relatedQuoteId: quote._id,
      });
    }
  } else if (quote.createdByUserId) {
    const creatorId = quote.createdByUserId;
    if (action === "approved") {
      add([creatorId], {
        type: "quotation_approved", title: "ใบเสนอราคาได้รับการอนุมัติ",
        description: `${actorName} อนุมัติใบเสนอราคา ${quote._id} (${quote.client})`, module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "rejected") {
      add([creatorId], {
        type: "quotation_rejected", title: "ใบเสนอราคาถูกปฏิเสธ",
        description: `${actorName} ปฏิเสธใบเสนอราคา ${quote._id} (${quote.client})${comment ? ` — เหตุผล: ${comment}` : ""}`,
        module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "customer_accepted") {
      add([creatorId], {
        type: "quotation_customer_accepted", title: "ลูกค้ายอมรับใบเสนอราคา",
        description: `ลูกค้ายอมรับใบเสนอราคา ${quote._id} (${quote.client})`, module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    } else if (action === "customer_rejected") {
      add([creatorId], {
        type: "quotation_customer_rejected", title: "ลูกค้าปฏิเสธใบเสนอราคา",
        description: `ลูกค้าปฏิเสธใบเสนอราคา ${quote._id} (${quote.client})${comment ? ` — เหตุผล: ${comment}` : ""}`,
        module: "ใบเสนอราคา", relatedQuoteId: quote._id,
      });
    }
  }

  if (docs.length > 0) {
    const notifications = await notificationsCollection();
    await notifications.insertMany(docs);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, async () => {
    const parts = getPathSegments(req, "/api/quotes");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "duplicate") return handleDuplicate(req, res, parts[0]);
    if (parts.length === 2 && parts[1] === "workflow") return handleWorkflow(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
