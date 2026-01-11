import { useState, FormEvent, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import VoiceButton from './VoiceButton';
import { t, Language } from '@/lib/translations';

interface ChatInputProps {
  language: Language;
  isLoading: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  isVoiceSupported: boolean;
  transcript: string;
  onSend: (message: string) => void;
  onStop: () => void;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
}

const MAX_CHARS = 2000;

const ChatInput = ({
  language,
  isLoading,
  isListening,
  isSpeaking,
  isVoiceSupported,
  transcript,
  onSend,
  onStop,
  onStartListening,
  onStopListening,
  onStopSpeaking,
}: ChatInputProps) => {
  const [input, setInput] = useState('');

  // Update input when voice transcript changes
  useEffect(() => {
    if (transcript) {
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    }
  }, [transcript]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const charsRemaining = MAX_CHARS - input.length;

  return (
    <form onSubmit={handleSubmit} className="border-t bg-background p-4">
      <div className="flex items-end gap-2">
        <VoiceButton
          isListening={isListening}
          isSpeaking={isSpeaking}
          isSupported={isVoiceSupported}
          onStartListening={onStartListening}
          onStopListening={onStopListening}
          onStopSpeaking={onStopSpeaking}
        />
        <div className="flex-1 relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleKeyDown}
            placeholder={t('typeMessage', language)}
            className="min-h-[44px] max-h-32 resize-none pr-12"
            disabled={isLoading}
            rows={1}
          />
          <span className={`absolute bottom-2 right-2 text-xs ${charsRemaining < 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {charsRemaining}
          </span>
        </div>
        {isLoading ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onStop}
            title={t('stop', language)}
          >
            <Square className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim()}
            title={t('send', language)}
          >
            <Send className="h-5 w-5" />
          </Button>
        )}
      </div>
      {isListening && (
        <p className="text-xs text-primary mt-2 flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          {t('listening', language)}
        </p>
      )}
    </form>
  );
};

export default ChatInput;
