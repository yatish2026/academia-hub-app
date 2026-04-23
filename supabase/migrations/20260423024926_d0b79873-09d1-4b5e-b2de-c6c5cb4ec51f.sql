
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'hod', 'faculty', 'student');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent');

-- DEPARTMENTS
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  hod_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- PROFILES (mirrors auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- USER ROLES (separate table to prevent privilege escalation)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- STUDENTS
CREATE TABLE public.students (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  roll_no TEXT NOT NULL UNIQUE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  section TEXT NOT NULL DEFAULT 'A',
  year INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FACULTY
CREATE TABLE public.faculty (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_no TEXT NOT NULL UNIQUE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  subjects TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ATTENDANCE
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL,
  date DATE NOT NULL,
  status public.attendance_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject, date)
);
CREATE INDEX idx_attendance_student ON public.attendance(student_id);
CREATE INDEX idx_attendance_date ON public.attendance(date);

-- FEES
CREATE TABLE public.fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  total_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  due_amount NUMERIC(12,2) GENERATED ALWAYS AS (total_fee - paid_amount) STORED,
  semester TEXT NOT NULL DEFAULT 'Sem 1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester)
);

-- TIMETABLE
CREATE TABLE public.timetable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  section TEXT NOT NULL DEFAULT 'A',
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  time_slot TEXT NOT NULL,
  subject TEXT NOT NULL,
  faculty_id UUID REFERENCES public.faculty(id) ON DELETE SET NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTICES
CREATE TABLE public.notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  audience public.app_role,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notices_created_at ON public.notices(created_at DESC);

-- SECURITY DEFINER FUNCTIONS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_department(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_faculty_for_student(_faculty_id UUID, _student_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.faculty f, public.students s
    WHERE f.id = _faculty_id AND s.id = _student_id AND f.department_id = s.department_id
  )
$$;

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ENABLE RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

-- DEPARTMENTS POLICIES
CREATE POLICY "Anyone authenticated can view departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage departments" ON public.departments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PROFILES POLICIES
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "HODs view dept profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Faculty view dept profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faculty') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES POLICIES
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- STUDENTS POLICIES
CREATE POLICY "Students view own record" ON public.students FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all students" ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "HODs view dept students" ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Faculty view dept students" ON public.students FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faculty') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Admins manage students" ON public.students FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- FACULTY POLICIES
CREATE POLICY "Faculty view own record" ON public.faculty FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins view all faculty" ON public.faculty FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "HODs view dept faculty" ON public.faculty FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Students view dept faculty" ON public.faculty FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'student') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Admins manage faculty" ON public.faculty FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ATTENDANCE POLICIES
CREATE POLICY "Students view own attendance" ON public.attendance FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Faculty view dept attendance" ON public.attendance FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'faculty') AND public.is_faculty_for_student(auth.uid(), student_id));
CREATE POLICY "HODs view dept attendance" ON public.attendance FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod') AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.department_id = public.get_user_department(auth.uid())));
CREATE POLICY "Admins view all attendance" ON public.attendance FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Faculty mark attendance" ON public.attendance FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'faculty') AND faculty_id = auth.uid() AND public.is_faculty_for_student(auth.uid(), student_id));
CREATE POLICY "Faculty update own attendance" ON public.attendance FOR UPDATE TO authenticated USING (faculty_id = auth.uid());
CREATE POLICY "Admins manage attendance" ON public.attendance FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- FEES POLICIES
CREATE POLICY "Students view own fees" ON public.fees FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "HODs view dept fees" ON public.fees FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'hod') AND EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.department_id = public.get_user_department(auth.uid())));
CREATE POLICY "Admins manage fees" ON public.fees FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- TIMETABLE POLICIES
CREATE POLICY "Authenticated view timetable" ON public.timetable FOR SELECT TO authenticated USING (true);
CREATE POLICY "Faculty insert dept timetable" ON public.timetable FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'faculty') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Faculty update own timetable" ON public.timetable FOR UPDATE TO authenticated USING (faculty_id = auth.uid());
CREATE POLICY "HODs manage dept timetable" ON public.timetable FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid())) WITH CHECK (public.has_role(auth.uid(), 'hod') AND department_id = public.get_user_department(auth.uid()));
CREATE POLICY "Admins manage timetable" ON public.timetable FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- NOTICES POLICIES
CREATE POLICY "Authenticated view notices" ON public.notices FOR SELECT TO authenticated USING (
  audience IS NULL OR public.has_role(auth.uid(), audience)
);
CREATE POLICY "Faculty post notices" ON public.notices FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'faculty') OR public.has_role(auth.uid(), 'hod') OR public.has_role(auth.uid(), 'admin')) AND created_by = auth.uid());
CREATE POLICY "Authors update own notices" ON public.notices FOR UPDATE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "Authors delete own notices" ON public.notices FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fees;
