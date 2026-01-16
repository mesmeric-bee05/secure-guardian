import { Bell, BellOff, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Language } from '@/lib/translations';

interface RealtimeStatusProps {
  isConnected: boolean;
  isNotificationsEnabled: boolean;
  onEnableNotifications: () => void;
  language: Language;
}

const translations = {
  en: {
    connected: 'Real-time connected',
    disconnected: 'Real-time disconnected',
    notificationsOn: 'Notifications enabled',
    notificationsOff: 'Click to enable notifications',
  },
  sw: {
    connected: 'Wakati halisi umeunganishwa',
    disconnected: 'Wakati halisi haujaungana',
    notificationsOn: 'Arifa zimewezeshwa',
    notificationsOff: 'Bofya kuwasha arifa',
  },
};

const RealtimeStatus = ({
  isConnected,
  isNotificationsEnabled,
  onEnableNotifications,
  language,
}: RealtimeStatusProps) => {
  const t = translations[language];

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
              isConnected 
                ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                : 'bg-destructive/10 text-destructive'
            }`}>
              {isConnected ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              <span className="hidden sm:inline">
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isConnected ? t.connected : t.disconnected}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${
                isNotificationsEnabled 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-muted-foreground'
              }`}
              onClick={!isNotificationsEnabled ? onEnableNotifications : undefined}
            >
              {isNotificationsEnabled ? (
                <Bell className="h-4 w-4" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isNotificationsEnabled ? t.notificationsOn : t.notificationsOff}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default RealtimeStatus;
