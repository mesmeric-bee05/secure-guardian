-- =============================================
-- MEDIREACH+ DATABASE SCHEMA
-- AI-Powered Mobile Health Platform
-- =============================================

-- 1. Create Enums
CREATE TYPE public.app_role AS ENUM ('user', 'chw', 'admin');
CREATE TYPE public.case_status AS ENUM ('pending', 'assigned', 'in_progress', 'resolved', 'escalated');
CREATE TYPE public.case_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.facility_type AS ENUM ('hospital', 'clinic', 'pharmacy', 'health_center');
CREATE TYPE public.language_preference AS ENUM ('en', 'sw');

-- 2. User Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone_number TEXT,
  blood_type TEXT,
  allergies TEXT[],
  medical_conditions TEXT[],
  date_of_birth DATE,
  preferred_language language_preference DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. User Roles Table (CRITICAL: Separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, role)
);

-- 4. Emergency Contacts Table
CREATE TABLE public.emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  relationship TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Health Facilities Table
CREATE TABLE public.health_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  facility_type facility_type NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  phone_number TEXT,
  email TEXT,
  services TEXT[],
  operating_hours JSONB,
  is_24_hours BOOLEAN DEFAULT false,
  has_ambulance BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. First Aid Protocols Table (Bilingual)
CREATE TABLE public.first_aid_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_sw TEXT NOT NULL,
  content_en TEXT NOT NULL,
  content_sw TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('mild', 'moderate', 'severe', 'critical')),
  red_flags TEXT[],
  steps JSONB NOT NULL,
  seek_help_when TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 7. Emergency Cases Table
CREATE TABLE public.emergency_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_chw_id UUID REFERENCES auth.users(id),
  status case_status DEFAULT 'pending',
  priority case_priority DEFAULT 'medium',
  symptoms TEXT NOT NULL,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  location_address TEXT,
  notes TEXT,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- 8. CHW Assignments (Region-based)
CREATE TABLE public.chw_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chw_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  city TEXT,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(chw_user_id, region)
);

-- 9. Chat Sessions Table
CREATE TABLE public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  language language_preference DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 10. Chat Messages Table
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 11. SMS Logs Table
CREATE TABLE public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')),
  status TEXT DEFAULT 'pending',
  provider_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 12. USSD Sessions Table
CREATE TABLE public.ussd_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  current_menu TEXT DEFAULT 'main',
  session_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 13. Audit Logs Table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================
-- SECURITY DEFINER FUNCTIONS (For RLS)
-- =============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Function to check if user is CHW
CREATE OR REPLACE FUNCTION public.is_chw(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'chw')
$$;

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_aid_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chw_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ussd_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "CHWs can view assigned user profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.is_chw(auth.uid()) AND 
    EXISTS (
      SELECT 1 FROM public.emergency_cases ec
      WHERE ec.user_id = profiles.user_id 
      AND ec.assigned_chw_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- User Roles Policies
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Emergency Contacts Policies
CREATE POLICY "Users can manage their own emergency contacts"
  ON public.emergency_contacts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Health Facilities Policies (Public read)
CREATE POLICY "Anyone can view verified facilities"
  ON public.health_facilities FOR SELECT
  TO authenticated
  USING (is_verified = true);

CREATE POLICY "Admins can manage facilities"
  ON public.health_facilities FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- First Aid Protocols Policies (Public read)
CREATE POLICY "Anyone can view protocols"
  ON public.first_aid_protocols FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage protocols"
  ON public.first_aid_protocols FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Emergency Cases Policies
CREATE POLICY "Users can view their own cases"
  ON public.emergency_cases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own cases"
  ON public.emergency_cases FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "CHWs can view assigned cases"
  ON public.emergency_cases FOR SELECT
  TO authenticated
  USING (
    public.is_chw(auth.uid()) AND 
    (assigned_chw_id = auth.uid() OR assigned_chw_id IS NULL)
  );

CREATE POLICY "CHWs can update assigned cases"
  ON public.emergency_cases FOR UPDATE
  TO authenticated
  USING (
    public.is_chw(auth.uid()) AND 
    assigned_chw_id = auth.uid()
  );

CREATE POLICY "Admins can manage all cases"
  ON public.emergency_cases FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- CHW Assignments Policies
CREATE POLICY "CHWs can view their own assignments"
  ON public.chw_assignments FOR SELECT
  TO authenticated
  USING (auth.uid() = chw_user_id);

CREATE POLICY "Admins can manage assignments"
  ON public.chw_assignments FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Chat Sessions Policies
CREATE POLICY "Users can manage their own chat sessions"
  ON public.chat_sessions FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Chat Messages Policies
CREATE POLICY "Users can manage messages in their sessions"
  ON public.chat_messages FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      WHERE cs.id = chat_messages.session_id
      AND cs.user_id = auth.uid()
    )
  );

