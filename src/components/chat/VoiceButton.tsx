import { Mic, MicOff, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface VoiceButtonProps {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
  className?: string;
}

const VoiceButton = ({
  isListening,
  isSpeaking,
  isSupported,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  className,
}: VoiceButtonProps) => {
  if (!isSupported) {
    return null;
  }

  if (isSpeaking) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={onStopSpeaking}
        className={cn("relative", className)}
        title="Stop speaking"
      >
        <Volume2 className="h-5 w-5 text-primary animate-pulse" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={isListening ? "default" : "outline"}
      size="icon"
      onClick={isListening ? onStopListening : onStartListening}
      className={cn(
        "relative transition-all",
        isListening && "bg-destructive hover:bg-destructive/90",
        className
      )}
      title={isListening ? "Stop listening" : "Start voice input"}
    >
      {isListening ? (
        <>
          <MicOff className="h-5 w-5" />
          <span className="absolute -top-1 -right-1 h-3 w-3 bg-destructive rounded-full animate-ping" />
        </>
      ) : (
        <Mic className="h-5 w-5" />
      )}
    </Button>
  );
};

export default VoiceButton;
