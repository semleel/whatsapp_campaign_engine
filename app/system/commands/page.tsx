"use client";

import React, { useEffect, useState } from "react";
import { Api } from "@/lib/client";
import type { SystemCommand } from "@/lib/types";

export default function SystemCommandsPage() {
  const [commands, setCommands] = useState<SystemCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

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
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load system commands.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function findCommand(cmd: string) {
    return commands.find((c) => c.command === cmd);
  }

  async function handleToggle(command: string) {
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
                      />
                      <button
                        className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground"
                        onClick={() => saveEdit(cmd.command)}
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
                  )}
                </div>

                <div className="w-28 text-right">
                  <button
                    type="button"
                    onClick={() => handleToggle(cmd.command)}
                    className={
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs border " +
                      (cmd.is_enabled
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800"
                        : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-700")
                    }
                  >
                    {cmd.is_enabled ? "Enabled" : "Disabled"}
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
