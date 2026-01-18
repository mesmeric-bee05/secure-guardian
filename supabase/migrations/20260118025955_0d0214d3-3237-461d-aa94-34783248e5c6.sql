-- Add SMS delivery tracking columns to sms_logs
ALTER TABLE public.sms_logs 
ADD COLUMN IF NOT EXISTS delivery_status text,
ADD COLUMN IF NOT EXISTS failure_reason text,
ADD COLUMN IF NOT EXISTS delivered_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS status_updated_at timestamp with time zone;

-- Add index for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_sms_logs_provider_message_id ON public.sms_logs(provider_message_id);

-- Add location columns to chw_assignments
ALTER TABLE public.chw_assignments
ADD COLUMN IF NOT EXISTS latitude numeric(10,8),
ADD COLUMN IF NOT EXISTS longitude numeric(11,8),
ADD COLUMN IF NOT EXISTS coverage_radius_km integer DEFAULT 10;

-- Create index for location-based queries
CREATE INDEX IF NOT EXISTS idx_chw_assignments_location 
ON public.chw_assignments(latitude, longitude) 
WHERE is_active = true;

-- Create Haversine distance function for finding nearest CHW
CREATE OR REPLACE FUNCTION public.calculate_distance_km(
  lat1 numeric,
  lng1 numeric,
  lat2 numeric,
  lng2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  earth_radius_km numeric := 6371;
  lat_diff numeric;
  lng_diff numeric;
  a numeric;
  c numeric;
BEGIN
  lat1 := radians(lat1);
  lat2 := radians(lat2);
  lng1 := radians(lng1);
  lng2 := radians(lng2);
  
  lat_diff := lat2 - lat1;
  lng_diff := lng2 - lng1;
  
  a := sin(lat_diff / 2) ^ 2 + cos(lat1) * cos(lat2) * sin(lng_diff / 2) ^ 2;
  c := 2 * asin(sqrt(a));
  
  RETURN earth_radius_km * c;
END;
$$;

-- Function to find nearest active CHW within coverage radius
CREATE OR REPLACE FUNCTION public.find_nearest_chw(
  emergency_lat numeric,
  emergency_lng numeric,
  max_distance_km integer DEFAULT 50
)
RETURNS TABLE(
  chw_user_id uuid,
  distance_km numeric,
  region text,
  city text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ca.chw_user_id,
    public.calculate_distance_km(emergency_lat, emergency_lng, ca.latitude, ca.longitude) as distance_km,
    ca.region,
    ca.city
  FROM public.chw_assignments ca
  WHERE ca.is_active = true
    AND ca.latitude IS NOT NULL
    AND ca.longitude IS NOT NULL
    AND public.calculate_distance_km(emergency_lat, emergency_lng, ca.latitude, ca.longitude) <= max_distance_km
  ORDER BY distance_km ASC
  LIMIT 5;
END;
$$;