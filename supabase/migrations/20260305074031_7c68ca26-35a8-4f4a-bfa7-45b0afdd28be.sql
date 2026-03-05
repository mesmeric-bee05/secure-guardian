
-- Add diverse facility types (clinics, pharmacies, health centers) for Tanzania
INSERT INTO public.health_facilities (name, facility_type, address, city, region, latitude, longitude, phone_number, services, is_24_hours, has_ambulance, is_verified)
VALUES
  ('Masaki Clinic', 'clinic', 'Masaki Peninsula, Msasani', 'Dar es Salaam', 'Dar es Salaam', -6.7510, 39.2730, '+255-22-260-1234', ARRAY['general_consultation', 'vaccinations', 'maternal_health', 'lab_tests'], false, false, true),
  ('Arusha Pharmacy Plus', 'pharmacy', 'Sokoine Road', 'Arusha', 'Arusha', -3.3731, 36.6830, '+255-27-250-3456', ARRAY['prescriptions', 'over_the_counter', 'medical_supplies', 'first_aid'], false, false, true),
  ('Mbezi Health Center', 'health_center', 'Mbezi Beach', 'Dar es Salaam', 'Dar es Salaam', -6.7300, 39.2200, '+255-22-261-7890', ARRAY['general_consultation', 'maternal_health', 'child_health', 'vaccinations', 'malaria_treatment'], false, false, true),
  ('Dodoma Central Pharmacy', 'pharmacy', 'Dodoma CBD', 'Dodoma', 'Dodoma', -6.1730, 35.7470, '+255-26-232-4567', ARRAY['prescriptions', 'over_the_counter', 'medical_supplies'], false, false, true),
  ('Mwanza City Clinic', 'clinic', 'Nyamagana District', 'Mwanza', 'Mwanza', -2.5155, 32.9060, '+255-28-250-6789', ARRAY['general_consultation', 'lab_tests', 'minor_surgery', 'dental'], false, false, true),
  ('Zanzibar Community Health Center', 'health_center', 'Stone Town', 'Zanzibar', 'Zanzibar', -6.1640, 39.1910, '+255-24-223-5678', ARRAY['general_consultation', 'maternal_health', 'child_health', 'malaria_treatment', 'hiv_testing'], true, false, true);
