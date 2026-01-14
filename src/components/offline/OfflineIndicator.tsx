import { useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  language?: 'en' | 'sw';
}

const OfflineIndicator = ({ language = 'en' }: OfflineIndicatorProps) => {
  const { isOnline, wasOffline, clearWasOffline } = useOfflineStatus();

  useEffect(() => {
    if (!isOnline) {
      toast.error(
        language === 'en' 
          ? 'You are offline. Some features may be limited.' 
          : 'Huna mtandao. Baadhi ya huduma zinaweza kuwa na vikwazo.',
        { duration: 5000, id: 'offline-toast' }
      );
    } else if (wasOffline) {
      toast.success(
        language === 'en'
          ? 'Back online!'
          : 'Umerudi mtandaoni!',
        { duration: 3000, id: 'online-toast' }
      );
      clearWasOffline();
    }
  }, [isOnline, wasOffline, language, clearWasOffline]);

  if (isOnline) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 px-4",
        "bg-destructive text-destructive-foreground",
        "animate-in slide-in-from-top duration-300"
      )}
    >
      <WifiOff className="h-4 w-4" />
      <span className="text-sm font-medium">
        {language === 'en' ? 'Offline Mode' : 'Hali ya Nje ya Mtandao'}
      </span>
    </div>
  );
};

export default OfflineIndicator;
