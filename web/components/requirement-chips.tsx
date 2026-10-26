import { ExternalLink } from "lucide-react";
import { parseRequirements, requirementUrl, type RequirementTemplates } from "@/lib/requirements";
import { cn } from "./ui";

/** Chaves do Jira/Azure como chips; com modelo de URL configurado, viram links para o card. */
export function RequirementChips({ value, templates, className }: { value: string | null | undefined; templates: RequirementTemplates; className?: string }) {
  const { keys, invalid } = parseRequirements(value, templates.jiraProject);
  if (!keys.length && !invalid.length) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {keys.map((key) => {
        const url = requirementUrl(key, templates);
        const label = (
          <>
            {key}
            {url && <ExternalLink className="size-3 text-muted" aria-hidden />}
          </>
        );
        const style = "inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs font-medium";
        return url ? (
          <a key={key} href={url} target="_blank" rel="noreferrer" className={cn(style, "hover:border-accent")}>
            {label}
          </a>
        ) : (
          <span key={key} className={style}>
            {label}
          </span>
        );
      })}
      {invalid.map((t) => (
        <span key={t} className="inline-flex items-center rounded-md border border-failed/40 px-1.5 py-0.5 text-xs text-failed" title="Formato não reconhecido">
          {t}
        </span>
      ))}
    </span>
  );
}
