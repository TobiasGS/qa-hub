"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Build, TestRun } from "@/lib/kiwi/types";
import { send } from "@/lib/client-api";
import { Dialog } from "./dialog";
import { Field, FormFooter, Select } from "./form";
import { Button } from "./ui";

export function RetestButton({ run, failedCount, builds }: { run: TestRun; failedCount: number; builds: Build[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { run: created } = await send<{ run: TestRun }>(`/api/runs/${run.id}/retest`, "POST", { build: Number(new FormData(e.currentTarget).get("build")) });
      router.push(`/runs/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <RotateCcw className="size-4" /> Re-testar falhas ({failedCount})
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Re-testar falhas" description={`Cria um run novo com os ${failedCount} casos que falharam ou ficaram bloqueados.`}>
        <form onSubmit={onSubmit}>
          <Field label="Build do re-teste" hint="Normalmente a build com a correção.">
            <Select
              name="build"
              defaultValue={run.build}
              options={[...builds].sort((a, b) => b.id - a.id).map((b) => ({ value: b.id, label: b.id === run.build ? `${b.name} (a mesma)` : b.name }))}
            />
          </Field>
          <FormFooter busy={busy} error={error} submitLabel="Criar re-teste" onCancel={() => setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}
