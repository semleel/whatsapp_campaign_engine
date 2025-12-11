"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

export function CommandDialog({
  open,
  onOpenChange,
  title = "Select an item",
  items = [],
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  items: {
    group: string;
    values: {
      label: string;
      value: string;
      description?: string;
    }[];
  }[];
  onSelect: (value: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 bg-black/40" />
        <DialogContent className="fixed left-1/2 top-1/2 w-[90%] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg p-0">
          <VisuallyHidden>
            <DialogTitle>{title}</DialogTitle>
          </VisuallyHidden>

          <Command>
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-medium">{title}</h2>
            </div>

            <CommandInput placeholder="Search…" />

            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>

              {items.map((group) => (
                <CommandGroup key={group.group} heading={group.group}>
                  {group.values.map((item) => (
                    <CommandItem
                      key={item.value}
                      value={item.value}
                      onSelect={() => {
                        onSelect(item.value);
                        onOpenChange(false);
                      }}
                    >
                      <div className="flex flex-col">
                        <span>{item.label}</span>
                        {item.description && (
                          <span className="text-xs text-muted-foreground">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}
