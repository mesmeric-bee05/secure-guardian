import { useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface NotificationToggleProps {
  language?: 'en' | 'sw';
  className?: string;
}

const NotificationToggle = ({ language = 'en', className }: NotificationToggleProps) => {
  const { isSupported, isPermissionGranted, requestPermission } = usePushNotifications(language);
  const [isRequesting, setIsRequesting] = useState(false);

  if (!isSupported) {
    return null;
  }

  const handleToggle = async () => {
    if (isPermissionGranted) {
      toast.info(
        language === 'en'
          ? 'Notifications are already enabled'
          : 'Arifa tayari zimewezeshwa'
      );
      return;
    }

    setIsRequesting(true);
    try {
      const granted = await requestPermission();
      if (granted) {
        toast.success(
          language === 'en'
            ? 'Notifications enabled! You will receive emergency alerts.'
            : 'Arifa zimewezeshwa! Utapokea tahadhari za dharura.'
        );
      } else {
        toast.error(
          language === 'en'
            ? 'Notification permission denied. Enable in browser settings.'
            : 'Ruhusa ya arifa imekataliwa. Wezesha katika mipangilio ya kivinjari.'
        );
      }
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleToggle}
      disabled={isRequesting}
      className={cn(
        "relative transition-all",
        isPermissionGranted && "text-primary border-primary",
        className
      )}
      title={
        isPermissionGranted
          ? (language === 'en' ? 'Notifications enabled' : 'Arifa zimewezeshwa')
          : (language === 'en' ? 'Enable notifications' : 'Wezesha arifa')
      }
    >
      {isPermissionGranted ? (
        <BellRing className="h-5 w-5" />
      ) : (
        <Bell className="h-5 w-5" />
      )}
      {isPermissionGranted && (
        <span className="absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full" />
      )}
    </Button>
  );
};

export default NotificationToggle;
