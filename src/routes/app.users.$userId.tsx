import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/app/users/$userId")({
  head: () => ({ meta: [{ title: "User — AcademiaHub" }] }),
  component: UserDetailPage,
});

type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  father_name: string | null;
  mother_name: string | null;
  address: string | null;
  department_id: string | null;
  must_reset_password: boolean;
};

function UserDetailPage() {
  const { userId } = Route.useParams();
  const { primaryRole } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [dept, setDept] = useState<string>("—");
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [att, setAtt] = useState<{ p: number; t: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, dob, father_name, mother_name, address, department_id, must_reset_password")
        .eq("id", userId)
        .maybeSingle();
      setProfile((p as Profile) ?? null);
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const rs = (r ?? []).map((x) => x.role as AppRole);
      setRoles(rs);
      if (p?.department_id) {
        const { data: d } = await supabase.from("departments").select("name").eq("id", p.department_id).maybeSingle();
        if (d) setDept(d.name);
      }
      if (rs.includes("student")) {
        const { data: s } = await supabase.from("students").select("roll_no, section, year").eq("id", userId).maybeSingle();
        if (s) setExtra(s);
        const { data: a } = await supabase.from("attendance").select("status").eq("student_id", userId);
        if (a) setAtt({ p: a.filter((x) => x.status === "present").length, t: a.length });
      } else if (rs.includes("faculty") || rs.includes("hod")) {
        const { data: f } = await supabase.from("faculty").select("employee_no, subjects").eq("id", userId).maybeSingle();
        if (f) setExtra(f);
      }
      setLoading(false);
    })();
  }, [userId]);

  if (loading) return <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!profile) return <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">User not found or you don't have access.</div>;

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">{value || "—"}</div>
    </div>
  );

  return (
    <RoleGuard allow={["admin", "hod", "faculty"]}>
      <div className="mb-3">
        <Link to="/app/users" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to users
        </Link>
      </div>

      <PageHeader title={profile.full_name} description={profile.email} />

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <span key={r} className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{ROLE_LABEL[r]}</span>
          ))}
          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{dept}</span>
          {profile.must_reset_password && (
            <span className="inline-flex rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">Pending password reset</span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" value={profile.email} />
          <Field label="Phone" value={profile.phone} />
          <Field label="Date of birth" value={profile.dob} />
          <Field label="Father's name" value={profile.father_name} />
          <Field label="Mother's name" value={profile.mother_name} />
          <Field label="Address" value={profile.address} />
          {roles.includes("student") && (
            <>
              <Field label="Roll no" value={String((extra as { roll_no?: string }).roll_no ?? "")} />
              <Field label="Year" value={String((extra as { year?: number }).year ?? "")} />
              <Field label="Section" value={String((extra as { section?: string }).section ?? "")} />
              {att && <Field label="Attendance" value={`${att.t ? Math.round((att.p / att.t) * 100) : 0}%  (${att.p}/${att.t})`} />}
            </>
          )}
          {(roles.includes("faculty") || roles.includes("hod")) && (
            <>
              <Field label="Employee no" value={String((extra as { employee_no?: string }).employee_no ?? "")} />
              <Field label="Subjects" value={(extra as { subjects?: string[] }).subjects?.join(", ") ?? ""} />
            </>
          )}
        </div>
      </div>

      {roles.includes("student") && (primaryRole === "faculty" || primaryRole === "hod" || primaryRole === "admin") && (
        <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
          <Link to="/app/marks" className="text-primary hover:underline">Manage marks for this student →</Link>
        </div>
      )}
    </RoleGuard>
  );
}
