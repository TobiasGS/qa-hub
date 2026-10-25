"use client";

import { ExternalLink, FileText, Loader2, Paperclip, Play, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { LinkReference } from "@/lib/kiwi/types";
import { EVIDENCE_ACCEPT, evidenceName, evidencePath, formatBytes, typeOf } from "@/lib/evidence/shared";
import { send } from "@/lib/client-api";
import { ConfirmDialog, Dialog } from "./dialog";
import { Button, cn } from "./ui";

interface Upload {
  id: string;
  name: string;
  progress: number;
  error?: string;
}

/** Envia o arquivo cru com XHR, para ter barra de progresso. */
function uploadFile(executionId: number, file: File, onProgress: (p: number) => void): Promise<LinkReference> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/executions/${executionId}/evidence?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(body.link);
      else reject(new Error(body.error ?? `Erro ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Falha de rede no envio"));
    xhr.send(file);
  });
}

export function EvidencePanel({
  executionId,
  evidence,
  onAdded,
  onRemoved,
}: {
  executionId: number;
  evidence: LinkReference[];
  onAdded: (link: LinkReference) => void;
  onRemoved: (linkId: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<LinkReference | null>(null);
  const [removing, setRemoving] = useState<LinkReference | null>(null);

  async function addFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      const type = typeOf(file.name);
      const error = !type
        ? "Tipo não aceito"
        : file.size > type.maxBytes
          ? `${formatBytes(file.size)} passa do limite de ${formatBytes(type.maxBytes)}`
          : undefined;
      setUploads((u) => [...u, { id, name: file.name, progress: 0, error }]);
      if (error) continue;
      try {
        const link = await uploadFile(executionId, file, (progress) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, progress } : x))));
        onAdded(link);
        setUploads((u) => u.filter((x) => x.id !== id));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: (e as Error).message } : x)));
      }
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-2">Evidências {evidence.length > 0 && <span className="tabular">({evidence.length})</span>}</span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn("rounded-lg border border-dashed border-border p-3 transition", dragging && "border-accent bg-accent/10")}
      >
        {evidence.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {evidence.map((l) => (
              <li key={l.id}>
                <button onClick={() => setViewing(l)} className="group relative block aspect-video w-full overflow-hidden rounded-md border border-border bg-surface-2" title={evidenceName(l)}>
                  <Thumb link={l} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {uploads.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {uploads.map((u) => (
              <li key={u.id} className="text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{u.name}</span>
                  {u.error ? (
                    <button className="shrink-0 text-muted hover:text-fg" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}>
                      dispensar
                    </button>
                  ) : (
                    <span className="shrink-0 tabular text-muted">{Math.round(u.progress * 100)}%</span>
                  )}
                </div>
                {u.error ? (
                  <p className="text-failed">{u.error}</p>
                ) : (
                  <div className="mt-1 h-1 rounded-full bg-surface-2">
                    <div className="h-1 rounded-full bg-accent transition-all" style={{ width: `${u.progress * 100}%` }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <Button type="button" onClick={() => inputRef.current?.click()} className="h-8">
            <Upload className="size-3.5" /> Anexar
          </Button>
          <span>ou arraste prints, vídeos (até 100 MB), PDF e logs aqui</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EVIDENCE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <Dialog open={!!viewing} onClose={() => setViewing(null)} title={viewing ? evidenceName(viewing) : ""} wide>
        {viewing && (
          <>
            <Viewer key={viewing.id} link={viewing} />
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <a href={evidencePath(viewing)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-fg-2 hover:text-fg">
                Abrir em nova aba <ExternalLink className="size-3.5" />
              </a>
              <Button
                className="text-failed"
                onClick={() => {
                  setRemoving(viewing);
                  setViewing(null);
                }}
              >
                <Trash2 className="size-4" /> Remover
              </Button>
            </div>
          </>
        )}
      </Dialog>

      {removing && (
        <ConfirmDialog
          open
          onClose={() => setRemoving(null)}
          title="Remover evidência?"
          confirmLabel="Remover"
          danger
          message={
            <p>
              <b>{evidenceName(removing)}</b> será apagada do armazenamento e o link sai da execução no Kiwi.
            </p>
          }
          onConfirm={async () => {
            await send(`/api/executions/${executionId}/evidence?link=${removing.id}`, "DELETE");
            onRemoved(removing.id);
          }}
        />
      )}
    </div>
  );
}

function Thumb({ link }: { link: LinkReference }) {
  const kind = typeOf(evidenceName(link))?.kind ?? "file";
  const src = evidencePath(link);
  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- arquivo privado servido pela própria API, sem otimização do Next
    return <img src={src} alt={evidenceName(link)} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />;
  }
  if (kind === "video") {
    return (
      <>
        <video src={`${src}#t=0.5`} preload="metadata" muted className="size-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/30">
          <Play className="size-6 fill-white text-white" aria-hidden />
        </span>
      </>
    );
  }
  return (
    <span className="flex size-full flex-col items-center justify-center gap-1 p-1 text-muted">
      <FileText className="size-5" aria-hidden />
      <span className="w-full truncate text-center text-[10px]">{evidenceName(link)}</span>
    </span>
  );
}

function Viewer({ link }: { link: LinkReference }) {
  const kind = typeOf(evidenceName(link))?.kind ?? "file";
  const src = evidencePath(link);
  const [loaded, setLoaded] = useState(kind !== "image");
  if (kind === "image") {
    return (
      <div className="relative flex min-h-40 items-center justify-center rounded-lg bg-surface-2">
        {!loaded && <Loader2 className="absolute size-5 animate-spin text-muted" />}
        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo privado servido pela própria API */}
        <img src={src} alt={evidenceName(link)} onLoad={() => setLoaded(true)} className="max-h-[65vh] w-auto rounded-lg" />
      </div>
    );
  }
  if (kind === "video") return <video src={src} controls autoPlay className="max-h-[65vh] w-full rounded-lg bg-black" />;
  if (evidenceName(link).toLowerCase().endsWith(".pdf")) return <iframe src={src} title={evidenceName(link)} className="h-[65vh] w-full rounded-lg border border-border" />;
  return (
    <p className="flex items-center gap-2 text-sm text-fg-2">
      <Paperclip className="size-4" /> Arquivo sem pré-visualização. Use &quot;Abrir em nova aba&quot;.
    </p>
  );
}
