import { useState } from 'react';
import { WifiOff, RefreshCw, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';
import { cn } from '@/lib/utils';

interface OfflineBannerProps {
  language: 'en' | 'sw';
  pendingCount?: number;
}

const OfflineBanner = ({ language, pendingCount = 0 }: OfflineBannerProps) => {
  const isOffline = useOfflineStatus();
  const { triggerSync, isSyncing } = useBackgroundSync({ language });
  const [lastSyncTime] = useState<Date | null>(null);

  if (!isOffline && pendingCount === 0) return null;

  return (
    <div className={cn(
      'px-4 py-2 text-sm flex items-center justify-between gap-2',
      isOffline 
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-b border-amber-500/20'
        : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-b border-blue-500/20'
    )}>
      <div className="flex items-center gap-2">
        {isOffline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              {language === 'en' ? 'You are offline' : 'Uko nje ya mtandao'}
              {pendingCount > 0 && (
                <span className="ml-1 font-medium">
                  ({pendingCount} {language === 'en' ? 'pending' : 'zinasubiri'})
                </span>
              )}
            </span>
          </>
        ) : (
          <>
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              {pendingCount} {language === 'en' ? 'items waiting to sync' : 'vitu vinasubiri kusawazisha'}
            </span>
          </>
        )}
      </div>

      {!isOffline && pendingCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => triggerSync()}
          disabled={isSyncing}
          className="h-7 px-2"
        >
          <RefreshCw className={cn('h-3 w-3 mr-1', isSyncing && 'animate-spin')} />
          {language === 'en' ? 'Sync' : 'Sawazisha'}
        </Button>
      )}
    </div>
  );
};

export default OfflineBanner;
