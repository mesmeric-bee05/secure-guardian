import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search } from 'lucide-react';

interface Session { id: string; title: string | null; language: string | null; created_at: string | null; updated_at: string | null; user_id: string }
interface Message { id: string; role: string; content: string; created_at: string | null }

const PAGE = 50;

export default function ChatHistoryTab() {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [language, setLanguage] = useState<'all' | 'en' | 'sw'>('all');
  const [fromDate, setFromDate] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      let ids: string[] | null = null;
      const term = applied.trim().replace(/[%_,()]/g, ' ');
      if (term) {
        const { data, error } = await supabase.from('chat_messages').select('session_id').ilike('content', `%${term}%`).limit(500);
        if (error) throw error;
        ids = Array.from(new Set((data || []).map((m) => m.session_id)));
      }
      let q = supabase.from('chat_sessions').select('id, title, language, created_at, updated_at, user_id').order('updated_at', { ascending: false }).limit(PAGE);
      if (term) {
        q = ids && ids.length ? q.or(`title.ilike.%${term}%,id.in.(${ids.join(',')})`) : q.ilike('title', `%${term}%`);
      }
      if (language !== 'all') q = q.eq('language', language);
      if (fromDate) q = q.gte('updated_at', new Date(fromDate).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      setSessions((data as Session[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load conversations');
    } finally { setLoading(false); }
  }, [applied, language, fromDate]);

  useEffect(() => { load(); }, [load]);

  const open = async (s: Session) => {
    setSelected(s); setLoadingThread(true);
    const { data } = await supabase.from('chat_messages').select('id, role, content, created_at').eq('session_id', s.id).order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    setLoadingThread(false);
    supabase.rpc('log_admin_action', { _action: 'chat_session_viewed', _resource_type: 'chat_sessions', _resource_id: s.id }).then(() => {});
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Chat History</h2>
        <p className="text-sm text-muted-foreground">Search AI chat conversations. Every conversation you open is recorded in the audit log.</p>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setApplied(query); }}>
        <Input data-testid="chat-search" placeholder="Search title or message text" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-sm" />
        <select aria-label="Language" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={language} onChange={(e) => setLanguage(e.target.value as 'all' | 'en' | 'sw')}>
          <option value="all">All languages</option><option value="en">English</option><option value="sw">Kiswahili</option>
        </select>
        <Input type="date" aria-label="From date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-44" />
        <Button type="submit"><Search className="w-4 h-4 mr-2" />Search</Button>
      </form>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Conversations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> :
              error ? <p className="text-sm text-destructive">{error}</p> :
              sessions.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="chat-empty">No conversations found.</p> :
              sessions.map((s) => (
                <button key={s.id} data-testid="chat-session-row" onClick={() => open(s)} className={`w-full text-left rounded-lg border p-3 transition-colors ${selected?.id === s.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground truncate">{s.title || 'Untitled conversation'}</span>
                    <Badge variant="outline">{(s.language || 'en').toUpperCase()}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.updated_at ? new Date(s.updated_at).toLocaleString() : ''}</p>
                </button>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{selected ? selected.title || 'Untitled conversation' : 'Select a conversation'}</CardTitle></CardHeader>
          <CardContent className="space-y-3 max-h-[600px] overflow-auto">
            {loadingThread ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> :
              selected && messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages saved.</p> :
              messages.map((m) => (
                <div key={m.id} data-testid="chat-thread-message" className={`rounded-lg p-3 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary/10' : 'bg-muted'}`}>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">{m.role === 'user' ? 'User' : 'Assistant'}</p>
                  {m.content}
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
