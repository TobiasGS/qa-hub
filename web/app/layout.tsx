import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QA Hub",
  description: "Casos, execuções e rastreabilidade sobre o Kiwi TCMS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Extensões do navegador (ex.: Testim, Grammarly) injetam atributos no <html>/<body> antes do React
    // carregar. suppressHydrationWarning ignora só os atributos destas duas tags, não o conteúdo das páginas.
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
