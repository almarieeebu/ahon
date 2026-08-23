import type { Metadata, Viewport } from "next";
import { Sora, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ahon — money journal",
  description:
    "Private on-device journal for cash, tigum, and every utang you still owe.",
  applicationName: "Ahon",
  icons: { icon: "/favicon.svg" },
  appleWebApp: {
    capable: true,
    title: "Ahon",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f8f7f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${sora.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
