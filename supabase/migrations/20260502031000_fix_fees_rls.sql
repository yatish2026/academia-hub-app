-- Drop existing restricted policies for fees
DROP POLICY IF EXISTS "HODs view dept fees" ON public.fees;
DROP POLICY IF EXISTS "Admins manage fees" ON public.fees;

-- 1. Everyone can view their own fees (Student)
-- (Already exists as "Students view own fees" usually, but let's re-verify)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students view own fees') THEN
    CREATE POLICY "Students view own fees" ON public.fees FOR SELECT TO authenticated USING (student_id = auth.uid());
  END IF;
END $$;

-- 2. HODs can view and manage fees for students in their department
CREATE POLICY "HODs manage dept fees" ON public.fees
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'hod') 
  AND EXISTS (
    SELECT 1 FROM public.students s 
    WHERE s.id = fees.student_id 
    AND s.department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'hod') 
  AND EXISTS (
    SELECT 1 FROM public.students s 
    WHERE s.id = fees.student_id 
    AND s.department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
  )
);

-- 3. Admins can manage all fees
CREATE POLICY "Admins manage all fees" ON public.fees
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
