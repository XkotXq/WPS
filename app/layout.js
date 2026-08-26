import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { Providers } from "./providers";
import { ThemeProvider } from "./theme-provider";

const satoshi = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/satoshi/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/satoshi/Satoshi-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/satoshi/Satoshi-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/satoshi/Satoshi-Black.woff2", weight: "900", style: "normal" },
  ],
});

export const metadata = {
  title: "WMS",
  description: "Warehouse Management System",
};

export default async function RootLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${satoshi.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <Providers>{children}</Providers>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
