// src/components/TagSelector.tsx
"use client";

import React, {
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
  ChangeEvent,
} from "react";

type TagSelectorProps = {
  selected: string[];
  onChange: (tags: string[]) => void;
  apiBase: string;
};

type TagRow = {
  tagid: number;
  name: string;
  status?: string | null;
  isdeleted?: boolean | null;
};

export default function TagSelector({
  selected,
  onChange,
  apiBase,
}: TagSelectorProps) {
  const [allTags, setAllTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ------------------------------------------------
  // Load tag options from backend
  // ------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function loadTags() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${apiBase}/api/tags?includeDeleted=false`);
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const data: TagRow[] = await res.json();
        if (!cancelled) {
          setAllTags(data || []);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("TagSelector load error:", err);
          setError(err?.message || "Failed to load tags");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadTags();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  // ------------------------------------------------
  // Close dropdown on click outside
  // ------------------------------------------------
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ------------------------------------------------
  // Helpers
  // ------------------------------------------------
  const normalizedSelected = selected || [];

  const availableNames = allTags.map((t) => t.name);
  const lowerQuery = query.trim().toLowerCase();

  const filteredOptions = allTags.filter((t) =>
    t.name.toLowerCase().includes(lowerQuery)
  );

  function toggleTag(name: string) {
    const exists = normalizedSelected.includes(name);
    if (exists) {
      onChange(normalizedSelected.filter((t) => t !== name));
    } else {
      onChange([...normalizedSelected, name]);
    }
  }

  function removeTag(name: string) {
    onChange(normalizedSelected.filter((t) => t !== name));
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    if (!open) setOpen(true);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }

    // Enter = create/select tag from free text
    if (e.key === "Enter") {
      e.preventDefault();
      const text = query.trim();
      if (!text) return;

      if (!normalizedSelected.includes(text)) {
        onChange([...normalizedSelected, text]);
      }
      setQuery("");
      return;
    }

    // Backspace on empty query = remove last tag
    if (e.key === "Backspace" && !query && normalizedSelected.length) {
      const last = normalizedSelected[normalizedSelected.length - 1];
      removeTag(last);
    }
  }

  return (
    <div ref={wrapperRef} className="space-y-2">
      {/* Selected chips */}
      {normalizedSelected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {normalizedSelected.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs"
            >
              {t}
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-red-500"
                onClick={() => removeTag(t)}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input + dropdown */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Search or select tags..."
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />

        {/* Dropdown */}
        {open && (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white text-sm shadow-lg">
            {loading && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Loading tags…
              </div>
            )}

            {error && !loading && (
              <div className="px-3 py-2 text-xs text-red-500">
                {error}
              </div>
            )}

            {!loading && !error && filteredOptions.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No matching tags. Press Enter to add “{query.trim()}”.
              </div>
            )}

            {!loading &&
              !error &&
              filteredOptions.map((tag) => {
                const isSelected = normalizedSelected.includes(tag.name);
                return (
                  <button
                    key={tag.tagid}
                    type="button"
                    className={`flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                    onClick={() => toggleTag(tag.name)}
                  >
                    <span>{tag.name}</span>
                    {isSelected && (
                      <span className="text-xs text-primary">✔</span>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Small hint for new tags if needed */}
      {!loading && (
        <p className="text-[11px] text-muted-foreground">
          Press Enter to add a new tag if it does not exist yet.
        </p>
      )}
    </div>
  );
}
