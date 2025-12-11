"use client";

import { CommandDialog } from "@/components/ui/command-dialog";

export default function VariablePicker({
  open,
  onOpenChange,
  onSelect,
  responseSchema,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (token: string) => void;
  responseSchema?: any;
}) {
  const groups = [
    {
      group: "User Input",
      values: [
        { label: "lastAnswer.value", value: "{{ lastAnswer.value }}" },
        { label: "lastAnswer.raw", value: "{{ lastAnswer.raw }}" },
      ],
    },
  ];

  if (responseSchema && typeof responseSchema === "object") {
    groups.push({
      group: "API Response JSON",
      values: Object.keys(responseSchema).map((k) => ({
        label: `response.${k}`,
        value: `{{ response.${k} }}`,
      })),
    });
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Insert variable"
      items={groups}
      onSelect={onSelect}
    />
  );
}
