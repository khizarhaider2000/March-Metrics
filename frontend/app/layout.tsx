import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { WarmupBanner } from "@/components/ui/warmup-banner";

export const metadata: Metadata = {
  title: {
    default:  "March Metrics",
    template: "%s · March Metrics",
  },
  description:
    "Build NCAA tournament brackets powered by advanced analytics and configurable weight profiles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface">
        <Navbar />
        <WarmupBanner />
        <div className="flex" style={{ height: "calc(100vh - 56px)" }}>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-screen-xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
