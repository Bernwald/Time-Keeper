"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  listPermissionGroups,
  listSourceFolders,
  listGroupMembers,
  listFolderAccess,
  listOrgMembers,
  listSourcesInFolder,
  listUnassignedSources,
  createPermissionGroup,
  createSourceFolder,
  addGroupMember,
  removeGroupMember,
  grantFolderAccess,
  revokeFolderAccess,
  assignSourcesToFolder,
  deletePermissionGroup,
  deleteSourceFolder,
  assignSourceToFolder,
} from "./actions";

// ── Types ──────────────────────────────────────────────────────────────

type Group = Awaited<ReturnType<typeof listPermissionGroups>>[number];
type Folder = Awaited<ReturnType<typeof listSourceFolders>>[number];
type Member = Awaited<ReturnType<typeof listGroupMembers>>[number];
type OrgMember = Awaited<ReturnType<typeof listOrgMembers>>[number];
type FolderAccess = Awaited<ReturnType<typeof listFolderAccess>>[number];
type Source = Awaited<ReturnType<typeof listSourcesInFolder>>[number];

// ── Page ───────────────────────────────────────────────────────────────

export default function BerechtigungenPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [pending, startTransition] = useTransition();

  // Folder detail cache: folder-id → { access, sources }
  const [folderDetails, setFolderDetails] = useState<
    Record<string, { access: FolderAccess[]; sources: Source[]; sourceCount: number }>
  >({});
  // Group detail cache: group-id → members
  const [groupMembers, setGroupMembers] = useState<Record<string, Member[]>>({});

  // Modals
  const [editingFolder, setEditingFolder] = useState<string | null>(null); // folder id or "new"
  const [editingGroup, setEditingGroup] = useState<string | null>(null); // group id or "new"

  const refresh = useCallback(() => {
    Promise.all([
      listPermissionGroups(),
      listSourceFolders(),
      listOrgMembers(),
    ]).then(([g, f, m]) => {
      setGroups(g);
      setFolders(f);
      setOrgMembers(m);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load folder details when folders change
  useEffect(() => {
    folders.forEach((f) => {
      if (!folderDetails[f.id]) {
        Promise.all([listFolderAccess(f.id), listSourcesInFolder(f.id)]).then(
          ([access, sources]) => {
            setFolderDetails((prev) => ({
              ...prev,
              [f.id]: { access, sources, sourceCount: sources.length },
            }));
          }
        );
      }
    });
  }, [folders, folderDetails]);

  // Load group members when groups change
  useEffect(() => {
    groups.forEach((g) => {
      if (!groupMembers[g.id]) {
        listGroupMembers(g.id).then((members) => {
          setGroupMembers((prev) => ({ ...prev, [g.id]: members }));
        });
      }
    });
  }, [groups, groupMembers]);

  function refreshAll() {
    setFolderDetails({});
    setGroupMembers({});
    startTransition(refresh);
  }

  return (
    <div className="animate-fade-in px-4 md:px-8 py-6 max-w-[var(--content-max-w)] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Berechtigungen
        </h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Ordner und Gruppen steuern, wer welche Dokumente sehen darf. Quellen ohne
          Ordner-Zuweisung sind fuer alle sichtbar.
        </p>
      </div>

      {/* ── Folders Table ─────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Quellen-Ordner
          </h2>
          <button
            onClick={() => setEditingFolder("new")}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg min-h-[36px] transition-colors"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-text)" }}
          >
            + Neuer Ordner
          </button>
        </div>

        {folders.length === 0 ? (
          <EmptyCard text="Noch keine Ordner angelegt. Quellen ohne Ordner sind fuer alle Org-Mitglieder sichtbar." />
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--color-line-soft)" }}
          >
            <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
              <thead>
                <tr style={{ background: "var(--color-panel)" }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--color-muted)" }}>Ordner</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--color-muted)" }}>Berechtigte Gruppen</th>
                  <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell" style={{ color: "var(--color-muted)" }}>Quellen</th>
                  <th className="text-right px-4 py-2.5 font-medium w-20 hidden md:table-cell" style={{ color: "var(--color-muted)" }}></th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => {
                  const detail = folderDetails[f.id];
                  return (
                    <tr
                      key={f.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderTop: "1px solid var(--color-line-soft)" }}
                      onClick={() => setEditingFolder(f.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{f.name}</span>
                        {f.description && (
                          <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
                            {f.description}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {detail?.access.map((a) => (
                            <span
                              key={a.id}
                              className="text-xs px-2 py-0.5 rounded-md"
                              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                            >
                              {a.permission_groups?.name ?? "?"}
                            </span>
                          )) ?? (
                            <span className="text-xs" style={{ color: "var(--color-muted)" }}>...</span>
                          )}
                          {detail?.access.length === 0 && (
                            <span className="text-xs" style={{ color: "var(--color-warning)" }}>
                              Keine Gruppen
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                        {detail ? detail.sourceCount : "..."}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingFolder(f.id); }}
                          className="text-xs px-2 py-1 rounded-lg min-h-[32px] min-w-[32px] transition-opacity"
                          style={{ color: "var(--color-accent)" }}
                        >
                          Bearbeiten
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Groups Table ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Berechtigungsgruppen
          </h2>
          <button
            onClick={() => setEditingGroup("new")}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg min-h-[36px] transition-colors"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-text)" }}
          >
            + Neue Gruppe
          </button>
        </div>

        {groups.length === 0 ? (
          <EmptyCard text="Noch keine Gruppen angelegt. Erstelle eine Gruppe und weise Mitglieder zu." />
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--color-line-soft)" }}
          >
            <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
              <thead>
                <tr style={{ background: "var(--color-panel)" }}>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--color-muted)" }}>Gruppe</th>
                  <th className="text-left px-4 py-2.5 font-medium" style={{ color: "var(--color-muted)" }}>Mitglieder</th>
                  <th className="text-right px-4 py-2.5 font-medium w-20 hidden md:table-cell" style={{ color: "var(--color-muted)" }}></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const members = groupMembers[g.id];
                  return (
                    <tr
                      key={g.id}
                      className="cursor-pointer transition-colors"
                      style={{ borderTop: "1px solid var(--color-line-soft)" }}
                      onClick={() => setEditingGroup(g.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium">{g.name}</span>
                        {g.description && (
                          <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
                            {g.description}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {members?.slice(0, 5).map((m) => (
                            <span
                              key={m.id}
                              className="text-xs px-2 py-0.5 rounded-md"
                              style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
                            >
                              {m.profiles?.full_name ?? m.profiles?.email ?? "?"}
                            </span>
                          ))}
                          {members && members.length > 5 && (
                            <span className="text-xs px-2 py-0.5" style={{ color: "var(--color-muted)" }}>
                              +{members.length - 5}
                            </span>
                          )}
                          {members?.length === 0 && (
                            <span className="text-xs" style={{ color: "var(--color-warning)" }}>
                              Keine Mitglieder
                            </span>
                          )}
                          {!members && (
                            <span className="text-xs" style={{ color: "var(--color-muted)" }}>...</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingGroup(g.id); }}
                          className="text-xs px-2 py-1 rounded-lg min-h-[32px] min-w-[32px]"
                          style={{ color: "var(--color-accent)" }}
                        >
                          Bearbeiten
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Folder Modal ──────────────────────────────────────────── */}
      {editingFolder && (
        <FolderModal
          folderId={editingFolder === "new" ? null : editingFolder}
          folder={editingFolder !== "new" ? folders.find((f) => f.id === editingFolder) ?? null : null}
          groups={groups}
          onClose={() => setEditingFolder(null)}
          onSaved={refreshAll}
        />
      )}

      {/* ── Group Modal ───────────────────────────────────────────── */}
      {editingGroup && (
        <GroupModal
          groupId={editingGroup === "new" ? null : editingGroup}
          group={editingGroup !== "new" ? groups.find((g) => g.id === editingGroup) ?? null : null}
          orgMembers={orgMembers}
          onClose={() => setEditingGroup(null)}
          onSaved={refreshAll}
        />
      )}
    </div>
  );
}

// ── Folder Modal ───────────────────────────────────────────────────────

function FolderModal({
  folderId,
  folder,
  groups,
  onClose,
  onSaved,
}: {
  folderId: string | null;
  folder: Folder | null;
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = folderId === null;
  const [name, setName] = useState(folder?.name ?? "");
  const [desc, setDesc] = useState(folder?.description ?? "");
  const [access, setAccess] = useState<FolderAccess[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [unassigned, setUnassigned] = useState<Source[]>([]);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"zugriff" | "quellen">("zugriff");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());

  const loadDetails = useCallback(() => {
    if (!folderId) return;
    Promise.all([
      listFolderAccess(folderId),
      listSourcesInFolder(folderId),
      listUnassignedSources(),
    ]).then(([a, s, u]) => {
      setAccess(a);
      setSources(s);
      setUnassigned(u);
    });
  }, [folderId]);

  useEffect(() => {
    loadDetails();
    if (isNew) {
      listUnassignedSources().then(setUnassigned);
    }
  }, [loadDetails, isNew]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const newId = await createSourceFolder(name.trim(), desc.trim() || undefined);
    if (selectedToAdd.size > 0) {
      await assignSourcesToFolder(Array.from(selectedToAdd), newId);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleGrantAccess(groupId: string) {
    if (!folderId) return;
    await grantFolderAccess(folderId, groupId);
    loadDetails();
  }

  async function handleRevokeAccess(accessId: string) {
    await revokeFolderAccess(accessId);
    loadDetails();
  }

  async function handleAssignSources() {
    if (!folderId || selectedToAdd.size === 0) return;
    await assignSourcesToFolder(Array.from(selectedToAdd), folderId);
    setSelectedToAdd(new Set());
    loadDetails();
  }

  async function handleUnassignSource(sourceId: string) {
    await assignSourceToFolder(sourceId, null);
    loadDetails();
  }

  async function handleDelete() {
    if (!folderId) return;
    if (!confirm("Ordner loeschen? Alle Quellen werden freigegeben (fuer alle sichtbar).")) return;
    await deleteSourceFolder(folderId);
    onSaved();
    onClose();
  }

  const grantedGroupIds = new Set(access.map((a) => a.group_id));
  const availableGroups = groups.filter((g) => !grantedGroupIds.has(g.id));
  const filteredUnassigned = unassigned.filter(
    (s) => !sourceFilter || s.title.toLowerCase().includes(sourceFilter.toLowerCase())
  );

  function toggleSource(id: string) {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex flex-col" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--color-line-soft)" }}
        >
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>
            {isNew ? "Neuer Ordner" : `Ordner: ${folder?.name}`}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                onClick={handleDelete}
                className="text-xs px-3 py-1.5 rounded-lg min-h-[36px]"
                style={{ color: "var(--color-danger)" }}
              >
                Loeschen
              </button>
            )}
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg min-h-[36px]"
              style={{ color: "var(--color-muted)" }}
            >
              Schliessen
            </button>
          </div>
        </div>

        {/* Name + Description */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Produktionsdaten"
                disabled={!isNew}
                className="w-full text-sm px-3 py-2 rounded-lg border-none outline-none min-h-[44px]"
                style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>
                Beschreibung
              </label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional"
                disabled={!isNew}
                className="w-full text-sm px-3 py-2 rounded-lg border-none outline-none min-h-[44px]"
                style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
              />
            </div>
          </div>
        </div>

        {isNew ? (
          /* ── New folder: source picker ─── */
          <div className="px-6 py-3 flex-1 overflow-y-auto min-h-0">
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--color-muted)" }}>
              Quellen zuordnen ({selectedToAdd.size} ausgewaehlt)
            </label>
            <input
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              placeholder="Quellen durchsuchen..."
              className="w-full text-sm px-3 py-2 rounded-lg border-none outline-none min-h-[44px] mb-2"
              style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
            />
            <div
              className="rounded-xl overflow-y-auto"
              style={{ maxHeight: "300px", background: "var(--color-bg-elevated)" }}
            >
              {filteredUnassigned.length === 0 ? (
                <p className="text-xs p-4 text-center" style={{ color: "var(--color-muted)" }}>
                  {sourceFilter ? "Keine Treffer." : "Keine unzugeordneten Quellen vorhanden."}
                </p>
              ) : (
                filteredUnassigned.map((s) => (
                  <SourceRow
                    key={s.id}
                    source={s}
                    selected={selectedToAdd.has(s.id)}
                    onToggle={() => toggleSource(s.id)}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          /* ── Existing folder: tabs ─── */
          <>
            <div className="px-6 pt-3 flex gap-1 shrink-0">
              <TabButton active={tab === "zugriff"} onClick={() => setTab("zugriff")}>
                Berechtigte Gruppen ({access.length})
              </TabButton>
              <TabButton active={tab === "quellen"} onClick={() => setTab("quellen")}>
                Quellen ({sources.length})
              </TabButton>
            </div>

            <div className="px-6 py-3 flex-1 overflow-y-auto min-h-0">
              {tab === "zugriff" ? (
                <div>
                  {/* Granted groups */}
                  {access.length === 0 && (
                    <p className="text-xs mb-3" style={{ color: "var(--color-warning)" }}>
                      Keine Gruppen haben Zugriff. Quellen in diesem Ordner sind fuer niemanden sichtbar.
                    </p>
                  )}
                  <div className="flex flex-col gap-1 mb-3">
                    {access.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg min-h-[44px]"
                        style={{ background: "var(--color-bg-elevated)" }}
                      >
                        <span className="text-sm font-medium">{a.permission_groups?.name ?? "?"}</span>
                        <button
                          onClick={() => handleRevokeAccess(a.id)}
                          className="text-xs px-2 py-1 rounded-lg min-h-[32px] opacity-50 hover:opacity-100 transition-opacity"
                          style={{ color: "var(--color-danger)" }}
                        >
                          Entfernen
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Add group */}
                  {availableGroups.length > 0 && (
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>
                        Gruppe hinzufuegen
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {availableGroups.map((g) => (
                          <button
                            key={g.id}
                            onClick={() => handleGrantAccess(g.id)}
                            className="text-xs px-3 py-1.5 rounded-lg min-h-[36px] transition-colors"
                            style={{ background: "var(--color-bg-elevated)", color: "var(--color-accent)" }}
                          >
                            + {g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Current sources */}
                  <div className="flex flex-col gap-1 mb-3">
                    {sources.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg min-h-[44px]"
                        style={{ background: "var(--color-bg-elevated)" }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <SourceTypeBadge type={s.source_type} />
                          <span className="text-sm truncate">{s.title}</span>
                        </div>
                        <button
                          onClick={() => handleUnassignSource(s.id)}
                          className="text-xs px-2 py-1 rounded-lg min-h-[32px] opacity-50 hover:opacity-100 transition-opacity shrink-0"
                          style={{ color: "var(--color-warning)" }}
                        >
                          Freigeben
                        </button>
                      </div>
                    ))}
                    {sources.length === 0 && (
                      <p className="text-xs py-2" style={{ color: "var(--color-muted)" }}>
                        Keine Quellen in diesem Ordner.
                      </p>
                    )}
                  </div>
                  {/* Add sources */}
                  <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>
                    Quellen hinzufuegen ({selectedToAdd.size} ausgewaehlt)
                  </label>
                  <input
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    placeholder="Quellen durchsuchen..."
                    className="w-full text-sm px-3 py-2 rounded-lg border-none outline-none min-h-[44px] mb-2"
                    style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
                  />
                  <div
                    className="rounded-xl overflow-y-auto"
                    style={{ maxHeight: "200px", background: "var(--color-bg-elevated)" }}
                  >
                    {filteredUnassigned.length === 0 ? (
                      <p className="text-xs p-3 text-center" style={{ color: "var(--color-muted)" }}>
                        {sourceFilter ? "Keine Treffer." : "Alle Quellen sind bereits zugeordnet."}
                      </p>
                    ) : (
                      filteredUnassigned.map((s) => (
                        <SourceRow
                          key={s.id}
                          source={s}
                          selected={selectedToAdd.has(s.id)}
                          onToggle={() => toggleSource(s.id)}
                        />
                      ))
                    )}
                  </div>
                  {selectedToAdd.size > 0 && (
                    <button
                      onClick={handleAssignSources}
                      className="mt-2 text-xs font-semibold px-4 py-2 rounded-lg min-h-[36px]"
                      style={{ background: "var(--color-accent)", color: "var(--color-accent-text)" }}
                    >
                      {selectedToAdd.size} Quellen zuordnen
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer (new only) */}
        {isNew && (
          <div
            className="px-6 py-4 flex justify-end gap-2 shrink-0"
            style={{ borderTop: "1px solid var(--color-line-soft)" }}
          >
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg min-h-[36px]"
              style={{ color: "var(--color-muted)" }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="text-xs font-semibold px-4 py-2 rounded-lg min-h-[36px] transition-opacity disabled:opacity-40"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-text)" }}
            >
              {saving ? "Erstelle..." : "Ordner erstellen"}
            </button>
          </div>
        )}
      </div>
    </Overlay>
  );
}

// ── Group Modal ────────────────────────────────────────────────────────

function GroupModal({
  groupId,
  group,
  orgMembers,
  onClose,
  onSaved,
}: {
  groupId: string | null;
  group: Group | null;
  orgMembers: OrgMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = groupId === null;
  const [name, setName] = useState(group?.name ?? "");
  const [desc, setDesc] = useState(group?.description ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [saving, setSaving] = useState(false);

  const loadMembers = useCallback(() => {
    if (!groupId) return;
    listGroupMembers(groupId).then(setMembers);
  }, [groupId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    await createPermissionGroup(name.trim(), desc.trim() || undefined);
    setSaving(false);
    onSaved();
    onClose();
  }

  async function handleAddMember(userId: string) {
    if (!groupId) return;
    await addGroupMember(groupId, userId);
    loadMembers();
  }

  async function handleRemoveMember(membershipId: string) {
    await removeGroupMember(membershipId);
    loadMembers();
  }

  async function handleDelete() {
    if (!groupId) return;
    if (!confirm("Gruppe loeschen? Alle Mitgliedschaften und Ordner-Zuweisungen werden entfernt.")) return;
    await deletePermissionGroup(groupId);
    onSaved();
    onClose();
  }

  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableMembers = orgMembers.filter((m) => !memberUserIds.has(m.user_id));

  return (
    <Overlay onClose={onClose}>
      <div className="flex flex-col" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--color-line-soft)" }}
        >
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>
            {isNew ? "Neue Gruppe" : `Gruppe: ${group?.name}`}
          </h2>
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                onClick={handleDelete}
                className="text-xs px-3 py-1.5 rounded-lg min-h-[36px]"
                style={{ color: "var(--color-danger)" }}
              >
                Loeschen
              </button>
            )}
            <button
              onClick={onClose}
              className="text-xs px-3 py-1.5 rounded-lg min-h-[36px]"
              style={{ color: "var(--color-muted)" }}
            >
              Schliessen
            </button>
          </div>
        </div>

        {/* Name + Description */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Produktion"
                disabled={!isNew}
                className="w-full text-sm px-3 py-2 rounded-lg border-none outline-none min-h-[44px]"
                style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>
                Beschreibung
              </label>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional"
                disabled={!isNew}
                className="w-full text-sm px-3 py-2 rounded-lg border-none outline-none min-h-[44px]"
                style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
              />
            </div>
          </div>
        </div>

        {/* Members */}
        {!isNew && (
          <div className="px-6 py-3 flex-1 overflow-y-auto min-h-0">
            <label className="text-xs font-medium mb-2 block" style={{ color: "var(--color-muted)" }}>
              Mitglieder ({members.length})
            </label>
            <div className="flex flex-col gap-1 mb-3">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg min-h-[44px]"
                  style={{ background: "var(--color-bg-elevated)" }}
                >
                  <div>
                    <span className="text-sm font-medium">{m.profiles?.full_name || m.profiles?.email || "Unbekannt"}</span>
                    {m.profiles?.full_name && m.profiles?.email && (
                      <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
                        {m.profiles.email}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    className="text-xs px-2 py-1 rounded-lg min-h-[32px] opacity-50 hover:opacity-100 transition-opacity"
                    style={{ color: "var(--color-danger)" }}
                  >
                    Entfernen
                  </button>
                </div>
              ))}
              {members.length === 0 && (
                <p className="text-xs py-2" style={{ color: "var(--color-muted)" }}>
                  Noch keine Mitglieder.
                </p>
              )}
            </div>

            {/* Add members */}
            {availableMembers.length > 0 && (
              <>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--color-muted)" }}>
                  Mitglied hinzufuegen
                </label>
                <div className="flex flex-col gap-1">
                  {availableMembers.map((m) => (
                    <button
                      key={m.user_id}
                      onClick={() => handleAddMember(m.user_id)}
                      className="text-left px-3 py-2 rounded-lg text-sm min-h-[44px] transition-colors"
                      style={{ color: "var(--color-text)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg-elevated)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="font-medium">{m.profiles?.full_name ?? m.profiles?.email ?? m.user_id}</span>
                      {m.profiles?.email && m.profiles?.full_name && (
                        <span className="text-xs ml-2" style={{ color: "var(--color-muted)" }}>
                          {m.profiles.email}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer (new only) */}
        {isNew && (
          <div
            className="px-6 py-4 flex justify-end gap-2 shrink-0"
            style={{ borderTop: "1px solid var(--color-line-soft)" }}
          >
            <button
              onClick={onClose}
              className="text-xs px-4 py-2 rounded-lg min-h-[36px]"
              style={{ color: "var(--color-muted)" }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="text-xs font-semibold px-4 py-2 rounded-lg min-h-[36px] transition-opacity disabled:opacity-40"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-text)" }}
            >
              {saving ? "Erstelle..." : "Gruppe erstellen"}
            </button>
          </div>
        )}
      </div>
    </Overlay>
  );
}

// ── Shared Components ──────────────────────────────────────────────────

function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl overflow-hidden animate-scale-in"
        style={{
          background: "var(--color-panel)",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium px-3 py-2 rounded-t-lg min-h-[36px] transition-colors"
      style={{
        background: active ? "var(--color-bg-elevated)" : "transparent",
        color: active ? "var(--color-text)" : "var(--color-muted)",
        borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function SourceRow({ source, selected, onToggle }: { source: Source; selected: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full text-left px-3 py-2 flex items-center gap-2 text-sm min-h-[40px] transition-colors"
      style={{
        background: selected ? "var(--color-accent-soft)" : "transparent",
        color: selected ? "var(--color-accent)" : "var(--color-text)",
        borderBottom: "1px solid var(--color-line-soft)",
      }}
    >
      <span
        className="w-4 h-4 rounded border flex items-center justify-center shrink-0 text-[10px]"
        style={{
          borderColor: selected ? "var(--color-accent)" : "var(--color-line)",
          background: selected ? "var(--color-accent)" : "transparent",
          color: selected ? "var(--color-accent-text)" : "transparent",
        }}
      >
        ✓
      </span>
      <SourceTypeBadge type={source.source_type} />
      <span className="truncate">{source.title}</span>
    </button>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl p-6 text-center"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-line-soft)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--color-muted)" }}>{text}</p>
    </div>
  );
}

function SourceTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    pdf: "PDF", xlsx: "Excel", csv: "CSV", docx: "Word", url: "URL", text: "Text", entity: "Entitaet",
  };
  return (
    <span
      className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0"
      style={{ background: "var(--color-bg-elevated)", color: "var(--color-muted)" }}
    >
      {labels[type] ?? type}
    </span>
  );
}
