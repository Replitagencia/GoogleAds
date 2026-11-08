import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgenciaLabs · Portal de campañas",
  description: "Tus campañas de Google Ads, con claridad. Portal de resultados de AgenciaLabs.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
