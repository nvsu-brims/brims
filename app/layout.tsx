import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppToaster } from "@/components/shared/app-toaster";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "NVSU-BRIMS",
  description: "NVSU Borrowing and Returning Items & Equipment Management System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn(dmSans.variable, "font-sans")}>
      <body className="min-h-full flex flex-col bg-slate-50">
        <TooltipProvider>{children}</TooltipProvider>
        <AppToaster />
      </body>
    </html>
  );
}