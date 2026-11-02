"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EVERY_MS = 15_000;

/** Run em andamento: atualiza a página sozinha (só com a aba visível) e mostra há quanto tempo. */
export function LiveRefresh() {
  const router = useRouter();
  const [last, setLast] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible" && Date.now() - last >= EVERY_MS) {
        router.refresh();
        setLast(Date.now());
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [last, router]);

  const ago = Math.max(0, Math.round((now - last) / 1000));
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-passed/15 px-2 py-0.5 text-xs font-medium" role="status" title="A página atualiza sozinha a cada 15 s enquanto o run está em andamento">
      <span className="size-2 animate-pulse rounded-full bg-passed" aria-hidden /> Ao vivo · atualizado há {ago}s
    </span>
  );
}
