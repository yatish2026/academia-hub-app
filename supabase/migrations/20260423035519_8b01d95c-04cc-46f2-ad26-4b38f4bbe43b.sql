
-- 1. profiles: must_reset_password + phone
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_reset_password boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS phone text;

-- Existing admin (if any) shouldn't be forced to reset
UPDATE public.profiles SET must_reset_password = false
WHERE id IN (SELECT user_id FROM public.user_roles WHERE role = 'admin');

-- 2. timetable: structured time fields
ALTER TABLE public.timetable
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time,
  ADD COLUMN IF NOT EXISTS period_no int,
  ADD COLUMN IF NOT EXISTS year int NOT NULL DEFAULT 1;

-- backfill from old text time_slot if present (best-effort: leave nulls if unparseable)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='timetable' AND column_name='time_slot') THEN
    -- try to parse "HH:MM-HH:MM"
    UPDATE public.timetable
    SET start_time = NULLIF(split_part(time_slot, '-', 1), '')::time,
        end_time   = NULLIF(split_part(time_slot, '-', 2), '')::time
    WHERE start_time IS NULL AND time_slot ~ '^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$';
    ALTER TABLE public.timetable DROP COLUMN time_slot;
  END IF;
END$$;

-- 3. attendance: prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS attendance_unique_per_day
  ON public.attendance (student_id, subject, date);

-- 4. trigger: new auth users created by admin/HOD/faculty get must_reset_password=true
-- (handle_new_user already inserts into profiles; default column value handles it)

-- 5. RLS: allow HODs to manage profiles/students/faculty/roles in their dept
-- profiles
DROP POLICY IF EXISTS "HODs manage dept profiles" ON public.profiles;
CREATE POLICY "HODs manage dept profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));

DROP POLICY IF EXISTS "Faculty manage dept students profiles" ON public.profiles;
CREATE POLICY "Faculty manage dept students profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'faculty') AND department_id = public.get_user_department(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'faculty') AND department_id = public.get_user_department(auth.uid()));

-- students
DROP POLICY IF EXISTS "HODs manage dept students rows" ON public.students;
CREATE POLICY "HODs manage dept students rows" ON public.students
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));

DROP POLICY IF EXISTS "Faculty insert dept students" ON public.students;
CREATE POLICY "Faculty insert dept students" ON public.students
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'faculty') AND department_id = public.get_user_department(auth.uid()));

-- faculty
DROP POLICY IF EXISTS "HODs manage dept faculty rows" ON public.faculty;
CREATE POLICY "HODs manage dept faculty rows" ON public.faculty
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));

-- user_roles: HOD can assign student/faculty role in own dept (we still gate via edge function which uses service role)
-- (no extra client-side policies needed; edge function uses service role)

-- 6. RPC to mark password reset complete
CREATE OR REPLACE FUNCTION public.complete_password_reset()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET must_reset_password = false WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.complete_password_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_password_reset() TO authenticated;

-- 7. Wipe any demo data the seed migration created (keep real entries if any)
-- We delete only obvious demo emails
DELETE FROM auth.users WHERE email IN (
  'admin@demo.edu','hod@demo.edu','faculty@demo.edu','student@demo.edu',
  'principal@demo.edu','hod.cse@demo.edu','faculty.cse@demo.edu','student.cse@demo.edu'
);
