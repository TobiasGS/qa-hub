import { Bot, FolderKanban } from "lucide-react";
import Link from "next/link";
import { NewProjectButton } from "@/components/new-project-button";
import { ProjectAutomationButton } from "@/components/project-automation-form";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { listAutomations, toView } from "@/lib/automation-config";
import { planOptions } from "@/lib/options";
import { requireKiwi } from "@/lib/session";
import { canSeePlan, projectOwner, sameUser, visibleSet } from "@/lib/visibility";

export default async function ProjectsPage() {
  const { kiwi, viewer } = await requireKiwi();
  const visible = await visibleSet(kiwi, viewer);
  const [{ projects }, plans, automations] = await Promise.all([planOptions(kiwi, visible), kiwi.plans({ is_active: true }), listAutomations()]);

  return (
    <>
      <PageHeader
        title="Projetos"
        description="Cada projeto é um sistema testado. Configure a automação (URL, login e usuário de teste) para os testes Playwright rodarem nele."
        action={<NewProjectButton />}
      />
      {projects.length === 0 ? (
        <Card>
          <EmptyState>Nenhum projeto ainda. Crie o primeiro em Novo projeto.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => {
            const own = plans.filter((p) => p.product === project.id && canSeePlan(visible, p.id));
            const auto = automations[String(project.id)];
            const canEdit = viewer.isAdmin || sameUser(projectOwner(project), viewer.username);
            return (
              <Card key={project.id} className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                      <FolderKanban className="size-4 text-accent" aria-hidden /> {project.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {own.length} {own.length === 1 ? "plano ativo" : "planos ativos"}
                      {projectOwner(project) && ` · criado por ${projectOwner(project)}`}
                    </p>
                  </div>
                  {auto ? (
                    <Badge className="bg-passed/15">
                      <Bot className="size-3.5" aria-hidden /> Automação configurada
                    </Badge>
                  ) : (
                    <Badge>Sem automação</Badge>
                  )}
                </div>
                {auto && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted">Sistema</dt>
                    <dd className="truncate" title={auto.baseUrl}>
                      {auto.baseUrl}
                    </dd>
                    <dt className="text-muted">Testes</dt>
                    <dd className="font-mono text-xs leading-5">tests/{auto.folder}/</dd>
                    <dt className="text-muted">Usuário</dt>
                    <dd>{auto.user}</dd>
                  </dl>
                )}
                {own.length > 0 && (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {own.map((p) => (
                      <Link key={p.id} href={`/plans/${p.id}`} className="text-accent hover:underline">
                        #{p.id} {p.name}
                      </Link>
                    ))}
                  </p>
                )}
                {canEdit && (
                  <div className="mt-auto">
                    <ProjectAutomationButton projectId={project.id} projectName={project.name} current={auto ? toView(auto) : null} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
