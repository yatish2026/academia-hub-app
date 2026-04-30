ALTER TABLE public.timetable REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.timetable;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;