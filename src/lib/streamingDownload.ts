// Streaming CSV download helper. Reports progress as chunks arrive and
// auto-retries on 429 using the Retry-After header.
export interface StreamProgress {
  bytes: number;
  rows: number; // newline count − 1 (header)
  retrying?: { attempt: number; maxAttempts: number; secondsLeft: number };
}

export interface StreamCsvOptions {
  url: string;
  token: string;
  apikey: string;
  body: unknown;
  signal?: AbortSignal;
  onProgress?: (p: StreamProgress) => void;
  /** Max number of automatic retries on 429. Default 3. */
  maxRetries?: number;
  /** Hard ceiling on Retry-After honoring (seconds). Default 30. */
  maxRetryAfterSeconds?: number;
}

export interface StreamCsvResult {
  blob: Blob;
  filename: string;
  bytes: number;
  rows: number;
  retries: number;
}

export class CsvExportError extends Error {
  status?: number;
  retryAfter?: string | null;
  constructor(message: string, status?: number, retryAfter?: string | null) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function parseFilename(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return m?.[1] ?? fallback;
}

function sleepWithCountdown(
  seconds: number,
  signal: AbortSignal | undefined,
  onTick: (secondsLeft: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    let left = seconds;
    onTick(left);
    const handle = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(handle);
        signal?.removeEventListener("abort", onAbort);
        resolve();
      } else {
        onTick(left);
      }
    }, 1000);
    const onAbort = () => {
      clearInterval(handle);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function streamCsvDownload(opts: StreamCsvOptions): Promise<StreamCsvResult> {
  const maxRetries = opts.maxRetries ?? 3;
  const maxWait = opts.maxRetryAfterSeconds ?? 30;
  let attempt = 0;
  let retries = 0;

  while (true) {
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

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfterRaw = res.headers.get("Retry-After");
      const wait = Math.max(1, Math.min(maxWait, Number(retryAfterRaw) || 1));
      try { await res.text(); } catch { /* noop */ }
      attempt++;
      retries++;
      await sleepWithCountdown(wait, opts.signal, (left) => {
        opts.onProgress?.({
          bytes: 0,
          rows: 0,
          retrying: { attempt, maxAttempts: maxRetries, secondsLeft: left },
        });
      });
      continue;
    }

    if (!res.ok) {
      let message = res.statusText;
      const retryAfter = res.headers.get("Retry-After");
      try {
        const j = await res.json();
        if (typeof j?.error === "string") message = j.error;
      } catch {
        try { message = (await res.text()).slice(0, 240) || message; } catch { /* noop */ }
      }
      throw new CsvExportError(message, res.status, retryAfter);
    }

    const filename = parseFilename(
      res.headers.get("Content-Disposition"),
      `security-events-${new Date().toISOString().split("T")[0]}.csv`,
    );

    const reader = res.body?.getReader();
    if (!reader) {
      const blob = await res.blob();
      return { blob, filename, bytes: blob.size, rows: 0, retries };
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
    return { blob, filename, bytes, rows: Math.max(0, newlines - 1), retries };
  }
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
