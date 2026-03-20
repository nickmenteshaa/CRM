import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { AuthProvider } from "@/context/AuthContext";
import { FontSizeProvider } from "@/context/FontSizeContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ChatProvider } from "@/context/ChatContext";
import ErrorBoundary from "@/components/ErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AutoCRM — Car Sales Platform",
  description: "Customer Relationship Management for Car Dealerships",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-font-size="medium"
      data-density="comfortable"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0B0F14] text-[#F9FAFB]">
        <ErrorBoundary>
          <AuthProvider>
            <FontSizeProvider>
              <AppProvider>
                <NotificationProvider>
                  <ChatProvider>{children}</ChatProvider>
                </NotificationProvider>
              </AppProvider>
            </FontSizeProvider>
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
