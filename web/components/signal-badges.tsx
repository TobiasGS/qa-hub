import { SIGNAL_LABEL, type SignalTag } from "@/lib/diagnosis";
import { Badge, cn } from "./ui";

const STYLE: Record<SignalTag, string> = {
  regression: "bg-failed/15 text-failed-text",
  recurring: "bg-blocked/20",
  flaky: "bg-accent/15 text-accent",
  new: "",
  no_bug: "border border-border bg-transparent",
};

const HINT: Record<SignalTag, string> = {
  regression: "Passava na build anterior e falhou nesta",
  recurring: "Falhou em 2 ou mais das últimas 5 execuções",
  flaky: "Alterna entre passou e falhou: pode ser teste instável",
  new: "Primeira execução deste caso",
  no_bug: "Falhou e ainda não tem bug vinculado",
};

/** Selos dos sinais de uma falha (texto + cor; nunca só cor). */
export function SignalBadges({ tags, lastPassBuild }: { tags: SignalTag[]; lastPassBuild?: string | null }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <Badge key={t} className={cn(STYLE[t])} title={t === "regression" && lastPassBuild ? `${HINT[t]} (passou na build ${lastPassBuild})` : HINT[t]}>
          {SIGNAL_LABEL[t]}
        </Badge>
      ))}
    </span>
  );
}
