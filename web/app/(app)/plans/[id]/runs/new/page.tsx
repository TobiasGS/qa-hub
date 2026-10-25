import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RunForm } from "@/components/run-form";
import { PageHeader } from "@/components/ui";
import { requireKiwi } from "@/lib/session";
import { canEditPlan } from "@/lib/visibility";

export default async function NewRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { kiwi, username, viewer } = await requireKiwi();
  const id = Number((await params).id);
  const [[plan], cases, users] = await Promise.all([kiwi.plans({ id }), kiwi.cases({ plan: id }), kiwi.users()]);
  if (!plan || !canEditPlan(viewer, plan)) notFound();
  const builds = await kiwi.builds({ version: plan.product_version });
  const me = users.find((u) => u.username === username)?.id ?? null;

  return (
    <>
      <Link href={`/plans/${plan.id}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> {plan.name}
      </Link>
      <div className="mt-1">
        <PageHeader title="Novo run" description="Escolha a build, os casos e quem testa cada um." />
      </div>
      <RunForm
        plan={plan}
        cases={cases.filter((c) => c.case_status__name !== "DISABLED").sort((a, b) => a.id - b.id)}
        builds={builds.filter((b) => b.is_active)}
        users={users.filter((u) => u.username !== "ci-bot")}
        me={me}
      />
    </>
  );
}
