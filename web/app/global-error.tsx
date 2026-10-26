"use client";

// Erro fora das páginas (ex.: no layout). Sem os estilos do app: precisa funcionar sozinho.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, background: "#111", color: "#eee" }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Não foi possível carregar o QA Hub</h1>
          <p style={{ fontSize: 14, opacity: 0.8 }}>Tente de novo. Se continuar, entre de novo: às vezes a sessão no Kiwi expira.</p>
          <p style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={reset} style={{ padding: "8px 14px", cursor: "pointer" }}>
              Tentar de novo
            </button>
            <a href="/api/auth/expired" style={{ padding: "8px 14px", color: "inherit", border: "1px solid #555" }}>
              Entrar de novo
            </a>
          </p>
          {error.digest && <p style={{ fontSize: 12, opacity: 0.6 }}>Código para suporte: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
