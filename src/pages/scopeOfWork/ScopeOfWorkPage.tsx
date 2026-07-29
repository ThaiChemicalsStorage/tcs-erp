import { useEffect, useState } from "react";
import type { User } from "../../lib/users";
import { type ScopeOfWorkListItem, fetchAllScopeOfWorks } from "../../lib/scopeOfWork";
import { ScopeOfWorkList } from "./ScopeOfWorkList";
import { ScopeOfWorkDocument } from "../quotation/ScopeOfWorkDocument";
import { Toast } from "../../components/Toast";
import { useToast } from "../../hooks/useToast";

/**
 * Standalone Scope of Work management page (added 2026-07-22, per direct user request) — a
 * top-level sidebar module, separate from the Quotation module a Scope of Work is still always
 * *created* from (the "สร้าง Scope of Work" button on QuoteDocument.tsx's toolbar is unchanged).
 * This page is purely for browsing/opening ones that already exist — the same "list page owns
 * list↔detail view state, detail component is keyed by id" pattern QuotationPage.tsx already uses
 * for quotes, reusing the exact same `ScopeOfWorkDocument.tsx` component that page also renders
 * inline (only `onBack`/`backLabel` differ, since there's no quotation to return to from here).
 */
export function ScopeOfWorkPage({
  users,
  currentUserId,
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
  canChasePo,
  canViewDeliveryOrder,
  canCreateDeliveryOrder,
  onOpenDeliveryOrder,
  initialScopeOfWorkId,
  onScopeOfWorkIdConsumed,
}: {
  users: User[];
  /** For the list's one-time guided tour "seen" tracking (see useModuleTour). */
  currentUserId: string;
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
  /** Gates the detail view's "ทวงเลข PO" button (`scopeOfWork:chasePo`, added 2026-07-29). */
  canChasePo: boolean;
  /** Threaded straight through to ScopeOfWorkDocument.tsx's "สร้าง/เปิดใบส่งมอบสินค้า" button
   * (added 2026-07-23) — see that component's own doc comment. */
  canViewDeliveryOrder: boolean;
  canCreateDeliveryOrder: boolean;
  onOpenDeliveryOrder: (deliveryOrderId: string) => void;
  /** Set by a notification click (added 2026-07-23, "scope_of_work_document_sent" — see
   * App.tsx's `onNavigate`) — jumps straight to that record's detail view instead of just the
   * list. Same "adjust state during rendering" pattern as `QuotationPage.tsx`'s `initialQuoteId`. */
  initialScopeOfWorkId?: string | null;
  onScopeOfWorkIdConsumed?: () => void;
}) {
  const [view, setView] = useState<"list" | "detail">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scopeOfWorks, setScopeOfWorks] = useState<ScopeOfWorkListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const toast = useToast();

  // Extracted so returning from the detail view can re-fetch too (see `onBack` below) — without
  // this, creating a Rewrite/Duplicate/edit while viewing a record and then going "back to list"
  // would show a stale list missing whatever just changed, until a full page reload.
  const loadList = () => {
    setLoading(true);
    setLoadError(false);
    fetchAllScopeOfWorks()
      .then((list) => { setScopeOfWorks(list); setLoading(false); })
      .catch(() => { setLoadError(true); setLoading(false); });
  };

  useEffect(() => {
    let cancelled = false;
    fetchAllScopeOfWorks()
      .then((list) => { if (!cancelled) { setScopeOfWorks(list); setLoading(false); } })
      .catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const openScopeOfWork = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };
  const backToList = () => {
    setView("list");
    loadList();
  };

  // React's "adjust state during rendering" pattern (not an effect — this only touches this
  // component's own local state), mirroring QuotationPage.tsx's identical `initialQuoteId`
  // handling. Reacts to every change of `initialScopeOfWorkId`, not just once per mount, so a
  // second notification click while this page is already open showing some other record still
  // jumps straight to the newly-clicked one.
  const [appliedScopeOfWorkId, setAppliedScopeOfWorkId] = useState<string | null>(null);
  if (initialScopeOfWorkId && initialScopeOfWorkId !== appliedScopeOfWorkId) {
    setAppliedScopeOfWorkId(initialScopeOfWorkId);
    setSelectedId(initialScopeOfWorkId);
    setView("detail");
  }
  useEffect(() => {
    if (initialScopeOfWorkId) onScopeOfWorkIdConsumed?.();
  }, [initialScopeOfWorkId, onScopeOfWorkIdConsumed]);

  if (view === "detail" && selectedId) {
    return (
      <>
        <ScopeOfWorkDocument
          key={selectedId}
          scopeOfWorkId={selectedId}
          users={users}
          canEdit={canEdit}
          canFinalize={canFinalize}
          canPrint={canPrint}
          canDelete={canDelete}
          canCreate={canCreate}
          canChasePo={canChasePo}
          canViewDeliveryOrder={canViewDeliveryOrder}
          canCreateDeliveryOrder={canCreateDeliveryOrder}
          onOpenDeliveryOrder={onOpenDeliveryOrder}
          onBack={backToList}
          backLabel="กลับไปรายการ Scope of Work"
          onDuplicated={(newId) => setSelectedId(newId)}
          onRewritten={(newId) => setSelectedId(newId)}
          showToast={toast.show}
        />
        <Toast message={toast.message} />
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="space-y-3 w-full max-w-3xl">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">ไม่สามารถโหลดข้อมูล Scope of Work ได้</p>
        <button
          onClick={loadList}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40 transition-all"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  return (
    <>
      <ScopeOfWorkList scopeOfWorks={scopeOfWorks} currentUserId={currentUserId} onOpen={openScopeOfWork} />
      <Toast message={toast.message} />
    </>
  );
}
