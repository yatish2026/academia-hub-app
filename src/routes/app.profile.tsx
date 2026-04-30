import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import { Award, Receipt, Users, Building2, BookOpen, Megaphone, CalendarCheck, CalendarDays, ChevronRight, LogOut } from "lucide-react";

export const Route = createFileRoute("/app/profile")({
  head: () => ({ meta: [{ title: "My Profile — AcademiaHub" }] }),
  component: MyProfilePage,
});

type ProfileForm = {
  full_name: string;
  phone: string;
  dob: string;
  father_name: string;
  mother_name: string;
  address: string;
};

function MyProfilePage() {
  const { userId, profile, primaryRole, refresh, signOut } = useAuth();
  const [form, setForm] = useState<ProfileForm>({
    full_name: "", phone: "", dob: "", father_name: "", mother_name: "", address: "",
  });
  const [extra, setExtra] = useState<{ roll_no?: string; section?: string; year?: number; employee_no?: string; subjects?: string[]; department?: string }>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!userId) return;
      setLoading(true);
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, phone, dob, father_name, mother_name, address, department_id")
        .eq("id", userId)
        .maybeSingle();
      if (p) {
        setForm({
          full_name: p.full_name ?? "",
          phone: p.phone ?? "",
          dob: p.dob ?? "",
          father_name: p.father_name ?? "",
          mother_name: p.mother_name ?? "",
          address: p.address ?? "",
        });
      }
      const ex: typeof extra = {};
      if (p?.department_id) {
        const { data: d } = await supabase.from("departments").select("name").eq("id", p.department_id).maybeSingle();
        if (d) ex.department = d.name;
      }
      if (primaryRole === "student") {
        const { data: s } = await supabase.from("students").select("roll_no, section, year").eq("id", userId).maybeSingle();
        if (s) Object.assign(ex, s);
      } else if (primaryRole === "faculty" || primaryRole === "hod") {
        const { data: f } = await supabase.from("faculty").select("employee_no, subjects").eq("id", userId).maybeSingle();
        if (f) Object.assign(ex, f);
      }
      setExtra(ex);
      setLoading(false);
    })();
  }, [userId, primaryRole]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        dob: form.dob || null,
        father_name: form.father_name || null,
        mother_name: form.mother_name || null,
        address: form.address || null,
      })
      .eq("id", userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    refresh();
  };

  if (loading) return <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div>
      <PageHeader title="My Profile" description="View and update your personal details" />

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
            {(form.full_name || profile?.email || "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="text-lg font-semibold">{form.full_name || "—"}</div>
            <div className="text-sm text-muted-foreground">{profile?.email}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {primaryRole && (
                <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {ROLE_LABEL[primaryRole]}
                </span>
              )}
              {extra.department && (
                <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {extra.department}
                </span>
              )}
            </div>
          </div>
        </div>

        {primaryRole === "student" && (
          <div className="mb-4 grid grid-cols-3 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Roll no</div><div className="font-medium">{extra.roll_no ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Year</div><div className="font-medium">{extra.year ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Section</div><div className="font-medium">{extra.section ?? "—"}</div></div>
          </div>
        )}
        {(primaryRole === "faculty" || primaryRole === "hod") && (
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Employee no</div><div className="font-medium">{extra.employee_no ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Subjects</div><div className="font-medium">{extra.subjects?.join(", ") || "—"}</div></div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Date of birth</Label><Input type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Father's name</Label><Input value={form.father_name} onChange={(e) => setForm({ ...form, father_name: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Mother's name</Label><Input value={form.mother_name} onChange={(e) => setForm({ ...form, mother_name: e.target.value })} /></div>
          <div className="grid gap-1.5 sm:col-span-2"><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>

      {primaryRole === "student" && (
        <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
          <Link to="/app/marks" className="text-primary hover:underline">View my marks →</Link>
        </div>
      )}
    </div>
  );
}
