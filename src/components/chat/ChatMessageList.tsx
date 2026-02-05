import { useEffect, useRef } from 'react';
import { Bot, User, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t, Language } from '@/lib/translations';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatMessageListProps {
  messages: Message[];
  isLoading: boolean;
  language: Language;
  onSpeak?: (text: string) => void;
  onSendPrompt?: (prompt: string) => void;
}

const suggestedPrompts = {
  en: [
    "My child has a high fever, what should I do?",
    "How do I treat a minor burn?",
    "What are signs of dehydration?",
    "How to help someone who is choking?",
  ],
  sw: [
    "Mtoto wangu ana homa kali, nifanye nini?",
    "Ninatibu vipi kuchomwa kidogo?",
    "Ishara za upungufu wa maji mwilini ni zipi?",
    "Jinsi ya kusaidia mtu anayekaba?",
  ],
};

const ChatMessageList = ({ messages, isLoading, language, onSpeak, onSendPrompt }: ChatMessageListProps) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">{t('welcomeChat', language)}</h2>
        <p className="text-muted-foreground text-sm mb-6 max-w-sm">
          {t('chatDescription', language)}
        </p>
        <div className="w-full max-w-md space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
            {t('suggestedPrompts', language)}
          </p>
          {suggestedPrompts[language].map((prompt, index) => (
            <button
              key={index}
              onClick={() => onSendPrompt?.(prompt)}
              className="w-full text-left p-3 rounded-lg border bg-card hover:bg-accent transition-colors text-sm"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message, index) => (
        <div
          key={index}
          className={cn(
            "flex gap-3",
            message.role === 'user' ? "justify-end" : "justify-start"
          )}
        >
          {message.role === 'assistant' && (
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
          )}
          <div
            className={cn(
              "max-w-[80%] rounded-2xl px-4 py-2.5",
              message.role === 'user'
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted rounded-bl-md"
            )}
          >
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
            {message.role === 'assistant' && onSpeak && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-2 text-xs gap-1"
                onClick={() => onSpeak(message.content)}
              >
                <Volume2 className="h-3 w-3" />
                {t('listenToResponse', language)}
              </Button>
            )}
          </div>
          {message.role === 'user' && (
            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-secondary-foreground" />
            </div>
          )}
        </div>
      ))}
      
      {isLoading && (
        <div className="flex gap-3 justify-start">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
            <div className="flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
      
      <div ref={bottomRef} />
    </div>
  );
};

export default ChatMessageList;
