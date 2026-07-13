import { useState } from "react";
import type { User } from "../../../lib/users";
import type { CompanyProfile, CompanyProfileDraft } from "../../../lib/companyProfiles";
import { createCompanyProfile, updateCompanyProfile, setCompanyProfileArchived, setDefaultCompanyProfile } from "../../../lib/companyProfiles";
import { CompanyProfileList } from "./CompanyProfileList";
import { CompanyProfileForm } from "./CompanyProfileForm";
import { CompanyProfileDetail } from "./CompanyProfileDetail";
import { Toast } from "../../../components/Toast";
import { useToast } from "../../../hooks/useToast";
import { useI18n } from "../../../lib/i18n";

type View = "list" | "create" | "edit" | "view";

/**
 * Top-level view-switcher for the Company Profiles module, added 2026-07-13 — mirrors
 * ProductsPage.tsx's list/create/edit composition pattern. Permission booleans are computed once
 * in App.tsx (`hasPermission(currentUser, roles, "companyProfiles:x")`, same precedent as
 * `canManageCompany` for Settings) and passed down as plain props rather than re-deriving `roles`
 * lookups in every child component.
 *
 * **No `onAudit` prop** (removed 2026-07-13, Codex review fix): every mutation below is now
 * audited authoritatively server-side, inside `api/handlers/company-profiles.ts` itself
 * (`writeCompanyProfileAuditEntry()`), not by this component calling the generic
 * `POST /api/audit-log` after the fact — that path is now rejected outright for this module (see
 * `api/audit-log/index.ts`). Calling it here too would just be redundant, unwritable noise.
 */
export function CompanyProfilesPage({
  profiles,
  onProfilesChange,
  users,
  canCreate,
  canEdit,
  canArchive,
  canSetDefault,
}: {
  profiles: CompanyProfile[];
  onProfilesChange: (profiles: CompanyProfile[]) => void;
  users: User[];
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canSetDefault: boolean;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<View>("list");
  const [activeId, setActiveId] = useState<string | null>(null);
  const { message, show } = useToast();

  const activeProfile = profiles.find((p) => p.id === activeId);

  const handleCreate = async (draft: CompanyProfileDraft): Promise<string | null> => {
    try {
      const created = await createCompanyProfile(draft);
      onProfilesChange([...profiles, created]);
      show(t("companyProfiles.toast.created"));
      setView("list");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t("companyProfiles.createError");
    }
  };

  const handleUpdate = async (draft: CompanyProfileDraft): Promise<string | null> => {
    if (!activeId) return null;
    try {
      const updated = await updateCompanyProfile(activeId, draft);
      onProfilesChange(profiles.map((p) => (p.id === activeId ? updated : p)));
      show(t("companyProfiles.toast.updated"));
      setView("list");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : t("companyProfiles.saveError");
    }
  };

  const handleToggleActive = async (id: string) => {
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    try {
      const updated = await updateCompanyProfile(id, { isActive: !target.isActive });
      onProfilesChange(profiles.map((p) => (p.id === id ? updated : p)));
      show(updated.isActive ? t("companyProfiles.toast.activated") : t("companyProfiles.toast.deactivated"));
    } catch (err) {
      show(err instanceof Error ? err.message : t("companyProfiles.saveError"));
    }
  };

  const handleArchiveToggle = async (id: string) => {
    const target = profiles.find((p) => p.id === id);
    if (!target) return;
    try {
      const updated = await setCompanyProfileArchived(id, !target.isDeleted);
      onProfilesChange(profiles.map((p) => (p.id === id ? updated : p)));
      show(updated.isDeleted ? t("companyProfiles.toast.archived") : t("companyProfiles.toast.unarchived"));
    } catch (err) {
      show(err instanceof Error ? err.message : t("companyProfiles.saveError"));
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const updated = await setDefaultCompanyProfile(id);
      onProfilesChange(profiles.map((p) => (p.id === id ? updated : { ...p, isDefault: false })));
      show(t("companyProfiles.toast.setDefault"));
    } catch (err) {
      show(err instanceof Error ? err.message : t("companyProfiles.saveError"));
    }
  };

  if (view === "create") {
    return (
      <CompanyProfileForm
        mode="create"
        existingCodes={profiles.map((p) => p.companyCode)}
        onSave={handleCreate}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "edit" && activeProfile) {
    return (
      <CompanyProfileForm
        mode="edit"
        initial={activeProfile}
        existingCodes={profiles.filter((p) => p.id !== activeId).map((p) => p.companyCode)}
        onSave={handleUpdate}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "view" && activeProfile) {
    return (
      <>
        <CompanyProfileDetail
          profile={activeProfile}
          users={users}
          canEdit={canEdit}
          onEdit={() => setView("edit")}
          onBack={() => setView("list")}
        />
        <Toast message={message} />
      </>
    );
  }

  return (
    <>
      <CompanyProfileList
        profiles={profiles}
        canCreate={canCreate}
        canEdit={canEdit}
        canArchive={canArchive}
        canSetDefault={canSetDefault}
        onView={(id) => { setActiveId(id); setView("view"); }}
        onEdit={(id) => { setActiveId(id); setView("edit"); }}
        onCreateNew={() => setView("create")}
        onToggleActive={handleToggleActive}
        onSetDefault={handleSetDefault}
        onArchiveToggle={handleArchiveToggle}
      />
      <Toast message={message} />
    </>
  );
}
