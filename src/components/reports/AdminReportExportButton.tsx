import { useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  streamCsvDownload,
  triggerBlobDownload,
  formatBytes,
  CsvExportError,
  type StreamProgress,
} from "@/lib/streamingDownload";

type Dataset = "cases" | "sms" | "security" | "protocols";

interface Props {
  dataset: Dataset;
  since: string; // ISO
  until?: string; // ISO
  label?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export function AdminReportExportButton({ dataset, since, until, label }: Props) {
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  const run = async () => {
    setBusy(true);
    setProgress({ bytes: 0, rows: 0 });
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("Not authenticated");
        return;
      }
      const result = await streamCsvDownload({
        url: `${SUPABASE_URL}/functions/v1/reports-export`,
        token: session.access_token,
        apikey: ANON_KEY,
        body: { dataset, since, until },
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      });
      triggerBlobDownload(result.blob, result.filename);
      toast.success(`Exported ${result.rows.toLocaleString()} rows (${formatBytes(result.bytes)})`);
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") {
        toast.message("Export cancelled");
      } else if (e instanceof CsvExportError) {
        toast.error(`Export failed: ${e.message}${e.status ? ` (HTTP ${e.status})` : ""}`);
      } else {
        toast.error(`Export failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    } finally {
      setBusy(false);
      setProgress(null);
      ctrlRef.current = null;
    }
  };

  const cancel = () => ctrlRef.current?.abort();

  const retryInfo = progress?.retrying;

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
        {label ?? `Export ${dataset}`}
      </Button>
      {busy && progress && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {retryInfo
            ? `Rate-limited, retrying in ${retryInfo.secondsLeft}s (attempt ${retryInfo.attempt}/${retryInfo.maxAttempts})`
            : `${progress.rows.toLocaleString()} rows • ${formatBytes(progress.bytes)}`}
        </span>
      )}
      {busy && (
        <Button variant="ghost" size="icon" onClick={cancel} aria-label="Cancel export">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
