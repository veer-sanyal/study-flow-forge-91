-- Create storage bucket for calendar images
INSERT INTO storage.buckets (id, name, public) VALUES ('calendar-images', 'calendar-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for calendar-images bucket (admin only)
CREATE POLICY "Admins can upload calendar images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'calendar-images' 
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can view calendar images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'calendar-images'
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Admins can delete calendar images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'calendar-images'
  AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Create calendar_events table to store extracted events
CREATE TABLE public.calendar_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_pack_id UUID NOT NULL REFERENCES public.course_packs(id) ON DELETE CASCADE,
  ingestion_job_id UUID REFERENCES public.ingestion_jobs(id) ON DELETE SET NULL,
  week_number INTEGER NOT NULL,
  day_of_week TEXT, -- MON, TUE, WED, THU, FRI, SAT, SUN
  event_date DATE,
  event_type TEXT NOT NULL, -- 'lesson', 'recitation', 'exam', 'quiz', 'homework', 'no_class', 'review', 'other'
  title TEXT NOT NULL,
  description TEXT,
  topics_covered TEXT[], -- Raw topic strings extracted
  homework_assignments TEXT[],
  location TEXT,
  time_slot TEXT,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for calendar_events (admin only for write, authenticated for read)
CREATE POLICY "Admins can manage calendar events"
ON public.calendar_events FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Authenticated users can view calendar events"
ON public.calendar_events FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add kind column to ingestion_jobs to distinguish PDF vs calendar ingestion
ALTER TABLE public.ingestion_jobs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'pdf';

-- Create index for faster lookups
CREATE INDEX idx_calendar_events_course_pack ON public.calendar_events(course_pack_id);
CREATE INDEX idx_calendar_events_week ON public.calendar_events(week_number);
CREATE INDEX idx_ingestion_jobs_kind ON public.ingestion_jobs(kind);

-- Trigger for updated_at
CREATE TRIGGER update_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();