
-- 1. Create Colleges Table
CREATE TABLE IF NOT EXISTS public.colleges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add super_admin role
-- Note: ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block in some Postgres versions.
-- Supabase migrations run in a transaction. We might need to handle this.
-- However, we can just use the existing roles and treat a user with NO college_id as a super admin, 
-- or add a separate table for super admins.
-- Let's try adding it to the enum first.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'super_admin') THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
  END IF;
END $$;

-- 3. Add college_id to all relevant tables
DO $$
BEGIN
  -- PROFILES
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='college_id') THEN
    ALTER TABLE public.profiles ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;
  
  -- DEPARTMENTS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='college_id') THEN
    ALTER TABLE public.departments ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;
  
  -- USER_ROLES
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='college_id') THEN
    ALTER TABLE public.user_roles ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;

  -- STUDENTS
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='college_id') THEN
    ALTER TABLE public.students ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;

  -- FACULTY
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='faculty' AND column_name='college_id') THEN
    ALTER TABLE public.faculty ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;

  -- ATTENDANCE
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='college_id') THEN
    ALTER TABLE public.attendance ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;

  -- FEES
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fees' AND column_name='college_id') THEN
    ALTER TABLE public.fees ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;

  -- TIMETABLE
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='timetable' AND column_name='college_id') THEN
    ALTER TABLE public.timetable ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;

  -- NOTICES
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='notices' AND column_name='college_id') THEN
    ALTER TABLE public.notices ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;

  -- MARKS (Checking if marks table exists and needs college_id)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='marks') AND 
     NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='marks' AND column_name='college_id') THEN
    ALTER TABLE public.marks ADD COLUMN college_id UUID REFERENCES public.colleges(id);
  END IF;
END $$;

-- 4. Helper Function to get college_id from JWT
CREATE OR REPLACE FUNCTION public.get_college_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'college_id')::uuid;
$$;

-- 5. Update handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_college_id UUID;
BEGIN
  target_college_id := (NEW.raw_user_meta_data->>'college_id')::uuid;

  INSERT INTO public.profiles (id, full_name, email, college_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    target_college_id
  );
  
  -- Automatically assign role if provided in metadata
  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role, college_id)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::public.app_role, target_college_id);
  END IF;

  RETURN NEW;
END;
$$;

-- 6. Re-enable RLS with College Isolation
-- We need to drop old policies and create new ones that include college_id check.

-- COLLEGES
ALTER TABLE public.colleges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage colleges" ON public.colleges FOR ALL TO authenticated 
USING (public.has_role(auth.uid(), 'super_admin')) 
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users view their own college" ON public.colleges FOR SELECT TO authenticated 
USING (id = public.get_college_id() OR public.has_role(auth.uid(), 'super_admin'));

