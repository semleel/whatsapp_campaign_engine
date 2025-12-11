"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type CommandContextValue = {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
};

const CommandContext = React.createContext<CommandContextValue | null>(null);

export function useCommandContext() {
  const context = React.useContext(CommandContext);
  if (!context) {
    throw new Error("Command components must be wrapped in <Command>");
  }
  return context;
}

export function Command({ children, className }: { children: React.ReactNode; className?: string }) {
  const [query, setQuery] = React.useState("");
  return (
    <CommandContext.Provider value={{ query, setQuery }}>
      <div className={cn("grid gap-3", className)}>{children}</div>
    </CommandContext.Provider>
  );
}

type CommandInputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const CommandInput = React.forwardRef<HTMLInputElement, CommandInputProps>(
  ({ className, ...props }, ref) => {
    const { query, setQuery } = useCommandContext();
    return (
      <div className="border-b px-4 py-3">
        <input
          ref={ref}
          type="text"
          className={cn(
            "w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none",
            className
          )}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          {...props}
        />
      </div>
    );
  }
);
CommandInput.displayName = "CommandInput";

export const CommandList = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-3 px-4 pb-4 pt-1", className)}>{children}</div>
);

export const CommandEmpty = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md px-3 py-2 text-xs text-muted-foreground">{children}</div>
);

type CommandGroupProps = {
  heading?: string;
  children: React.ReactNode;
  className?: string;
};

export function CommandGroup({ heading, children, className }: CommandGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {heading && (
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {heading}
        </div>
      )}
      <div className="space-y-1">{children}</div>
    </div>
  );
}

type CommandItemProps = {
  value: string;
  onSelect?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
};

export const CommandItem = React.forwardRef<HTMLButtonElement, CommandItemProps>(
  ({ value, onSelect, className, children, ...props }, ref) => {
    return (
      <button
        type="button"
        ref={ref}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted/50",
          className
        )}
        onClick={() => onSelect?.(value)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
CommandItem.displayName = "CommandItem";

export const CommandSeparator = () => <div className="h-px bg-border" />;

export const CommandShortcut = ({ children }: { children: React.ReactNode }) => (
  <span className="text-[11px] text-muted-foreground">{children}</span>
);
