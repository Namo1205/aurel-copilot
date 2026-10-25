"use client";

// Files on a reply. Picked in the browser, sent once inside the email, never kept in
// browser storage: the thread records only names and sizes.

import { useRef } from "react";
import type { InboundMessage } from "@/lib/inbox/seed";

export const MAX_FILES = 3;
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024; // base64 adds a third; Vercel accepts about 4.5 MB per request

export interface OutgoingAttachment {
  name: string;
  mimeType: string;
  dataBase64: string;
  size: number;
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function encodeFiles(files: File[]): Promise<OutgoingAttachment[]> {
  return Promise.all(
    files.map(
      (f) =>
        new Promise<OutgoingAttachment>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error(`Could not read ${f.name}`));
          reader.onload = () => resolve({ name: f.name, mimeType: f.type || "application/octet-stream", dataBase64: String(reader.result).split(",")[1] ?? "", size: f.size });
          reader.readAsDataURL(f);
        }),
    ),
  );
}

export function AttachmentPicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[], error: string | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const add = (picked: FileList | null) => {
    if (!picked) return;
    const next = [...files, ...Array.from(picked)].slice(0, MAX_FILES + 1);
    if (next.length > MAX_FILES) return onChange(files, `Up to ${MAX_FILES} files on one reply.`);
    const total = next.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL_BYTES) return onChange(files, `Attachments are limited to ${fmtSize(MAX_TOTAL_BYTES)} in total on this prototype.`);
    onChange(next, null);
  };
  return (
    <span className="flex items-center gap-1.5 flex-wrap">
      <input ref={input} type="file" multiple className="hidden" aria-label="Attach files" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="text-xs text-stone-600 hover:text-stone-900 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stone-200 hover:bg-stone-50 disabled:opacity-50" title={`Attach up to ${MAX_FILES} files, ${fmtSize(MAX_TOTAL_BYTES)} in total. Sent with the reply, not kept on the desk.`}>
        <PaperclipIcon /> Attach
      </button>
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 text-xs bg-stone-100 text-stone-700 rounded-full pl-2 pr-1 py-0.5">
          {f.name} <span className="text-stone-400">· {fmtSize(f.size)}</span>
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i), null)} className="h-4 w-4 grid place-items-center rounded-full hover:bg-stone-200 text-stone-500" aria-label={`Remove ${f.name}`}>
            ×
          </button>
        </span>
      ))}
    </span>
  );
}

export function PaperclipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

// The files a guest sent, opened through the desk so the mailbox login stays on the server.
export function InboundAttachments({ message }: { message: InboundMessage }) {
  if (!message.attachments?.length || !message.gmail) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {message.attachments.map((a) => (
        <a
          key={a.id}
          href={`/api/gmail/attachment?messageId=${encodeURIComponent(message.gmail!.id)}&id=${encodeURIComponent(a.id)}&name=${encodeURIComponent(a.name)}&type=${encodeURIComponent(a.mimeType)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs bg-stone-50 border border-stone-200 text-stone-700 rounded-full px-2 py-0.5 hover:bg-stone-100"
          title="Opens the file from the mailbox. Aurel Assistant does not read attachments."
        >
          <PaperclipIcon /> {a.name} <span className="text-stone-400">· {fmtSize(a.size)}</span>
        </a>
      ))}
    </div>
  );
}
