import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import AuthGate from "@/components/AuthGate";

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
        <AuthGate>
          <div className="flex min-h-screen bg-background text-foreground">
            <Sidebar />
            <main className="flex-1">
              <Topbar />
              <div className="p-6">{children}</div>
            </main>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
