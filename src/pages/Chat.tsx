import { useState, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { useVoice } from '@/hooks/useVoice';
import { useAuth } from '@/hooks/useAuth';
import ChatHeader from '@/components/chat/ChatHeader';
import ChatMessageList from '@/components/chat/ChatMessageList';
import ChatInput from '@/components/chat/ChatInput';
import MedicalDisclaimer from '@/components/chat/MedicalDisclaimer';
import { Language } from '@/lib/translations';
import { toast } from 'sonner';

const Chat = () => {
  const { profile } = useAuth();
  const [language, setLanguage] = useState<Language>(
    (profile?.preferred_language as Language) || 'en'
  );

  const {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    clearMessages,
  } = useChat({
    language,
    onError: (error) => toast.error(error),
  });

  const {
    isListening,
    isSpeaking,
    isSupported,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
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

  const handleNewChat = () => {
    clearMessages();
    toast.success(language === 'en' ? 'Started new chat' : 'Mazungumzo mapya yameanza');
  };

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
      />
      
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
  );
};

export default Chat;
