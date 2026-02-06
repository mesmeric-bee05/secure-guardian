import { useState } from 'react';
import { Bell, Loader2, Check, X, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface OnboardingNotificationsProps {
  language: 'en' | 'sw';
  onComplete: (notificationsEnabled: boolean) => void;
  onBack: () => void;
}

const OnboardingNotifications = ({ language, onComplete, onBack }: OnboardingNotificationsProps) => {
  const { isSupported, isPermissionGranted, requestPermission } = usePushNotifications(language);
  const [loading, setLoading] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);

  const handleEnableNotifications = async () => {
    setLoading(true);
    setHasAttempted(true);
    await requestPermission();
    setLoading(false);
  };

  const handleComplete = () => {
    onComplete(isPermissionGranted);
  };

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {language === 'en' ? 'Push Notifications' : 'Arifa za Kusukuma'}
        </h2>
        <p className="text-muted-foreground mt-1">
          {language === 'en' 
            ? 'Stay informed about health alerts and updates'
            : 'Kaa na habari kuhusu tahadhari za afya na masasisho'}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${
            isPermissionGranted 
              ? 'bg-green-500/10 text-green-600' 
              : !isSupported
                ? 'bg-amber-500/10 text-amber-600' 
                : 'bg-primary/10 text-primary'
          }`}>
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : isPermissionGranted ? (
              <Check className="h-8 w-8" />
            ) : !isSupported ? (
              <X className="h-8 w-8" />
            ) : (
              <Bell className="h-8 w-8" />
            )}
          </div>

          {!isSupported ? (
            <div>
              <h3 className="font-medium text-amber-600">
                {language === 'en' ? 'Notifications Not Supported' : 'Arifa Hazisaidiwi'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'en'
                  ? 'Your browser does not support push notifications. Try using a modern browser.'
                  : 'Kivinjari chako hakisaidii arifa za kusukuma. Jaribu kutumia kivinjari cha kisasa.'}
              </p>
            </div>
          ) : isPermissionGranted ? (
            <div>
              <h3 className="font-medium text-green-600">
                {language === 'en' ? 'Notifications Enabled!' : 'Arifa Zimewashwa!'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'en'
                  ? "You'll receive alerts for emergencies and health updates."
                  : 'Utapokea tahadhari kwa dharura na masasisho ya afya.'}
              </p>
            </div>
          ) : hasAttempted ? (
            <div>
              <h3 className="font-medium text-amber-600">
                {language === 'en' ? 'Notifications Blocked' : 'Arifa Zimezuiwa'}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {language === 'en'
                  ? 'You can enable notifications in your browser settings later.'
                  : 'Unaweza kuwasha arifa katika mipangilio ya kivinjari baadaye.'}
              </p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="font-medium">
                  {language === 'en' ? 'What You\'ll Receive' : 'Utachopokea'}
                </h3>
              </div>
              <ul className="text-sm text-muted-foreground text-left space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary">✓</span>
                  {language === 'en' 
                    ? 'Emergency alerts from your contacts'
                    : 'Tahadhari za dharura kutoka kwa mawasiliano yako'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">✓</span>
                  {language === 'en' 
                    ? 'Health worker responses to your emergencies'
                    : 'Majibu ya wafanyakazi wa afya kwa dharura zako'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">✓</span>
                  {language === 'en' 
                    ? 'Important health tips and updates'
                    : 'Vidokezo na masasisho muhimu ya afya'}
                </li>
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {isSupported && !isPermissionGranted && !hasAttempted && (
        <Button onClick={handleEnableNotifications} disabled={loading} className="w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          <Bell className="h-4 w-4 mr-2" />
          {language === 'en' ? 'Enable Notifications' : 'Washa Arifa'}
        </Button>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            {language === 'en' ? 'Back' : 'Rudi'}
          </Button>
          <Button onClick={handleComplete} className="flex-1">
            <PartyPopper className="h-4 w-4 mr-2" />
            {language === 'en' ? 'Complete Setup' : 'Maliza Mipangilio'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingNotifications;