-- DEPARTMENTS
DROP POLICY IF EXISTS "Anyone authenticated can view departments" ON public.departments;
DROP POLICY IF EXISTS "Admins manage departments" ON public.departments;
CREATE POLICY "Users view own college departments" ON public.departments FOR SELECT TO authenticated 
USING (college_id = public.get_college_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage own college departments" ON public.departments FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));

-- PROFILES
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "HODs view dept profiles" ON public.profiles;
DROP POLICY IF EXISTS "Faculty view dept profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "College staff view college profiles" ON public.profiles FOR SELECT TO authenticated 
USING ((college_id = public.get_college_id() AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hod') OR public.has_role(auth.uid(), 'faculty'))) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins manage college profiles" ON public.profiles FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));

-- STUDENTS
DROP POLICY IF EXISTS "Students view own record" ON public.students;
DROP POLICY IF EXISTS "Admins view all students" ON public.students;
DROP POLICY IF EXISTS "HODs view dept students" ON public.students;
DROP POLICY IF EXISTS "Faculty view dept students" ON public.students;
DROP POLICY IF EXISTS "Admins manage students" ON public.students;

CREATE POLICY "Students view own record" ON public.students FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Staff view college students" ON public.students FOR SELECT TO authenticated 
USING ((college_id = public.get_college_id() AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hod') OR public.has_role(auth.uid(), 'faculty'))) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage college students" ON public.students FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));

-- FACULTY
DROP POLICY IF EXISTS "Faculty view own record" ON public.faculty;
DROP POLICY IF EXISTS "Admins view all faculty" ON public.faculty;
DROP POLICY IF EXISTS "HODs view dept faculty" ON public.faculty;
DROP POLICY IF EXISTS "Students view dept faculty" ON public.faculty;
DROP POLICY IF EXISTS "Admins manage faculty" ON public.faculty;

CREATE POLICY "Faculty view own record" ON public.faculty FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "College users view college faculty" ON public.faculty FOR SELECT TO authenticated 
USING (college_id = public.get_college_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage college faculty" ON public.faculty FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));

-- ATTENDANCE
DROP POLICY IF EXISTS "Students view own attendance" ON public.attendance;
DROP POLICY IF EXISTS "Faculty view dept attendance" ON public.attendance;
DROP POLICY IF EXISTS "HODs view dept attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins view all attendance" ON public.attendance;
DROP POLICY IF EXISTS "Faculty mark attendance" ON public.attendance;
DROP POLICY IF EXISTS "Faculty update own attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins manage attendance" ON public.attendance;

CREATE POLICY "Users view college attendance" ON public.attendance FOR SELECT TO authenticated 
USING ((college_id = public.get_college_id()) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Faculty manage college attendance" ON public.attendance FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'faculty')) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage college attendance" ON public.attendance FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));

-- FEES
DROP POLICY IF EXISTS "Students view own fees" ON public.fees;
DROP POLICY IF EXISTS "HODs view dept fees" ON public.fees;
DROP POLICY IF EXISTS "Admins manage fees" ON public.fees;

CREATE POLICY "Students view own fees" ON public.fees FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Staff view college fees" ON public.fees FOR SELECT TO authenticated 
USING ((college_id = public.get_college_id() AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hod'))) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage college fees" ON public.fees FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));

-- TIMETABLE
DROP POLICY IF EXISTS "Authenticated view timetable" ON public.timetable;
DROP POLICY IF EXISTS "Faculty insert dept timetable" ON public.timetable;
DROP POLICY IF EXISTS "Faculty update own timetable" ON public.timetable;
DROP POLICY IF EXISTS "HODs manage dept timetable" ON public.timetable;
DROP POLICY IF EXISTS "Admins manage timetable" ON public.timetable;

CREATE POLICY "Users view college timetable" ON public.timetable FOR SELECT TO authenticated 
USING (college_id = public.get_college_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Staff manage college timetable" ON public.timetable FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND (public.has_role(auth.uid(), 'hod') OR public.has_role(auth.uid(), 'faculty'))) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage college timetable" ON public.timetable FOR ALL TO authenticated 
USING ((college_id = public.get_college_id() AND public.has_role(auth.uid(), 'admin')) OR public.has_role(auth.uid(), 'super_admin'));

-- NOTICES
DROP POLICY IF EXISTS "Authenticated view notices" ON public.notices;
DROP POLICY IF EXISTS "Faculty post notices" ON public.notices;
DROP POLICY IF EXISTS "Authors update own notices" ON public.notices;
DROP POLICY IF EXISTS "Authors delete own notices" ON public.notices;

CREATE POLICY "Users view college notices" ON public.notices FOR SELECT TO authenticated 
USING (college_id = public.get_college_id() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Staff post college notices" ON public.notices FOR INSERT TO authenticated 
WITH CHECK ((college_id = public.get_college_id() AND (public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'hod') OR public.has_role(auth.uid(), 'admin'))) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Authors manage own notices" ON public.notices FOR ALL TO authenticated 
USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
