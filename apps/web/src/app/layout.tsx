import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Aetherfall", template: "%s · Aetherfall" },
  description: "Интерактивные истории с AI-рассказчиком: ранобэ, визуальные новеллы, текстовые RPG.",
};

export const viewport: Viewport = { themeColor: "#07080d", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
