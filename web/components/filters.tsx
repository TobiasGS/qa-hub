"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { inputStyles } from "./ui";

export interface FilterDef {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Filtros numa linha só, refletidos na URL (dá para compartilhar o link). */
export function Filters({ filters }: { filters: FilterDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    router.push(`${pathname}?${next}`);
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {filters.map((f) => (
        <label key={f.name} className="flex items-center gap-2 text-sm text-fg-2">
          <span className="sr-only">{f.label}</span>
          <select className={inputStyles} value={params.get(f.name) ?? ""} onChange={(e) => set(f.name, e.target.value)} aria-label={f.label}>
            <option value="">{f.label}: todos</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
