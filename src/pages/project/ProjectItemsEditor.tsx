import { useState } from "react";
import { Package, Hammer, ShoppingCart, ArrowRight, Loader2 } from "lucide-react";
import type { Project, ProjectItem, ProjectItemSourcingMethod } from "../../lib/project";
import { createMaterialRequisition } from "../../lib/materialRequisition";
import { createJobOrder } from "../../lib/jobOrder";
import { createPurchaseRequest } from "../../lib/purchaseRequest";
import { ApiError } from "../../lib/apiClient";
import { SectionCard } from "../../components/ui/SectionCard";
import { btn, table } from "../../components/ui/styles";
import { ProjectItemStatusPill, Tag } from "./projectUi";
import { useI18n } from "../../lib/i18n";

/**
 * The 3-branch sourcing-assignment table — one row per Scope of Work item. Each "Create..." button
 * calls the matching sub-document's real creation endpoint directly (no separate "assign branch
 * first" step needed — creation itself atomically sets sourcingMethod/itemStatus, see
 * api/_lib/projectHandler.ts's linkProjectItemToSubDocument()). All 3 branches navigate into a real
 * document page (Stage 5 — Material Requisition, Job Order, and Purchase Request all have one).
 *
 * ดีไซน์ใหม่ 2026-09-30: การ์ดเต็มความกว้าง · สาขาการจัดหาเป็นป้ายเหลี่ยม ("ยังไม่กำหนด" เป็นตัวอักษรจาง) ·
 * ช่องการดำเนินการบอกชนิดเอกสาร + เลขที่เป็นลิงก์สีน้ำเงิน
 */
