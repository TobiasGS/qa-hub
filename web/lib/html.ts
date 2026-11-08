// Entidades HTML em texto livre. A API do Kiwi devolve os textos com HTML escapado
// (`&quot;`, `&gt;`), embora guarde o original; e a IA às vezes também devolve entidades.

const ENTITIES: [RegExp, string][] = [
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#x27;|&#39;/g, "'"],
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"], // por último, para "&amp;lt;" virar "&lt;" e não "<"
];

/** Desfaz uma camada de entidades. */
export const decodeEntitiesOnce = (text: string) => ENTITIES.reduce((s, [re, ch]) => s.replace(re, ch), text);

/**
 * Desfaz as entidades até o texto parar de mudar (no máximo 3 camadas): limpa também
 * o texto que já foi escapado e regravado (`&amp;quot;`).
 */
export function decodeEntities(text: string | null | undefined): string {
  let s = text ?? "";
  for (let i = 0; i < 3; i++) {
    const next = decodeEntitiesOnce(s);
    if (next === s) break;
    s = next;
  }
  return s;
}
