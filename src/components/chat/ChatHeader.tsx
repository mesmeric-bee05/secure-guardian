import { ArrowLeft, Plus, Stethoscope } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import VoiceSettings from './VoiceSettings';
import { t, Language } from '@/lib/translations';

interface VoiceOption {
  voice: SpeechSynthesisVoice;
  name: string;
  lang: string;
}

interface ChatHeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onNewChat: () => void;
  availableVoices?: VoiceOption[];
  selectedVoice?: { name: string; lang: string } | null;
  onSelectVoice?: (voiceName: string) => void;
}

const ChatHeader = ({
  language,
  onLanguageChange,
  onNewChat,
  availableVoices = [],
  selectedVoice,
  onSelectVoice,
}: ChatHeaderProps) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Stethoscope className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold text-sm">{t('chatTitle', language)}</h1>
              <p className="text-xs text-muted-foreground">{t('chatSubtitle', language)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {availableVoices.length > 0 && onSelectVoice && (
            <VoiceSettings
              language={language}
              availableVoices={availableVoices}
              selectedVoice={selectedVoice || null}
              onSelectVoice={onSelectVoice}
            />
          )}
          <ThemeToggle />
          <LanguageToggle language={language} onToggle={onLanguageChange} />
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            title={t('newChat', language)}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default ChatHeader;
