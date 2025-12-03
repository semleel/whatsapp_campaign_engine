import type { ReactNode } from "react";

type FlowsLayoutProps = {
  children: ReactNode;
};

export default function FlowsLayout({ children }: FlowsLayoutProps) {
  return <>{children}</>;
}
