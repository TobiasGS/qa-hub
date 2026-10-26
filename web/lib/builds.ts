// Build seguinte para um novo run: incrementa o último número do nome.
//   1 → 2 · 1.0.0 → 1.0.1 · 1.9.0-rc1 → 1.9.0-rc2 · beta → beta-2 · (nada) → 1

export function nextBuildName(name: string | null | undefined): string {
  const current = (name ?? "").trim();
  if (!current || current === "unspecified") return "1";
  const m = current.match(/^(.*?)(\d+)(\D*)$/);
  if (!m) return `${current}-2`;
  const [, prefix, digits, suffix] = m;
  const next = String(Number(digits) + 1).padStart(digits.length, "0");
  return `${prefix}${next}${suffix}`;
}
