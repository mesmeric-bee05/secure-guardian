import { useState, useEffect, useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { useAuth } from '@/hooks/useAuth';
import { useChatHistory } from '@/hooks/useChatHistory';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatInput from '@/components/chat/ChatInput';
import MedicalDisclaimer from '@/components/chat/MedicalDisclaimer';
import ChatSessionsList from '@/components/chat/ChatSessionsList';
import { Language } from '@/lib/translations';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { History, X } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const Chat = () => {
  const { profile } = useAuth();
  const [language, setLanguage] = useState<Language>(
    (profile?.preferred_language as Language) || 'en'
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const {
    sessions,
    isLoading: sessionsLoading,
    fetchSessions,
    deleteSession,
  } = useChatHistory();

  const {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat({
    language,
    sessionId: activeSessionId,
    onError: (error) => toast.error(error),
    onSessionCreated: (sessionId) => {
      setActiveSessionId(sessionId);
      fetchSessions();
    },
    onTitleGenerated: () => {
      fetchSessions();
    },
  });

  const {
    isListening,
    isSpeaking,
    isSupported,
    transcript,
    availableVoices,
    selectedVoice,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    selectVoice,
  } = useVoice({ language });

  // Update language when profile loads
  useEffect(() => {
    if (profile?.preferred_language) {
      setLanguage(profile.preferred_language as Language);
    }
  }, [profile?.preferred_language]);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  const handleNewChat = useCallback(() => {
    clearMessages();
    setActiveSessionId(null);
    setShowHistory(false);
    toast.success(language === 'en' ? 'Started new chat' : 'Mazungumzo mapya yameanza');
  }, [clearMessages, language]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setShowHistory(false);
  }, []);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      clearMessages();
    }
    toast.success(language === 'en' ? 'Chat deleted' : 'Mazungumzo yamefutwa');
  }, [deleteSession, activeSessionId, clearMessages, language]);

  const handleSpeak = (text: string) => {
    // Strip markdown formatting for cleaner speech
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/`/g, '');
    speak(cleanText);
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <ChatHeader
        language={language}
        onLanguageChange={handleLanguageChange}
        onNewChat={handleNewChat}
        availableVoices={availableVoices}
        selectedVoice={selectedVoice}
        onSelectVoice={selectVoice}
      />

      {/* History Toggle for Mobile */}
      <div className="md:hidden px-4 py-2 border-b">
        <Sheet open={showHistory} onOpenChange={setShowHistory}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <History className="h-4 w-4 mr-2" />
              {language === 'en' ? 'Chat History' : 'Historia ya Mazungumzo'}
              {sessions.length > 0 && (
                <span className="ml-2 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">
                  {sessions.length}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[280px]">
            <ChatSessionsList
              sessions={sessions}
              activeSessionId={activeSessionId}
              isLoading={sessionsLoading}
              language={language}
              onSelectSession={handleSelectSession}
              onDeleteSession={handleDeleteSession}
              onNewChat={handleNewChat}
            />
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:block w-64 border-r bg-muted/30">
          <ChatSessionsList
            sessions={sessions}
            activeSessionId={activeSessionId}
            isLoading={sessionsLoading}
            language={language}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
            onNewChat={handleNewChat}
          />
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatMessageList
            messages={messages}
            isLoading={isLoading}
            language={language}
            onSpeak={isSupported ? handleSpeak : undefined}
          />
          
          <MedicalDisclaimer language={language} />
          
          <ChatInput
            language={language}
            isLoading={isLoading}
            isListening={isListening}
            isSpeaking={isSpeaking}
            isVoiceSupported={isSupported}
            transcript={transcript}
            onSend={sendMessage}
            onStop={stopGeneration}
            onStartListening={startListening}
            onStopListening={stopListening}
            onStopSpeaking={stopSpeaking}
          />
        </div>
      </div>
    </div>
  );
};

export default Chat;
