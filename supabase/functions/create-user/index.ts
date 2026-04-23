// Admin-only edge function to create users with role + profile + student/faculty record
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  email: string;
  password: string;
  full_name: string;
  role: "admin" | "hod" | "faculty" | "student";
  department_id?: string | null;
  // student-only
  roll_no?: string;
  section?: string;
  year?: number;
  // faculty-only
  employee_no?: string;
  subjects?: string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: roleCheck } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleCheck) return json({ error: "Forbidden — admin only" }, 403);

    const body = (await req.json()) as Payload;
    if (!body.email || !body.password || !body.full_name || !body.role) return json({ error: "Missing fields" }, 400);

    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });
    if (createErr) return json({ error: createErr.message }, 400);
    const newUserId = created.user!.id;

    // Update profile dept
    if (body.department_id) {
      await admin.from("profiles").update({ department_id: body.department_id }).eq("id", newUserId);
    }
    // Role
    await admin.from("user_roles").insert({ user_id: newUserId, role: body.role });

    if (body.role === "student") {
      if (!body.roll_no || !body.department_id) return json({ error: "roll_no and department_id required for student" }, 400);
      const { error } = await admin.from("students").insert({
        id: newUserId, roll_no: body.roll_no, department_id: body.department_id,
        section: body.section ?? "A", year: body.year ?? 1,
      });
      if (error) return json({ error: error.message }, 400);
      // Default fee record
      await admin.from("fees").insert({ student_id: newUserId, total_fee: 0, paid_amount: 0, semester: "Sem 1" });
    } else if (body.role === "faculty" || body.role === "hod") {
      if (!body.employee_no || !body.department_id) return json({ error: "employee_no and department_id required" }, 400);
      const { error } = await admin.from("faculty").insert({
        id: newUserId, employee_no: body.employee_no, department_id: body.department_id,
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
