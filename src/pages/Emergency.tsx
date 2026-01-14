import { useState, useEffect } from 'react';
import { Locate, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFacilities, HealthFacility } from '@/hooks/useFacilities';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useAuth } from '@/hooks/useAuth';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';
import EmergencyHeader from '@/components/emergency/EmergencyHeader';
import EmergencyMap from '@/components/emergency/EmergencyMap';
import FacilityList from '@/components/emergency/FacilityList';
import QuickDialButtons from '@/components/emergency/QuickDialButtons';
import EmergencyAlertButton from '@/components/emergency/EmergencyAlertButton';
import EmergencyAlertModal from '@/components/emergency/EmergencyAlertModal';
import { Language } from '@/lib/translations';

const Emergency = () => {
  const { profile } = useAuth();
  const [language, setLanguage] = useState<Language>(
    (profile?.preferred_language as Language) || 'en'
  );
  const [selectedFacility, setSelectedFacility] = useState<HealthFacility | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('list');

  const { facilities, loading: facilitiesLoading } = useFacilities();
  const {
    latitude,
    longitude,
    loading: locationLoading,
    error: locationError,
    getCurrentPosition,
  } = useGeolocation();
  
  // Enable background sync for offline alerts
  useBackgroundSync({ language });

  const userLocation = latitude && longitude ? { lat: latitude, lng: longitude } : null;

  // Get location on mount
  useEffect(() => {
    getCurrentPosition();
  }, [getCurrentPosition]);

  // Update language when profile loads
  useEffect(() => {
    if (profile?.preferred_language) {
      setLanguage(profile.preferred_language as Language);
    }
  }, [profile?.preferred_language]);

  const handleCenterOnUser = () => {
    getCurrentPosition();
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <EmergencyHeader
        language={language}
        onLanguageChange={setLanguage}
      />

      {/* Emergency Alert Button */}
      <div className="p-4 border-b">
        <EmergencyAlertButton
          language={language}
          onClick={() => setShowAlertModal(true)}
        />
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
        <Button
          variant={viewMode === 'list' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('list')}
          className="flex-1"
        >
          {language === 'en' ? 'List' : 'Orodha'}
        </Button>
        <Button
          variant={viewMode === 'map' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('map')}
          className="flex-1"
        >
          {language === 'en' ? 'Map' : 'Ramani'}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleCenterOnUser}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Locate className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Location Error */}
      {locationError && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-sm">
          {language === 'en'
            ? 'Unable to get your location. Enable location services for better results.'
            : 'Haiwezekani kupata mahali pako. Washa huduma za mahali kwa matokeo bora.'}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'map' ? (
          <EmergencyMap
            facilities={facilities}
            userLocation={userLocation}
            selectedFacility={selectedFacility}
            onFacilitySelect={setSelectedFacility}
            onCenterOnUser={handleCenterOnUser}
          />
        ) : (
          <FacilityList
            facilities={facilities}
            loading={facilitiesLoading}
            language={language}
            selectedFacility={selectedFacility}
            onFacilitySelect={setSelectedFacility}
            userLocation={userLocation}
          />
        )}
      </div>

      {/* Quick Dial */}
      <QuickDialButtons language={language} />

      {/* Alert Modal */}
      <EmergencyAlertModal
        open={showAlertModal}
        onOpenChange={setShowAlertModal}
        language={language}
        userLocation={userLocation}
      />
    </div>
  );
};

export default Emergency;
