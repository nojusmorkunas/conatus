import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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

// The nonce in proxy.ts's Content-Security-Policy is minted per request, so
// prerendered HTML can never carry a matching one: its inline hydration
// scripts would be refused and the page would render but never come alive.
// Every route that serves a real page is already request-scoped through auth,
// so forcing dynamic rendering here costs nothing and stops a future
// statically-prerenderable page from silently shipping broken.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      className={`${hanken.variable} ${geistMono.variable} h-full antialiased`}
      // The boot script updates this class before hydration for the saved theme.
      suppressHydrationWarning
    >
      <head>
        {/* Sets the theme class before first paint so dark mode doesn't flash
            light on load. Needs proxy.ts's per-request nonce to get past the
            CSP; browsers blank the nonce attribute once parsed, hence the
            hydration warning suppression. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeGuard />
        {children}
      </body>
    </html>
  );
}
