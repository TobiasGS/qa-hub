import { ApiError, apiRoute, readJson, toId } from "@/lib/api";
import type { Comment } from "@/lib/kiwi/types";
import { isTimerComment } from "@/lib/timer";
import { requireExecutionVisible } from "@/lib/visibility";

/** Comentários escritos pelas pessoas (as linhas do cronômetro ficam no histórico). */
const visible = (comments: Comment[]) => comments.filter((c) => !isTimerComment(c.comment)).sort((a, b) => a.id - b.id);

/** Comentários da execução. */
export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  return { comments: visible(await kiwi.comments(executionId)) };
});

/** Grava um comentário na execução, sem mudar o resultado: { comment }. */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const raw = await readJson(req);
  const comment = typeof raw.comment === "string" ? raw.comment.trim() : "";
  if (!comment) throw new ApiError("Escreva o comentário");
  if (comment.length > 10_000) throw new ApiError("Comentário passou de 10.000 caracteres");
  await kiwi.addComment(executionId, comment);
  return { comments: visible(await kiwi.comments(executionId)) };
});
