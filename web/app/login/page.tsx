import { FlaskConical } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { isMock } from "@/lib/session";

// KIWI_MODE é lido na hora do request, não no build.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
          <FlaskConical className="size-6 text-accent" aria-hidden /> QA Hub
        </div>
        <div className="rounded-xl border border-border bg-surface p-6">
          <h1 className="text-base font-semibold">Entrar</h1>
          <p className="mt-1 text-sm text-fg-2">
            {isMock() ? "Modo de exemplo: qualquer usuário entra, sem senha." : "Use seu usuário e senha do Kiwi TCMS."}
          </p>
          <LoginForm mock={isMock()} />
        </div>
      </div>
    </main>
  );
}
