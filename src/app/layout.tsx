import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import { ErrorReporter } from "@/components/ErrorReporter";
import { COLOR_COOKIE, THEME_COOKIE, appleStatusBarStyle, parseColor, parseTheme, themeColorFor } from "@/lib/theme";
import { resolveSiteUrl } from "@/lib/site-metadata-url";
import "./globals.css";

const SITE_DESCRIPTION = "Marca tus hábitos, sube una foto cuando toca y lleva la cuenta entre amigos.";

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
    metadataBase: resolveSiteUrl(),
    title: { default: "Kizuna", template: "%s · Kizuna" },
    description: SITE_DESCRIPTION,
    openGraph: {
      type: "website",
      siteName: "Kizuna",
      locale: "es_CL",
      title: "Kizuna",
      description: SITE_DESCRIPTION,
    },
    twitter: {
      card: "summary_large_image",
      title: "Kizuna",
      description: SITE_DESCRIPTION,
    },
    applicationName: "Kizuna",
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
  const color = parseColor((await cookies()).get(COLOR_COOKIE)?.value);
  return (
    <html lang="es" data-theme={theme} data-color={color} className={`${inter.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <ErrorReporter />
        {children}
      </body>
    </html>
  );
}
