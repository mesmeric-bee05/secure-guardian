import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface VoiceOption {
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
}

interface VoiceSettingsProps {
  language: 'en' | 'sw';
  availableVoices: VoiceOption[];
  selectedVoice: { name: string; lang: string } | null;
  onSelectVoice: (voiceName: string) => void;
  className?: string;
}

const VoiceSettings = ({
  language,
  availableVoices,
  selectedVoice,
  onSelectVoice,
  className,
}: VoiceSettingsProps) => {
  if (availableVoices.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn("relative", className)}
          title={language === 'en' ? 'Voice settings' : 'Mipangilio ya sauti'}
        >
          <Settings2 className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {language === 'en' ? 'Select Voice' : 'Chagua Sauti'}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableVoices.map((voiceOption) => (
          <DropdownMenuItem
            key={voiceOption.name}
            onClick={() => onSelectVoice(voiceOption.name)}
            className={cn(
              "flex items-center justify-between",
              selectedVoice?.name === voiceOption.name && "bg-accent"
            )}
          >
            <span className="truncate">{voiceOption.name}</span>
            <span className="text-xs text-muted-foreground ml-2">
              {voiceOption.lang}
            </span>
          </DropdownMenuItem>
        ))}
        {availableVoices.length === 0 && (
          <DropdownMenuItem disabled>
            {language === 'en' ? 'No voices available' : 'Hakuna sauti zinazopatikana'}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default VoiceSettings;