-- SMS Logs Policies
CREATE POLICY "Users can view their own SMS logs"
  ON public.sms_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all SMS logs"
  ON public.sms_logs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- USSD Sessions (Edge function access via service role)
CREATE POLICY "Service role manages USSD sessions"
  ON public.ussd_sessions FOR ALL
  TO service_role
  USING (true);

-- Audit Logs Policies
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_health_facilities_updated_at
  BEFORE UPDATE ON public.health_facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_first_aid_protocols_updated_at
  BEFORE UPDATE ON public.first_aid_protocols
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_emergency_cases_updated_at
  BEFORE UPDATE ON public.emergency_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_ussd_sessions_updated_at
  BEFORE UPDATE ON public.ussd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Auto-create profile and user role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, full_name, preferred_language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'en'
  );
  
  -- Assign default 'user' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- SEED DATA: Sample Health Facilities
-- =============================================

INSERT INTO public.health_facilities (name, facility_type, address, city, region, latitude, longitude, phone_number, services, is_24_hours, has_ambulance, is_verified) VALUES
('Kenyatta National Hospital', 'hospital', 'Hospital Road', 'Nairobi', 'Nairobi', -1.3019, 36.8063, '+254 20 2726300', ARRAY['Emergency', 'Surgery', 'Pediatrics', 'Maternity'], true, true, true),
('Aga Khan University Hospital', 'hospital', '3rd Parklands Avenue', 'Nairobi', 'Nairobi', -1.2600, 36.8127, '+254 20 366 2000', ARRAY['Emergency', 'Cardiology', 'Oncology', 'Neurology'], true, true, true),
('Nairobi Hospital', 'hospital', 'Argwings Kodhek Road', 'Nairobi', 'Nairobi', -1.2890, 36.7990, '+254 20 2845000', ARRAY['Emergency', 'ICU', 'Surgery', 'Pediatrics'], true, true, true),
('Muhimbili National Hospital', 'hospital', 'United Nations Road', 'Dar es Salaam', 'Dar es Salaam', -6.8024, 39.2559, '+255 22 215 0006', ARRAY['Emergency', 'Surgery', 'Maternity', 'Pediatrics'], true, true, true),
('Mombasa Hospital', 'hospital', 'Mama Ngina Drive', 'Mombasa', 'Coast', -4.0488, 39.6612, '+254 41 231 2191', ARRAY['Emergency', 'Surgery', 'Maternity'], true, true, true);

-- =============================================
-- SEED DATA: First Aid Protocols
-- =============================================

INSERT INTO public.first_aid_protocols (category, title_en, title_sw, content_en, content_sw, severity, red_flags, steps, seek_help_when) VALUES
('bleeding', 'Severe Bleeding', 'Kutoka Damu Kwa Wingi', 
'Apply direct pressure to stop bleeding. Elevate the injured area if possible.',
'Bonyeza moja kwa moja kusimamisha damu. Inua eneo lililoumia ikiwezekana.',
'severe',
ARRAY['Spurting blood', 'Blood soaking through bandages', 'Loss of consciousness'],
'[{"step_en": "Apply firm pressure with clean cloth", "step_sw": "Bonyeza kwa nguvu na kitambaa safi"}, {"step_en": "Keep pressure for 10-15 minutes", "step_sw": "Weka shinikizo kwa dakika 10-15"}, {"step_en": "If bleeding continues, add more cloth", "step_sw": "Ikiwa damu inaendelea, ongeza kitambaa zaidi"}]'::jsonb,
ARRAY['Bleeding does not stop after 15 minutes', 'Blood is spurting', 'Person becomes pale or confused']),

