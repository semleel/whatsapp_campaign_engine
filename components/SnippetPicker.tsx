// components/SnippetPicker.tsx

"use client";

import { CommandDialog } from "@/components/ui/command-dialog";

export default function SnippetPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (snippet: string) => void;
}) {
  const groups = [
    {
      group: "Formatters",
      values: [
        { label: "Convert list to text", value: " | list" },
        { label: "Format as number", value: " | number" },
        { label: "Format as currency", value: " | currency" },
      ],
    },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Insert formatter"
      items={groups}
      onSelect={onSelect}
    />
  );
}
