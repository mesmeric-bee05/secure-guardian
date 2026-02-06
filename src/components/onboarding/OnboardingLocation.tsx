import { useState } from 'react';
import { MapPin, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useGeolocation } from '@/hooks/useGeolocation';

interface OnboardingLocationProps {
  language: 'en' | 'sw';
  onNext: (locationEnabled: boolean) => void;
  onBack: () => void;
}

const OnboardingLocation = ({ language, onNext, onBack }: OnboardingLocationProps) => {
  const { latitude, longitude, loading, error, getCurrentPosition } = useGeolocation();
  const [hasAttempted, setHasAttempted] = useState(false);

  const handleEnableLocation = async () => {
    setHasAttempted(true);
    await getCurrentPosition();
  };

  const handleContinue = () => {
    onNext(!!latitude && !!longitude);
  };

  const handleSkip = () => {
    onNext(false);
  };

  const locationGranted = latitude !== null && longitude !== null;

  return (
    <div className="space-y-6 py-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold">
          {language === 'en' ? 'Location Services' : 'Huduma za Mahali'}
        </h2>
        <p className="text-muted-foreground mt-1">
          {language === 'en' 
            ? 'Enable location for faster emergency response'
            : 'Washa mahali kwa majibu ya haraka ya dharura'}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${
            locationGranted 
              ? 'bg-green-500/10 text-green-600' 
              : error 
                ? 'bg-destructive/10 text-destructive' 
                : 'bg-primary/10 text-primary'
          }`}>
            {loading ? (
              <Loader2 className="h-8 w-8 animate-spin" />
            ) : locationGranted ? (
              <Check className="h-8 w-8" />
            ) : error ? (
              <X className="h-8 w-8" />
            ) : (
              <MapPin className="h-8 w-8" />
            )}
          </div>

          {locationGranted ? (
            <>
              <div>
                <h3 className="font-medium text-green-600">
                  {language === 'en' ? 'Location Enabled!' : 'Mahali Imewashwa!'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {language === 'en'
                    ? `Your location: ${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}`
                    : `Mahali pako: ${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}`}
                </p>
              </div>
            </>
          ) : error ? (
            <>
              <div>
                <h3 className="font-medium text-destructive">
                  {language === 'en' ? 'Location Denied' : 'Mahali Imekataliwa'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {language === 'en'
                    ? 'You can enable location in your browser settings later.'
                    : 'Unaweza kuwasha mahali katika mipangilio ya kivinjari baadaye.'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <h3 className="font-medium">
                  {language === 'en' ? 'Why We Need Your Location' : 'Kwa Nini Tunahitaji Mahali Pako'}
                </h3>
              </div>
              <ul className="text-sm text-muted-foreground text-left space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary">✓</span>
                  {language === 'en' 
                    ? 'Find nearest health facilities during emergencies'
                    : 'Pata vituo vya afya vya karibu wakati wa dharura'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">✓</span>
                  {language === 'en' 
                    ? 'Alert nearby community health workers'
                    : 'Tahadharisha wafanyakazi wa afya wa jamii wa karibu'}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">✓</span>
                  {language === 'en' 
                    ? 'Share your location with emergency contacts'
                    : 'Shiriki mahali pako na mawasiliano ya dharura'}
                </li>
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {!locationGranted && !error && (
        <Button onClick={handleEnableLocation} disabled={loading} className="w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          <MapPin className="h-4 w-4 mr-2" />
          {language === 'en' ? 'Enable Location' : 'Washa Mahali'}
        </Button>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            {language === 'en' ? 'Back' : 'Rudi'}
          </Button>
          <Button onClick={handleContinue} className="flex-1">
            {language === 'en' ? 'Continue' : 'Endelea'}
          </Button>
        </div>
        {!locationGranted && !hasAttempted && (
          <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
            {language === 'en' ? 'Skip for now' : 'Ruka kwa sasa'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default OnboardingLocation;
