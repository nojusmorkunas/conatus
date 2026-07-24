import type { Metadata, Viewport } from "next";
import { Geist_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeGuard } from "@/components/theme-guard";

const hanken = Hanken_Grotesk({
  variable: "--font-app-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Conatus",
  description: "A self-hosted task manager.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${hanken.variable} ${geistMono.variable} h-full antialiased`}
      // The boot script updates this class before hydration for the saved theme.
      suppressHydrationWarning
      >
      <body className="min-h-full flex flex-col">
        <ThemeGuard />
        {children}
      </body>
    </html>
  );
}
