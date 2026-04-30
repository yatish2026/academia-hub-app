-- Add personal detail columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS address text;

-- Marks table
CREATE TABLE IF NOT EXISTS public.marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  faculty_id uuid NOT NULL,
  subject text NOT NULL,
  exam_type text NOT NULL DEFAULT 'Internal',
  marks_obtained numeric NOT NULL DEFAULT 0,
  max_marks numeric NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject, exam_type)
);

ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;

-- Students view own
CREATE POLICY "Students view own marks"
  ON public.marks FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- Admins manage all
CREATE POLICY "Admins manage marks"
  ON public.marks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Faculty insert/update for dept students
CREATE POLICY "Faculty insert dept marks"
  ON public.marks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'faculty'::app_role)
    AND faculty_id = auth.uid()
    AND public.is_faculty_for_student(auth.uid(), student_id)
  );

CREATE POLICY "Faculty update own marks"
  ON public.marks FOR UPDATE TO authenticated
  USING (faculty_id = auth.uid());

CREATE POLICY "Faculty view dept marks"
  ON public.marks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'faculty'::app_role)
    AND public.is_faculty_for_student(auth.uid(), student_id)
  );

-- HOD manage dept marks
CREATE POLICY "HODs manage dept marks"
  ON public.marks FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'hod'::app_role)
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = marks.student_id AND s.department_id = public.get_user_department(auth.uid()))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'hod'::app_role)
    AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = marks.student_id AND s.department_id = public.get_user_department(auth.uid()))
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_marks_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS marks_updated_at ON public.marks;
CREATE TRIGGER marks_updated_at BEFORE UPDATE ON public.marks
FOR EACH ROW EXECUTE FUNCTION public.tg_marks_updated_at();