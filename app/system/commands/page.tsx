// app/system/commands/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { SystemCommand } from "@/lib/types";
import { usePrivilege } from "@/lib/permissions";
import { showPrivilegeDenied } from "@/lib/showAlert";

export default function SystemCommandsPage() {
  const [commands, setCommands] = useState<SystemCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const { loading: privLoading, canView, canUpdate } = usePrivilege("system");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await Api.listSystemCommands();
        if (!cancelled) {
          setCommands(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load system commands."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (privLoading) return;
    if (!canView) {
      setLoading(false);
      setCommands([]);
      setError("You do not have permission to view system commands.");
      return;
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [privLoading, canView]);

  useEffect(() => {
    if (privLoading) return;
    if (!canUpdate) setEditing({});
  }, [privLoading, canUpdate]);

  function findCommand(cmd: string) {
    return commands.find((c) => c.command === cmd);
  }

  async function handleToggle(command: string) {
    if (!canUpdate) {
      await showPrivilegeDenied({ action: "update", resource: "system" });
      return;
    }
    const current = findCommand(command);
    if (!current) return;

    const nextEnabled = !current.is_enabled;

    // Optimistic update
    setCommands((prev) =>
      prev.map((c) =>
        c.command === command ? { ...c, is_enabled: nextEnabled } : c
      )
    );

    try {
      const updated = await Api.updateSystemCommand(command, {
        is_enabled: nextEnabled,
      });
      setCommands((prev) =>
        prev.map((c) => (c.command === command ? updated : c))
      );
    } catch (err) {
      // Rollback on error
      setCommands((prev) =>
        prev.map((c) =>
          c.command === command ? { ...c, is_enabled: current.is_enabled } : c
        )
      );
      console.error("Failed to toggle system command", err);
      alert("Failed to update command. Please try again.");
    }
  }

  function startEdit(command: string, currentDescription: string | null) {
    if (!canUpdate) {
      void showPrivilegeDenied({ action: "update", resource: "system" });
      return;
    }
    setEditing((prev) => ({ ...prev, [command]: currentDescription || "" }));
  }

  function cancelEdit(command: string) {
    setEditing((prev) => {
      const copy = { ...prev };
      delete copy[command];
      return copy;
    });
  }

  async function saveEdit(command: string) {
    if (!canUpdate) {
      await showPrivilegeDenied({ action: "update", resource: "system" });
      return;
    }
    const newDesc = editing[command] ?? "";
    const current = findCommand(command);
    if (!current) return;

    // Optimistic update
    setCommands((prev) =>
      prev.map((c) =>
        c.command === command ? { ...c, description: newDesc } : c
      )
    );

    try {
      const updated = await Api.updateSystemCommand(command, {
        description: newDesc,
      });
      setCommands((prev) =>
        prev.map((c) => (c.command === command ? updated : c))
      );
      cancelEdit(command);
    } catch (err) {
      console.error("Failed to save description", err);
      alert("Failed to save description. Please try again.");
      // Rollback
      setCommands((prev) =>
        prev.map((c) => (c.command === command ? current : c))
      );
    }
  }

  return (
    <main className="p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">System Commands</h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Manage built-in WhatsApp commands such as <code>/start</code>,
          <code className="mx-1">/reset</code>, <code>/exit</code>, <code>/menu</code>, and
          others. You can toggle whether each command is enabled and adjust its
          description.
        </p>
        {!privLoading && canView && !canUpdate && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            You have read-only access. Editing and toggling are disabled.
          </p>
        )}
      </header>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading commands…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!loading && !error && (
        <section className="border rounded-md divide-y bg-background">
          <div className="px-4 py-2 flex text-sm font-medium text-muted-foreground">
            <div className="w-32">Command</div>
            <div className="flex-1">Description</div>
            <div className="w-28 text-right">Enabled</div>
          </div>
          {commands.map((cmd) => {
            const isEditing = Object.prototype.hasOwnProperty.call(
              editing,
              cmd.command
            );
            const editValue = editing[cmd.command] ?? cmd.description ?? "";

            return (
              <div
                key={cmd.command}
                className="px-4 py-2 flex items-center text-sm gap-3"
              >
                <div className="w-32 font-mono">{cmd.command}</div>

                <div className="flex-1">
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 rounded border px-2 py-1 bg-background"
                        value={editValue}
                        onChange={(e) =>
                          setEditing((prev) => ({
                            ...prev,
                            [cmd.command]: e.target.value,
                          }))
                        }
                        disabled={!canUpdate}
                      />
                      <button
                        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                        onClick={() => saveEdit(cmd.command)}
                        disabled={!canUpdate}
                      >
                        Save
                      </button>
                      <button
                        className="text-xs px-2 py-1 rounded border"
                        onClick={() => cancelEdit(cmd.command)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    canUpdate ? (
                      <button
                        type="button"
                        className="w-full text-left hover:text-foreground text-muted-foreground"
                        onClick={() => startEdit(cmd.command, cmd.description)}
                      >
                        {cmd.description || (
                          <span className="italic text-slate-400">
                            No description set. Click to edit.
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="text-muted-foreground">
                        {cmd.description || (
                          <span className="italic text-slate-400">
                            No description set.
                          </span>
                        )}
                      </div>
                    )
                  )}
                </div>

                <div className="w-28 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleToggle(cmd.command)}
                    className={`relative h-6 w-11 overflow-hidden rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
                      cmd.is_enabled
                        ? "bg-emerald-500 border-emerald-600"
                        : "bg-slate-200 border-slate-300"
                    } ${canUpdate ? "hover:opacity-90" : "opacity-60 cursor-not-allowed"}`}
                    aria-pressed={cmd.is_enabled}
                    aria-label={
                      cmd.is_enabled
                        ? `Disable ${cmd.command} command`
                        : `Enable ${cmd.command} command`
                    }
                    disabled={!canUpdate}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        cmd.is_enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        This page is now backed by the <code>system_command</code> table. Changes
        here immediately affect how the WhatsApp engine handles built-in
        commands.
      </p>
    </main>
  );
}
