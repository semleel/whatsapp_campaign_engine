import Link from "next/link";
import { GitFork, Shield, KeyRound } from "lucide-react";

export default function FlowHubPage() {
  return (
    <div className="min-h-screen bg-[#f8f8f8] text-[#3e3e55] font-sans">
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-10">
        <div>
          <h1 className="text-3xl font-bold">Flow Workspace</h1>
          <p className="text-[#8e8e9e] mt-2 text-sm">
            Jump into user journeys or manage system automations from one place.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <Link
            href="/flows/user"
            className="group rounded-2xl border border-[#e0e0e7] bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:border-[#c5c5cf] hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 rounded-xl bg-[#e3f3ef] text-[#16a37d] transition group-hover:bg-[#43b899] group-hover:text-white">
                <GitFork size={28} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#8e8e9e]">
                User journeys
              </span>
            </div>
            <h2 className="text-xl font-bold mb-2">User Flows</h2>
            <p className="text-sm text-[#6d6d82] leading-relaxed">
              Build and edit campaign flows, manage branching logic, and design
              customer experiences.
            </p>
          </Link>

          <Link
            href="/flows/system"
            className="group rounded-2xl border border-[#e0e0e7] bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:border-[#c5c5cf] hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 rounded-xl bg-[#ebe8fd] text-[#6b5fd3] transition group-hover:bg-[#6b5fd3] group-hover:text-white">
                <Shield size={28} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#8e8e9e]">
                System control
              </span>
            </div>
            <h2 className="text-xl font-bold mb-2">System START Flow</h2>
            <p className="text-sm text-[#6d6d82] leading-relaxed">
              Assign which automation greets every conversation. Enforce a single
              START entry point for all inbound sessions.
            </p>
          </Link>

          <Link
            href="/flows/system-keywords"
            className="group rounded-2xl border border-[#e0e0e7] bg-white p-8 shadow-sm transition hover:-translate-y-0.5 hover:border-[#c5c5cf] hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="p-3 rounded-xl bg-[#fff1e6] text-[#c87324] transition group-hover:bg-[#c87324] group-hover:text-white">
                <KeyRound size={28} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-[#8e8e9e]">
                Safeguards
              </span>
            </div>
            <h2 className="text-xl font-bold mb-2">System Keywords</h2>
            <p className="text-sm text-[#6d6d82] leading-relaxed">
              Curate high-priority commands like MENU or STOP, map each keyword to
              the right journey, and keep guardrails centralized.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
