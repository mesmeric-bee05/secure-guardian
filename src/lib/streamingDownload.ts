// Streaming CSV download helper. Reports progress as chunks arrive.
export interface StreamProgress {
  bytes: number;
  rows: number; // newline count − 1 (header)
}

export interface StreamCsvOptions {
  url: string;
  token: string;
  apikey: string;
  body: unknown;
  signal?: AbortSignal;
  onProgress?: (p: StreamProgress) => void;
}

export interface StreamCsvResult {
  blob: Blob;
  filename: string;
  bytes: number;
  rows: number;
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return m?.[1] ?? fallback;
}

export async function streamCsvDownload(opts: StreamCsvOptions): Promise<StreamCsvResult> {
  const res = await fetch(opts.url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${opts.token}`,
      apikey: opts.apikey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts.body),
  });

  if (!res.ok) {
    let message = res.statusText;
    let retryAfter: string | null = res.headers.get("Retry-After");
    try {
      const j = await res.json();
      if (typeof j?.error === "string") message = j.error;
    } catch {
      try { message = (await res.text()).slice(0, 240) || message; } catch { /* noop */ }
    }
    const err = new Error(message) as Error & { status?: number; retryAfter?: string | null };
    err.status = res.status;
    err.retryAfter = retryAfter;
    throw err;
  }

  const filename = parseFilename(
    res.headers.get("Content-Disposition"),
    `security-events-${new Date().toISOString().split("T")[0]}.csv`,
  );

  const reader = res.body?.getReader();
  if (!reader) {
    const blob = await res.blob();
    return { blob, filename, bytes: blob.size, rows: 0 };
  }

  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let newlines = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      bytes += value.byteLength;
      for (let i = 0; i < value.byteLength; i++) {
        if (value[i] === 0x0a) newlines++;
      }
      opts.onProgress?.({ bytes, rows: Math.max(0, newlines - 1) });
    }
  }
  const blob = new Blob(chunks as BlobPart[], { type: "text/csv;charset=utf-8" });
  return { blob, filename, bytes, rows: Math.max(0, newlines - 1) };
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
