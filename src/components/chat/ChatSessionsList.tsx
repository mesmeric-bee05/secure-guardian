import { MessageSquare, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { formatDistanceToNow } from 'date-fns';
import { Language } from '@/lib/translations';

interface ChatSession {
  id: string;
  title: string | null;
  language: Language;
  created_at: string;
  updated_at: string;
}

interface ChatSessionsListProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  isLoading: boolean;
  language: Language;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
}

const translations = {
  en: {
    newChat: 'New Chat',
    noSessions: 'No chat history yet',
    startNew: 'Start a new conversation',
    untitled: 'Untitled Chat',
    deleteTitle: 'Delete Chat',
    deleteDescription: 'Are you sure you want to delete this chat? This action cannot be undone.',
    cancel: 'Cancel',
    delete: 'Delete',
  },
  sw: {
    newChat: 'Mazungumzo Mapya',
    noSessions: 'Hakuna historia ya mazungumzo bado',
    startNew: 'Anza mazungumzo mapya',
    untitled: 'Mazungumzo Bila Jina',
    deleteTitle: 'Futa Mazungumzo',
    deleteDescription: 'Una uhakika unataka kufuta mazungumzo haya? Kitendo hiki hakiwezi kutendeka tena.',
    cancel: 'Ghairi',
    delete: 'Futa',
  },
};

const ChatSessionsList = ({
  sessions,
  activeSessionId,
  isLoading,
  language,
  onSelectSession,
  onDeleteSession,
  onNewChat,
}: ChatSessionsListProps) => {
  const t = translations[language];

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button onClick={onNewChat} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {t.newChat}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {sessions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t.noSessions}</p>
            <p className="text-xs mt-1">{t.startNew}</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                  activeSessionId === session.id
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted'
                }`}
                onClick={() => onSelectSession(session.id)}
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {session.title || t.untitled}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(session.updated_at), { addSuffix: true })}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t.deleteDescription}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDeleteSession(session.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t.delete}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default ChatSessionsList;
