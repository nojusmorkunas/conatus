import type { Metadata } from "next";
import { Geist_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/session-provider";
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
      <head>
        {/* Raw tag on purpose: next/script beforeInteractive won't execute
            inline bodies here, and the React dev warning this triggers is
            dev-only noise — the script must run before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeGuard />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
