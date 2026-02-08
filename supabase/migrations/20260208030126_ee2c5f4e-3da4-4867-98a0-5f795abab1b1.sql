
-- Add video_url and reference_books columns to first_aid_protocols
ALTER TABLE public.first_aid_protocols 
ADD COLUMN video_url text,
ADD COLUMN reference_books jsonb;
