"use client";

// Files on a reply. Picked in the browser, sent once inside the email, never kept in
// browser storage: the thread records only names and sizes.

import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
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

// The limits, applied to what is already picked plus what is being added. Same rule for
// the button, a dropped file and a pasted screenshot.
export function acceptFiles(current: File[], incoming: File[]): { files: File[]; error: string | null } {
  if (!incoming.length) return { files: current, error: null };
  const next = [...current, ...incoming];
  if (next.length > MAX_FILES) return { files: current, error: `Up to ${MAX_FILES} files on one reply.` };
  const total = next.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL_BYTES) return { files: current, error: `Attachments are limited to ${fmtSize(MAX_TOTAL_BYTES)} in total on this prototype.` };
  return { files: next, error: null };
}

// Files on the clipboard. A pasted image arrives as "image.png"; give it a name the guest
// can make sense of.
export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data?.files?.length) return [];
  return Array.from(data.files).map((f) => {
    if (!/^image\.\w+$/i.test(f.name) || !f.type.startsWith("image/")) return f;
    const now = new Date();
    const stamp = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const ext = f.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return new File([f], `screenshot-${stamp}.${ext}`, { type: f.type });
  });
}

// Drop a file on the reply box, or paste a screenshot into it. Pasting text is untouched.
export function useAttachDrop(enabled: boolean, files: File[], onChange: (files: File[], error: string | null) => void) {
  const [dragging, setDragging] = useState(false);
  const take = (incoming: File[]) => {
    const r = acceptFiles(files, incoming);
    onChange(r.files, r.error);
  };
  const handlers = enabled
    ? {
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: DragEvent) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          take(Array.from(e.dataTransfer.files));
        },
        onPaste: (e: ClipboardEvent) => {
          const picked = filesFromClipboard(e.clipboardData);
          if (!picked.length) return;
          e.preventDefault();
          take(picked);
        },
      }
    : {};
  return { dragging: enabled && dragging, handlers };
}

export function AttachmentPicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[], error: string | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const add = (picked: FileList | null) => {
    if (!picked) return;
    const r = acceptFiles(files, Array.from(picked));
    onChange(r.files, r.error);
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
