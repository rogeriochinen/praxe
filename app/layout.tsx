import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Praxe — O jeito da casa, escrito e em dia",
  description: "Transforme o conhecimento da empresa em processos claros, auditáveis e sempre atualizados.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body className="antialiased">{children}</body></html>;
}