('burns', 'Burns Treatment', 'Matibabu ya Kuungua',
'Cool the burn with running water for at least 20 minutes. Do not apply ice or butter.',
'Poza kuchomeka kwa maji ya bomba kwa angalau dakika 20. Usitumie barafu au siagi.',
'moderate',
ARRAY['Burns on face, hands, feet, or genitals', 'Burns larger than palm size', 'Blistering burns'],
'[{"step_en": "Cool burn under running water for 20 minutes", "step_sw": "Poza kuchomeka chini ya maji kwa dakika 20"}, {"step_en": "Remove jewelry near the burn", "step_sw": "Ondoa vito karibu na kuchomeka"}, {"step_en": "Cover with clean, non-fluffy material", "step_sw": "Funika kwa nyenzo safi isiyo na manyoya"}]'::jsonb,
ARRAY['Burn is larger than your palm', 'Burn is on face or joints', 'Person has difficulty breathing']),

('choking', 'Choking Emergency', 'Dharura ya Kukaba',
'If person can cough, encourage coughing. If they cannot breathe, perform back blows and abdominal thrusts.',
'Ikiwa mtu anaweza kukohoa, himiza kukohoa. Ikiwa hawawezi kupumua, fanya mapigo ya mgongo na kushinikiza tumbo.',
'critical',
ARRAY['Cannot speak or cry', 'Blue lips or face', 'Loss of consciousness'],
'[{"step_en": "Ask: Are you choking? Can you speak?", "step_sw": "Uliza: Unakaba? Unaweza kusema?"}, {"step_en": "Give 5 back blows between shoulder blades", "step_sw": "Toa mapigo 5 ya mgongo kati ya mabega"}, {"step_en": "Give 5 abdominal thrusts", "step_sw": "Toa kushinikiza tumbo mara 5"}]'::jsonb,
ARRAY['Person cannot breathe', 'Lips turning blue', 'Person loses consciousness']),

('fractures', 'Bone Fractures', 'Kuvunjika Mfupa',
'Immobilize the injured area. Do not try to straighten the bone. Apply ice wrapped in cloth.',
'Simamisha eneo lililoumia. Usijaribu kunyoosha mfupa. Tumia barafu iliyofunikwa kwa kitambaa.',
'moderate',
ARRAY['Bone visible through skin', 'Severe deformity', 'No pulse below injury'],
'[{"step_en": "Keep injured area still", "step_sw": "Weka eneo lililoumia bila kusogea"}, {"step_en": "Apply ice wrapped in cloth", "step_sw": "Tumia barafu iliyofunikwa kwa kitambaa"}, {"step_en": "Support the limb with padding", "step_sw": "Saidia kiungo kwa vifaa laini"}]'::jsonb,
ARRAY['Bone is visible', 'Limb looks severely deformed', 'Numbness or no pulse below injury']),

('heart_attack', 'Heart Attack Signs', 'Dalili za Mshtuko wa Moyo',
'Call emergency services immediately. Have person rest in comfortable position. Give aspirin if available and not allergic.',
'Piga simu huduma za dharura mara moja. Mtu apumzike katika hali ya starehe. Mpe aspirini ikiwa inapatikana na hana mzio.',
'critical',
ARRAY['Chest pain spreading to arm or jaw', 'Difficulty breathing', 'Cold sweats'],
'[{"step_en": "Call emergency services immediately", "step_sw": "Piga simu huduma za dharura mara moja"}, {"step_en": "Have person sit or lie comfortably", "step_sw": "Mtu akae au alale kwa starehe"}, {"step_en": "Give aspirin if available and no allergy", "step_sw": "Mpe aspirini ikiwa inapatikana na hana mzio"}]'::jsonb,
ARRAY['Chest pain or pressure', 'Pain spreading to arm, neck, or jaw', 'Shortness of breath', 'Cold sweats']);