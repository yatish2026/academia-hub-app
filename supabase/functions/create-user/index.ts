// Edge function to create users.
// Allowed callers (and what they can create):
//   admin   -> hod, faculty, student   (any department)
//   hod     -> faculty, student        (only own department)
//   faculty -> student                 (only own department)
// @ts-ignore: Deno URL imports are not recognized by standard Node TypeScript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AppRole = "admin" | "hod" | "faculty" | "student";

type Payload = {
  email: string;
  password: string;
  full_name: string;
  role: AppRole;
  department_id?: string | null;
  roll_no?: string;
  section?: string;
  year?: number;
  employee_no?: string;
  subjects?: string[];
};

const PERMISSIONS: Record<AppRole, AppRole[]> = {
  admin: ["hod", "faculty", "student"],
  hod: ["faculty", "student"],
  faculty: ["student"],
  student: [],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Determine caller's highest role + department
    const [rolesRes, callerProfileRes] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", user.id),
      admin.from("profiles").select("department_id").eq("id", user.id).maybeSingle(),
    ]);
    const callerRoles = (rolesRes.data ?? []).map((r) => r.role as AppRole);
    const ROLE_PRIORITY: AppRole[] = ["admin", "hod", "faculty", "student"];
    const callerRole = ROLE_PRIORITY.find((r) => callerRoles.includes(r));
    if (!callerRole) return json({ error: "Forbidden — no role assigned" }, 403);
    const callerDept: string | null = callerProfileRes.data?.department_id ?? null;

    const body = (await req.json()) as Payload;
    if (!body.email || !body.password || !body.full_name || !body.role) {
      return json({ error: "Missing fields (email, password, full_name, role)" }, 400);
    }

    // Permission check
    const allowed = PERMISSIONS[callerRole] ?? [];
    if (!allowed.includes(body.role)) {
      return json({ error: `Forbidden — your role (${callerRole}) cannot create ${body.role}` }, 403);
    }

    // Department scoping for HOD / faculty
    if (callerRole === "hod" || callerRole === "faculty") {
      if (!callerDept) return json({ error: "Your account has no department assigned" }, 403);
      if (!body.department_id) {
        body.department_id = callerDept;
      } else if (body.department_id !== callerDept) {
        return json({ error: "You can only create users in your own department" }, 403);
      }
    }

    // Validate role-specific fields
    if (body.role === "student" && (!body.roll_no || !body.department_id)) {
      return json({ error: "roll_no and department_id required for student" }, 400);
    }
    if ((body.role === "faculty" || body.role === "hod") && (!body.employee_no || !body.department_id)) {
      return json({ error: "employee_no and department_id required for faculty/hod" }, 400);
    }

    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });
    if (createErr) return json({ error: createErr.message }, 400);
    const newUserId = created.user!.id;

    // Profile (handle_new_user trigger creates the row; we update dept + ensure must_reset)
    await admin
      .from("profiles")
      .update({ department_id: body.department_id ?? null, must_reset_password: true })
      .eq("id", newUserId);

    // Role
    const { error: roleErr } = await admin.from("user_roles").insert({ user_id: newUserId, role: body.role });
    if (roleErr) return json({ error: `Role assignment failed: ${roleErr.message}` }, 400);

    // Role-specific row
    if (body.role === "student") {
      const { error } = await admin.from("students").insert({
        id: newUserId,
        roll_no: body.roll_no!,
        department_id: body.department_id!,
        section: body.section ?? "A",
        year: body.year ?? 1,
      });
      if (error) return json({ error: error.message }, 400);
      await admin.from("fees").insert({ student_id: newUserId, total_fee: 0, paid_amount: 0, semester: "Sem 1" });
    } else if (body.role === "faculty" || body.role === "hod") {
      const { error } = await admin.from("faculty").insert({
        id: newUserId,
        employee_no: body.employee_no!,
        department_id: body.department_id!,
        subjects: body.subjects ?? [],
      });
      if (error) return json({ error: error.message }, 400);
      if (body.role === "hod") {
        await admin.from("departments").update({ hod_id: newUserId }).eq("id", body.department_id);
      }
    }

    return json({ ok: true, user_id: newUserId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
