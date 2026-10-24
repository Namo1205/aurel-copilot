import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { Nav } from "@/components/Nav";
import { NotificationBar } from "@/components/NotificationBar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aurel Reservations AI Agent",
  description: "AI agent for the Aurel Hotels reservations desk: sort, assign an owner, draft, trace, approve.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <StoreProvider>
          <Nav />
          <NotificationBar />
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
        </StoreProvider>
      </body>
    </html>
  );
}
