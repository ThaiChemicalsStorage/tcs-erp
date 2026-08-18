import { useState } from "react";
import { Package, Hammer, ShoppingCart, ArrowRight, Loader2 } from "lucide-react";
import type { Project, ProjectItem, ProjectItemSourcingMethod } from "../../lib/project";
import { createMaterialRequisition } from "../../lib/materialRequisition";
import { createJobOrder } from "../../lib/jobOrder";
import { createPurchaseRequest } from "../../lib/purchaseRequest";
import { ApiError } from "../../lib/apiClient";
import { useI18n } from "../../lib/i18n";

const sourcingStyle: Record<ProjectItemSourcingMethod, string> = {
  unassigned: "bg-muted text-muted-foreground border border-border",
  requisition: "bg-[#1a5fb4]/10 text-[#1a5fb4] border border-[#1a5fb4]/20",
  jobOrder: "bg-[#7c4dbb]/10 text-[#7c4dbb] border border-[#7c4dbb]/20",
  purchaseRequest: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
};
const statusStyle: Record<ProjectItem["itemStatus"], string> = {
  pending: "bg-[#5a7299]/10 text-[#576f94] border border-[#5a7299]/20",
  documentCreated: "bg-[#e08a3c]/10 text-[#a75d1a] border border-[#e08a3c]/20",
  fulfilled: "bg-[#2aa36b]/10 text-[#207e52] border border-[#2aa36b]/20",
  cancelled: "bg-[#e05252]/10 text-[#e05252] border border-[#e05252]/20",
};

/**
 * The 3-branch sourcing-assignment table — one row per Scope of Work item. Each "Create..." button
 * calls the matching sub-document's real creation endpoint directly (no separate "assign branch
 * first" step needed — creation itself atomically sets sourcingMethod/itemStatus, see
 * api/_lib/projectHandler.ts's linkProjectItemToSubDocument()). All 3 branches navigate into a real
 * document page (Stage 5 — Material Requisition, Job Order, and Purchase Request all have one).
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
  const statusLabel: Record<ProjectItem["itemStatus"], string> = {
    pending: t("project.itemStatus.pending"),
    documentCreated: t("project.itemStatus.documentCreated"),
    fulfilled: t("project.itemStatus.fulfilled"),
    cancelled: t("project.itemStatus.cancelled"),
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

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', 'Noto Sans Thai', serif" }}>{t("project.items.title")}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t("project.items.subtitle")}</p>
      </div>
      {project.items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">{t("project.items.emptyScope")}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {[t("project.items.col.item"), t("project.items.col.quantity"), t("project.items.col.sourcing"), t("project.items.col.status"), t("project.items.col.action")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {project.items.map((item) => {
                const busy = busyItemId === item.id;
                return (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="px-4 py-3.5 align-top">
                      <p className="text-sm text-foreground font-medium">{item.name}</p>
                      {item.specifications.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">{item.specifications.join(" · ")}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {item.quantity ?? "—"} {item.unit}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${sourcingStyle[item.sourcingMethod]}`}>
                        {sourcingLabel[item.sourcingMethod]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusStyle[item.itemStatus]}`}>
                        {statusLabel[item.itemStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      {item.itemStatus === "pending" ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {canCreateMaterialRequisition && (
                            <button
                              onClick={() => handleCreateRequisition(item)}
                              disabled={busy}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#1a5fb4]/40 transition-all disabled:opacity-60"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />} {t("project.items.createRequisition")}
                            </button>
                          )}
                          {canCreateJobOrder && (
                            <button
                              onClick={() => handleCreateJobOrder(item)}
                              disabled={busy}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#7c4dbb]/40 transition-all disabled:opacity-60"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Hammer size={12} />} {t("project.items.createJobOrder")}
                            </button>
                          )}
                          {canCreatePurchaseRequest && (
                            <button
                              onClick={() => handleCreatePurchaseRequest(item)}
                              disabled={busy}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#e08a3c]/40 transition-all disabled:opacity-60"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <ShoppingCart size={12} />} {t("project.items.createPurchaseRequest")}
                            </button>
                          )}
                          {!canCreateMaterialRequisition && !canCreateJobOrder && !canCreatePurchaseRequest && (
                            <span className="text-xs text-muted-foreground">{t("project.items.noPermission")}</span>
                          )}
                        </div>
                      ) : item.sourcingMethod === "requisition" && item.materialRequisitionId ? (
                        <button onClick={() => onOpenMaterialRequisition(item.materialRequisitionId)} className="flex items-center gap-1 text-xs font-mono text-[#c9a84c] hover:underline">
                          {item.materialRequisitionId} <ArrowRight size={11} />
                        </button>
                      ) : item.sourcingMethod === "jobOrder" && item.jobOrderId ? (
                        <button onClick={() => onOpenJobOrder(item.jobOrderId)} className="flex items-center gap-1 text-xs font-mono text-[#c9a84c] hover:underline">
                          {item.jobOrderId} <ArrowRight size={11} />
                        </button>
                      ) : item.sourcingMethod === "purchaseRequest" && item.purchaseRequestId ? (
                        <button onClick={() => onOpenPurchaseRequest(item.purchaseRequestId)} className="flex items-center gap-1 text-xs font-mono text-[#c9a84c] hover:underline">
                          {item.purchaseRequestId} <ArrowRight size={11} />
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
