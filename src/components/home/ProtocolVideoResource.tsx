import { ExternalLink, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtocolVideoResourceProps {
  url: string;
  title: string;
  watchLabel: string;
}

function getYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?\s]+)/);
  return match ? match[1] : null;
}

function getVideoThumbnail(url: string): string | null {
  const youtubeId = getYouTubeVideoId(url);
  return youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null;
}

const ProtocolVideoResource = ({ url, title, watchLabel }: ProtocolVideoResourceProps) => {
  const thumbnail = getVideoThumbnail(url);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {thumbnail ? (
        <div className="relative aspect-video bg-muted">
          <img
            src={thumbnail}
            alt={`${title} video preview`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-foreground/10" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background/95 text-primary shadow-lg">
              <PlayCircle className="h-8 w-8" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center bg-muted/60 px-4 text-center text-sm text-muted-foreground">
          Open the trusted training video resource in a new tab.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-background/80 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">Trusted external training resource</p>
        </div>

        <Button asChild size="sm">
          <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${watchLabel}: ${title}`}>
            {watchLabel}
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
};

export default ProtocolVideoResource;