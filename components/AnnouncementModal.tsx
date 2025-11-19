"use client";

import { useEffect } from "react";

type Props = {
  message: string | null;
  title?: string;
  onClose?: () => void;
  autoHideMs?: number;
};

export default function AnnouncementModal({ message, title = "Success", onClose, autoHideMs = 2000 }: Props) {
  useEffect(() => {
    if (!message) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [message, onClose]);

  useEffect(() => {
    if (!message || !onClose) return;
    const timer = window.setTimeout(() => {
      onClose();
    }, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [message, onClose, autoHideMs]);

  if (!message) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998]">
      <div className="pointer-events-auto absolute left-1/2 top-6 w-full max-w-md -translate-x-1/2 px-4">
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/95 px-5 py-4 shadow-2xl">
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary shadow-inner">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8a8.009 8.009 0 0 1-8 8Zm0-6a1 1 0 0 1-1-1v-5a1 1 0 0 1 2 0v5a1 1 0 0 1-1 1Zm0-8a1.25 1.25 0 1 1 1.25-1.25A1.25 1.25 0 0 1 12 6Z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="mt-1 rounded-full bg-transparent p-1 text-muted-foreground hover:text-foreground"
              aria-label="Dismiss announcement"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
