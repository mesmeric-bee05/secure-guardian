import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Language } from '@/lib/translations';

interface ChatSession {
  id: string;
  title: string | null;
  language: Language;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useChatHistory() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (fetchError) throw fetchError;
      setSessions((data || []).map(s => ({
        ...s,
        language: (s.language || 'en') as Language,
      })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = useCallback(async (language: Language = 'en'): Promise<string | null> => {
    if (!user) return null;

    try {
      const { data, error: createError } = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          language,
          title: null,
        })
        .select()
        .single();

      if (createError) throw createError;
      
      setSessions(prev => [{
        ...data,
        language: (data.language || 'en') as Language,
      }, ...prev]);
      
      return data.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session');
      return null;
    }
  }, [user]);

  const updateSessionTitle = useCallback(async (sessionId: string, title: string) => {
    try {
      const { error: updateError } = await supabase
        .from('chat_sessions')
        .update({ title: title.slice(0, 100) })
        .eq('id', sessionId);

      if (updateError) throw updateError;

      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, title } : s
      ));
    } catch (err) {
      console.error('Failed to update session title:', err);
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      // Messages are deleted via cascade
      const { error: deleteError } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (deleteError) throw deleteError;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete session');
    }
  }, []);

  const fetchMessages = useCallback(async (sessionId: string): Promise<ChatMessage[]> => {
    try {
      const { data, error: fetchError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;
      
      return (data || []).map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        created_at: m.created_at || new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      return [];
    }
  }, []);

  const saveMessage = useCallback(async (
    sessionId: string, 
    role: 'user' | 'assistant', 
    content: string
  ): Promise<string | null> => {
    try {
      const { data, error: saveError } = await supabase
        .from('chat_messages')
        .insert({
          session_id: sessionId,
          role,
          content,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      // Update session's updated_at
      await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);

      return data.id;
    } catch (err) {
      console.error('Failed to save message:', err);
      return null;
    }
  }, []);

  const generateSessionTitle = useCallback((firstMessage: string): string => {
    // Take first 50 chars and clean up
    const cleaned = firstMessage
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
    
    return cleaned + (firstMessage.length > 50 ? '...' : '');
  }, []);

  return {
    sessions,
    isLoading,
    error,
    fetchSessions,
    createSession,
    updateSessionTitle,
    deleteSession,
    fetchMessages,
    saveMessage,
    generateSessionTitle,
  };
}
