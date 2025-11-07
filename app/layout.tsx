import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Interactive Campaign Engine",
  description: "Team Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <div className="flex min-h-screen bg-background text-foreground">
          <Sidebar />
          <main className="flex-1">
            {/* top bar (optional) */}
            <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-[linear-gradient(90deg,rgba(0,0,0,0)_0%,color-mix(in_oklch,var(--primary)6%,transparent)_50%,rgba(0,0,0,0)_100%)]">
              <h1 className="text-lg font-semibold">Team Dashboard</h1>

              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 rounded-lg border border-border bg-secondary px-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-70"><path fill="currentColor" d="m21.53 20.47l-3.66-3.66A8.49 8.49 0 0 0 19 11.5A8.5 8.5 0 1 0 10.5 20a8.49 8.49 0 0 0 5.31-1.13l3.66 3.66zM4 11.5A6.5 6.5 0 1 1 10.5 18A6.51 6.51 0 0 1 4 11.5" /></svg>
                  <input placeholder="Search…" className="bg-transparent text-sm py-1.5 outline-none placeholder:opacity-60" />
                </div>
                <button className="btn btn-ghost">Feedback</button>
              </div>
            </div>
            <div className="p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
