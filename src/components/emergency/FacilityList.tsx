import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import FacilityCard from './FacilityCard';
import { HealthFacility } from '@/hooks/useFacilities';
import { Language } from '@/lib/translations';

interface FacilityListProps {
  facilities: HealthFacility[];
  loading: boolean;
  language: Language;
  selectedFacility: HealthFacility | null;
  onFacilitySelect: (facility: HealthFacility) => void;
  userLocation: { lat: number; lng: number } | null;
}

type FacilityType = 'all' | 'hospital' | 'clinic' | 'pharmacy' | 'health_center';

const filterTabs: { value: FacilityType; labelEn: string; labelSw: string }[] = [
  { value: 'all', labelEn: 'All', labelSw: 'Zote' },
  { value: 'hospital', labelEn: 'Hospital', labelSw: 'Hospitali' },
  { value: 'clinic', labelEn: 'Clinic', labelSw: 'Kliniki' },
  { value: 'pharmacy', labelEn: 'Pharmacy', labelSw: 'Dawa' },
  { value: 'health_center', labelEn: 'Center', labelSw: 'Kituo' },
];

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const FacilityList = ({
  facilities,
  loading,
  language,
  selectedFacility,
  onFacilitySelect,
  userLocation,
}: FacilityListProps) => {
  const [filter, setFilter] = useState<FacilityType>('all');

  // Filter and sort facilities
  const filteredFacilities = facilities
    .filter(f => filter === 'all' || f.facility_type === filter)
    .map(facility => ({
      ...facility,
      distance: userLocation && facility.latitude && facility.longitude
        ? calculateDistance(userLocation.lat, userLocation.lng, facility.latitude, facility.longitude)
        : undefined,
    }))
    .sort((a, b) => {
      if (a.distance !== undefined && b.distance !== undefined) {
        return a.distance - b.distance;
      }
      return 0;
    });

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as FacilityType)}>
          <TabsList className="w-full grid grid-cols-5">
            {filterTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {language === 'en' ? tab.labelEn : tab.labelSw}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredFacilities.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {language === 'en' ? 'No facilities found' : 'Hakuna vituo vilivyopatikana'}
            </p>
          ) : (
            filteredFacilities.map((facility) => (
              <FacilityCard
                key={facility.id}
                facility={facility}
                distance={facility.distance}
                language={language}
                isSelected={selectedFacility?.id === facility.id}
                onClick={() => onFacilitySelect(facility)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FacilityList;
