import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface UseChatOptions {
  language?: 'en' | 'sw';
  sessionId?: string | null;
  onError?: (error: string) => void;
  onSessionCreated?: (sessionId: string) => void;
  onTitleGenerated?: (title: string) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const { language = 'en', sessionId, onError, onSessionCreated, onTitleGenerated } = options;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentSessionIdRef = useRef<string | null>(sessionId || null);
  const hasGeneratedTitle = useRef(false);

  // Load messages when sessionId changes
  useEffect(() => {
    currentSessionIdRef.current = sessionId || null;
    hasGeneratedTitle.current = false;
    
    if (sessionId && user) {
      loadMessages(sessionId);
    } else {
      setMessages([]);
    }
  }, [sessionId, user]);

  const loadMessages = async (sid: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sid)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      setMessages((data || []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })));
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const ensureSession = async (): Promise<string | null> => {
    if (currentSessionIdRef.current) return currentSessionIdRef.current;
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          language,
        })
        .select()
        .single();

      if (error) throw error;
      
      currentSessionIdRef.current = data.id;
      onSessionCreated?.(data.id);
      return data.id;
    } catch (err) {
      console.error('Failed to create session:', err);
      return null;
    }
  };

  const saveMessage = async (sid: string, role: 'user' | 'assistant', content: string) => {
    try {
      await supabase.from('chat_messages').insert({
        session_id: sid,
        role,
        content,
      });

      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sid);
    } catch (err) {
      console.error('Failed to save message:', err);
    }
  };

  const generateTitle = async (sid: string, firstMessage: string) => {
    if (hasGeneratedTitle.current) return;
    hasGeneratedTitle.current = true;

    const title = firstMessage
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50) + (firstMessage.length > 50 ? '...' : '');

    try {
      await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sid);
      
      onTitleGenerated?.(title);
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  };

  const sendMessage = useCallback(async (input: string) => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // Ensure we have a session
    const sid = await ensureSession();

    // Save user message if we have a session
    if (sid) {
      await saveMessage(sid, 'user', input);
      
      // Generate title from first message
      if (messages.length === 0) {
        generateTitle(sid, input);
      }
    }

    abortControllerRef.current = new AbortController();
    let assistantContent = '';

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [...messages, userMessage].map(m => ({
              role: m.role,
              content: m.content,
            })),
            language,
          }),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      const upsertAssistant = (nextChunk: string) => {
        assistantContent += nextChunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => 
              i === prev.length - 1 ? { ...m, content: assistantContent } : m
            );
          }
          return [...prev, { role: 'assistant', content: assistantContent }];
        });
      };

      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }

      // Save assistant response if we have a session
      if (sid && assistantContent) {
        await saveMessage(sid, 'assistant', assistantContent);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Chat error:', errorMessage);
      onError?.(errorMessage);
      
      // Add error message to chat
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: language === 'sw' 
          ? 'Samahani, kulikuwa na tatizo. Tafadhali jaribu tena.'
          : 'Sorry, there was an error. Please try again.',
      }]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, language, onError, user]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    currentSessionIdRef.current = null;
    hasGeneratedTitle.current = false;
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    clearMessages,
    setMessages,
  };
}
