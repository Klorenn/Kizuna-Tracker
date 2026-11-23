import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { THEME_COOKIE, appleStatusBarStyle, parseTheme, themeColorFor } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** The theme cookie is read on the server, so the first paint already has the right colors. */
async function currentTheme() {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}

export async function generateMetadata(): Promise<Metadata> {
  const theme = await currentTheme();
  return {
    title: { default: "Kizuna Tracker", template: "%s · Kizuna" },
    description: "Rachas de hábitos con desafíos entre amigos.",
    applicationName: "Kizuna Tracker",
    appleWebApp: { capable: true, title: "Kizuna", statusBarStyle: appleStatusBarStyle(theme) },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return {
    width: "device-width",
    themeColor: themeColorFor(theme),
    initialScale: 1,
    // the keyboard shrinks the layout viewport so fixed bottom buttons sit above it
    interactiveWidget: "resizes-content",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = await currentTheme();
  return (
    <html lang="es" data-theme={theme} className={`${inter.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
