import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { Toaster } from "sonner";
import { I18nProvider } from "@/i18n/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// Covers both Latin and Thai so the two languages share one typeface.
const appFont = IBM_Plex_Sans_Thai({
  variable: "--font-app",
  subsets: ["latin", "thai"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Stockyaa", template: "%s · Stockyaa" },
  description: "Multi-tenant pharmacy management: stock, purchases, sales and reports.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // "light" / "dark" when the user picked one; otherwise the system preference applies.
  const savedTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const themeClass = savedTheme === "dark" || savedTheme === "light" ? savedTheme : "";
  return (
    // The theme toggle changes the class on <html> directly, hence suppressHydrationWarning.
    <html
      lang={locale}
      className={`${appFont.variable} ${themeClass} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full font-sans">
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              classNames: {
                toast: "!bg-card !text-card-foreground !border-border",
                description: "!text-muted-foreground",
              },
            }}
          />
        </I18nProvider>
      </body>
    </html>
  );
}
