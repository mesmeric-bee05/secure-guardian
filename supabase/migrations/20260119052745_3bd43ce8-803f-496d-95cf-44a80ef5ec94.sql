-- Add retry tracking columns to sms_logs
ALTER TABLE public.sms_logs
ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS original_message_id uuid;

-- Add index for retry queries
CREATE INDEX IF NOT EXISTS idx_sms_logs_retry ON public.sms_logs (status, retry_count) WHERE status = 'failed';