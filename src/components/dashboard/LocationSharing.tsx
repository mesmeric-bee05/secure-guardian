import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MapPin, 
  Loader2, 
  CheckCircle, 
  XCircle,
  Battery,
  Signal,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

interface LocationSharingProps {
  className?: string;
}

type UpdateFrequency = '30' | '60' | '120' | '300';

const frequencyOptions: { value: UpdateFrequency; label: string; description: string }[] = [
  { value: '30', label: 'High', description: 'Every 30 seconds' },
  { value: '60', label: 'Normal', description: 'Every 1 minute' },
  { value: '120', label: 'Low', description: 'Every 2 minutes' },
  { value: '300', label: 'Battery Saver', description: 'Every 5 minutes' },
];

export default function LocationSharing({ className = '' }: LocationSharingProps) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [updateFrequency, setUpdateFrequency] = useState<UpdateFrequency>('60');
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);

  // Send location update to server
  const sendLocationUpdate = useCallback(async (position: GeolocationPosition) => {
    try {
      setIsUpdating(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('Not authenticated');
        setIsEnabled(false);
        return;
      }

      const response = await supabase.functions.invoke('chw-location-update', {
        body: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      });

      if (response.error) {
        // Handle rate limiting gracefully
        if (response.error.message?.includes('429')) {
          console.log('Rate limited, will retry on next interval');
          return;
        }
        throw new Error(response.error.message || 'Failed to update location');
      }

      setLastUpdate(new Date());
      setCurrentPosition(position);
      
    } catch (err) {
      console.error('Location update error:', err);
      setError(err instanceof Error ? err.message : 'Failed to update location');
    } finally {
      setIsUpdating(false);
    }
  }, []);

  // Start/stop location tracking
  useEffect(() => {
    if (!isEnabled) {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
      }
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      setIsEnabled(false);
      return;
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentPosition(position);
        sendLocationUpdate(position);
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError(getGeolocationErrorMessage(err));
        setIsEnabled(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Set up interval-based updates
    const intervalMs = parseInt(updateFrequency) * 1000;
    
    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentPosition(position);
          sendLocationUpdate(position);
        },
        (err) => {
          console.error('Geolocation error:', err);
          setError(getGeolocationErrorMessage(err));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }, intervalMs);

    return () => {
      clearInterval(intervalId);
    };
  }, [isEnabled, updateFrequency, sendLocationUpdate, watchId]);

  const getGeolocationErrorMessage = (error: GeolocationPositionError): string => {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return 'Location permission denied. Please enable location access.';
      case error.POSITION_UNAVAILABLE:
        return 'Location information is unavailable.';
      case error.TIMEOUT:
        return 'Location request timed out.';
      default:
        return 'An unknown error occurred.';
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      // Request permission first
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'denied') {
          toast.error('Location permission denied. Please enable in browser settings.');
          return;
        }
      } catch {
        // Permission API not supported, try to get location directly
      }
    }
    
    setIsEnabled(enabled);
    setError(null);
    
    if (enabled) {
      toast.success('Location sharing enabled');
    } else {
      toast.info('Location sharing disabled');
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Location Sharing</CardTitle>
              <CardDescription>Share your location with the dispatch center</CardDescription>
            </div>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status */}
        <div className="flex items-center gap-2">
          {isEnabled ? (
            <>
              {isUpdating ? (
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Updating...
                </Badge>
              ) : error ? (
                <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
                  <XCircle className="w-3 h-3 mr-1" />
                  Error
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Active
                </Badge>
              )}
            </>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              <XCircle className="w-3 h-3 mr-1" />
              Disabled
            </Badge>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Update frequency selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium flex items-center gap-2">
            <Battery className="w-4 h-4" />
            Update Frequency
          </label>
          <Select 
            value={updateFrequency} 
            onValueChange={(v) => setUpdateFrequency(v as UpdateFrequency)}
            disabled={isEnabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {frequencyOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Lower frequency uses less battery. Disable location sharing when not needed.
          </p>
        </div>

        {/* Current position info */}
        {currentPosition && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Signal className="w-4 h-4" />
              Current Position
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Lat:</span>{' '}
                <span className="font-mono">{currentPosition.coords.latitude.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Lng:</span>{' '}
                <span className="font-mono">{currentPosition.coords.longitude.toFixed(6)}</span>
              </div>
            </div>
            {currentPosition.coords.accuracy && (
              <div className="text-xs text-muted-foreground">
                Accuracy: ±{Math.round(currentPosition.coords.accuracy)}m
              </div>
            )}
          </div>
        )}

        {/* Last update time */}
        {lastUpdate && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
            <Clock className="w-3 h-3" />
            Last updated: {lastUpdate.toLocaleTimeString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
