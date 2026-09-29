import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PostHogProvider } from "@/lib/analytics/posthog-provider";
import { PwaRegister } from "@/components/app/pwa-register";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = localFont({
  src: "../../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "../../node_modules/next/dist/next-devtools/server/font/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "EscapeMate — Encuentra tu próximo escuadrón de raid",
  description: "Desliza, haz match y forma equipo con jugadores compatibles de Escape from Tarkov.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EscapeMate",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        <PostHogProvider>
          <PwaRegister />
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
