import { useState } from 'react';
import { ExternalLink, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtocolVideoResourceProps {
  fallbackText: string;
  helperText: string;
  url: string;
  title: string;
  watchLabel: string;
}

function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([A-Za-z0-9_-]{6,})/,
  );
  return match ? match[1] : null;
}

const ProtocolVideoResource = ({
  url,
  title,
  watchLabel,
  helperText,
  fallbackText,
}: ProtocolVideoResourceProps) => {
  const youtubeId = getYouTubeVideoId(url);
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const thumbnail = youtubeId
    ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`
    : null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {youtubeId ? (
        <div className="relative aspect-video bg-muted">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
              title={title}
              className="h-full w-full"
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group absolute inset-0 h-full w-full"
              aria-label={`${watchLabel}: ${title}`}
            >
              {thumbnail && !thumbFailed ? (
                <img
                  src={thumbnail}
                  alt={`${title} video preview`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  onError={() => setThumbFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/30 text-primary">
                  <PlayCircle className="h-16 w-16 opacity-80" />
                </div>
              )}
              <div className="absolute inset-0 bg-foreground/10 group-hover:bg-foreground/20 transition-colors" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-background/95 text-primary shadow-lg group-hover:scale-110 transition-transform">
                  <PlayCircle className="h-8 w-8" />
                </div>
              </div>
            </button>
          )}
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center bg-muted/60 px-4 text-center text-sm text-muted-foreground">
          {fallbackText}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-background/80 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{helperText}</p>
        </div>

        <Button asChild size="sm" variant="outline">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${watchLabel}: ${title}`}
          >
            {watchLabel}
            <ExternalLink className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
};

export default ProtocolVideoResource;