export function ProjectItemsEditor({
  project,
  canCreateMaterialRequisition,
  canCreateJobOrder,
  canCreatePurchaseRequest,
  onOpenMaterialRequisition,
  onOpenJobOrder,
  onOpenPurchaseRequest,
  showToast,
}: {
  project: Project;
  canCreateMaterialRequisition: boolean;
  canCreateJobOrder: boolean;
  canCreatePurchaseRequest: boolean;
  onOpenMaterialRequisition: (id: string) => void;
  onOpenJobOrder: (id: string) => void;
  onOpenPurchaseRequest: (id: string) => void;
  showToast: (msg: string) => void;
}) {
  const { t } = useI18n();
  const sourcingLabel: Record<ProjectItemSourcingMethod, string> = {
    unassigned: t("project.sourcing.unassigned"),
    requisition: t("project.sourcing.requisition"),
    jobOrder: t("project.sourcing.jobOrder"),
    purchaseRequest: t("project.sourcing.purchaseRequest"),
  };
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const handleCreateRequisition = async (item: ProjectItem) => {
    setBusyItemId(item.id);
    try {
      const mr = await createMaterialRequisition(project.id, item.id);
      onOpenMaterialRequisition(mr.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("project.items.errorCreateRequisition"));
    } finally {
      setBusyItemId(null);
    }
  };

  const handleCreateJobOrder = async (item: ProjectItem) => {
    setBusyItemId(item.id);
    try {
      const jo = await createJobOrder(project.id, item.id);
      onOpenJobOrder(jo.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("project.items.errorCreateJobOrder"));
    } finally {
      setBusyItemId(null);
    }
  };

  const handleCreatePurchaseRequest = async (item: ProjectItem) => {
    setBusyItemId(item.id);
    try {
      const pr = await createPurchaseRequest(project.id, item.id);
      onOpenPurchaseRequest(pr.id);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : t("project.items.errorCreatePurchaseRequest"));
    } finally {
      setBusyItemId(null);
    }
  };

  /** เอกสารย่อยที่รายการนี้ผูกอยู่ — ชนิด + เลขที่ + ทางเปิด */
  const linkedDoc = (item: ProjectItem): { kind: string; id: string; open: (id: string) => void } | null => {
    if (item.sourcingMethod === "requisition" && item.materialRequisitionId) return { kind: t("project.items.docKind.requisition"), id: item.materialRequisitionId, open: onOpenMaterialRequisition };
    if (item.sourcingMethod === "jobOrder" && item.jobOrderId) return { kind: t("project.items.docKind.jobOrder"), id: item.jobOrderId, open: onOpenJobOrder };
    if (item.sourcingMethod === "purchaseRequest" && item.purchaseRequestId) return { kind: t("project.items.docKind.purchaseRequest"), id: item.purchaseRequestId, open: onOpenPurchaseRequest };
    return null;
  };

  return (
    <SectionCard
      title={t("project.items.title")}
      subtitle={t("project.items.subtitle")}
      actions={<span className="text-[13px] text-muted-foreground">{t("ui.itemCount").replace("{n}", String(project.items.length))}</span>}
      bodyClassName=""
    >
      {project.items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{t("project.items.emptyScope")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className={table.head}>
                <th className={table.th}>{t("project.items.col.item")}</th>
                <th className={`${table.th} text-right`}>{t("project.items.col.quantity")}</th>
                <th className={table.th}>{t("project.items.col.sourcing")}</th>
                <th className={table.th}>{t("project.items.col.status")}</th>
                <th className={table.th}>{t("project.items.col.action")}</th>
              </tr>
            </thead>
            <tbody>
              {project.items.map((item) => {
                const busy = busyItemId === item.id;
                const doc = linkedDoc(item);
                const busyIcon = (icon: typeof Package) => {
                  const Icon = icon;
                  return busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />;
                };
                return (
                  <tr key={item.id} className="border-b border-[#eef1f6] last:border-b-0">
                    <td className={`${table.td} py-3 min-w-[240px]`}>
                      <span className="block text-sm font-medium text-foreground leading-snug">{item.name}</span>
                      {item.specifications.length > 0 && (
                        <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">{item.specifications.join(" · ")}</span>
                      )}
                    </td>
                    <td className={`${table.td} py-3 text-right tabular-nums text-[#3d5173] whitespace-nowrap`}>
                      {item.quantity ?? "—"} {item.unit}
                    </td>
                    <td className={`${table.td} py-3`}>
                      {item.sourcingMethod === "unassigned"
                        ? <span className="text-[13px] text-[#8a97ad] whitespace-nowrap">{sourcingLabel.unassigned}</span>
                        : <Tag>{sourcingLabel[item.sourcingMethod]}</Tag>}
                    </td>
                    <td className={`${table.td} py-3`}><ProjectItemStatusPill status={item.itemStatus} /></td>
                    <td className={`${table.td} py-3`}>
                      {item.itemStatus === "pending" ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          {canCreateMaterialRequisition && (
                            <button type="button" onClick={() => void handleCreateRequisition(item)} disabled={busy} className={btn.secondarySm}>
                              {busyIcon(Package)} {t("project.items.createRequisition")}
                            </button>
                          )}
                          {canCreateJobOrder && (
                            <button type="button" onClick={() => void handleCreateJobOrder(item)} disabled={busy} className={btn.secondarySm}>
                              {busyIcon(Hammer)} {t("project.items.createJobOrder")}
                            </button>
                          )}
                          {canCreatePurchaseRequest && (
                            <button type="button" onClick={() => void handleCreatePurchaseRequest(item)} disabled={busy} className={btn.secondarySm}>
                              {busyIcon(ShoppingCart)} {t("project.items.createPurchaseRequest")}
                            </button>
                          )}
                          {!canCreateMaterialRequisition && !canCreateJobOrder && !canCreatePurchaseRequest && (
                            <span className="text-[13px] text-muted-foreground">{t("project.items.noPermission")}</span>
                          )}
                        </div>
                      ) : doc ? (
                        <span className="flex items-center gap-2 text-[13px] text-muted-foreground whitespace-nowrap">
                          {doc.kind}
                          <button type="button" onClick={() => doc.open(doc.id)} className="font-mono text-[13px] font-medium text-[#1a5fb4] hover:underline inline-flex items-center gap-1">
                            {doc.id} <ArrowRight size={13} />
                          </button>
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#8a97ad]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
