"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type VisuallyHiddenProps = React.HTMLAttributes<HTMLSpanElement>;

export function VisuallyHidden({
  className,
  ...props
}: VisuallyHiddenProps) {
  return (
    <span
      className={cn(
        "sr-only",
        className
      )}
      {...props}
    />
  );
}
