-- Update is_faculty_for_student to be more permissive (allow cross-department teaching)
CREATE OR REPLACE FUNCTION public.is_faculty_for_student(_faculty_id UUID, _student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    -- Option 1: Same department
    SELECT 1 FROM public.faculty f, public.students s
    WHERE f.id = _faculty_id AND s.id = _student_id AND f.department_id = s.department_id
  ) OR EXISTS (
    -- Option 2: Faculty is assigned to the student's class in timetable
    SELECT 1 FROM public.timetable t, public.students s
    WHERE t.faculty_id = _faculty_id 
      AND s.id = _student_id 
      AND t.department_id = s.department_id 
      AND t.section = s.section 
      AND t.year = s.year
  );
END;
$$;

-- Update Students policy for faculty
DROP POLICY IF EXISTS "Faculty view dept students" ON public.students;
DROP POLICY IF EXISTS "Faculty view students" ON public.students;
CREATE POLICY "Faculty view students" ON public.students 
FOR SELECT TO authenticated 
USING (
  public.has_role(auth.uid(), 'faculty') AND public.is_faculty_for_student(auth.uid(), id)
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid())
);

-- Update Profiles policy for faculty
DROP POLICY IF EXISTS "Faculty view dept profiles" ON public.profiles;
DROP POLICY IF EXISTS "Faculty view profiles" ON public.profiles;
CREATE POLICY "Faculty view profiles" ON public.profiles 
FOR SELECT TO authenticated 
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'faculty') AND (
    department_id = public.get_user_department(auth.uid()) 
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = public.profiles.id AND public.is_faculty_for_student(auth.uid(), s.id))
  )
  OR public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid())
);
