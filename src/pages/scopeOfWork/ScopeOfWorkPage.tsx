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
  canEdit,
  canFinalize,
  canPrint,
  canDelete,
  canCreate,
}: {
  users: User[];
  canEdit: boolean;
  canFinalize: boolean;
  canPrint: boolean;
  canDelete: boolean;
  canCreate: boolean;
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
      <ScopeOfWorkList scopeOfWorks={scopeOfWorks} onOpen={openScopeOfWork} />
      <Toast message={toast.message} />
    </>
  );
}
