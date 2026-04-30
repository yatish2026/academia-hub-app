import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, KeyRound } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/users")({
  head: () => ({ meta: [{ title: "Users — AcademiaHub" }] }),
  component: UsersPage,
});

type Row = { id: string; full_name: string; email: string; department_id: string | null; must_reset_password: boolean };
type Dept = { id: string; name: string };

function generateTempPassword() {
  // 10 chars: uppercase + lowercase + digit + symbol
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%&*";
  const all = upper + lower + digit + sym;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = pick(upper) + pick(lower) + pick(digit) + pick(sym);
  for (let i = 0; i < 6; i++) out += pick(all);
  return out.split("").sort(() => Math.random() - 0.5).join("");
}

function UsersPage() {
  const { primaryRole, profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, AppRole[]>>({});
  const [depts, setDepts] = useState<Dept[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  const allowedRoles = useMemo<AppRole[]>(() => {
    if (primaryRole === "admin") return ["hod", "faculty", "student"];
    if (primaryRole === "hod") return ["faculty", "student"];
    if (primaryRole === "faculty") return ["student"];
    return [];
  }, [primaryRole]);

  const [form, setForm] = useState({
    email: "",
    password: generateTempPassword(),
    full_name: "",
    role: "student" as AppRole,
    department_id: "",
    roll_no: "",
    section: "A",
    year: "1",
    employee_no: "",
    subjects: "",
  });

  // when role list changes, ensure form.role is allowed
  useEffect(() => {
    if (allowedRoles.length && !allowedRoles.includes(form.role)) {
      setForm((f) => ({ ...f, role: allowedRoles[0] }));
    }
  }, [allowedRoles, form.role]);

  // HOD/faculty: lock department to their own
  useEffect(() => {
    if ((primaryRole === "hod" || primaryRole === "faculty") && profile?.department_id) {
      setForm((f) => ({ ...f, department_id: profile.department_id! }));
    }
  }, [primaryRole, profile?.department_id]);

  const load = async () => {
    const [{ data: profiles }, { data: roles }, { data: dpts }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, department_id, must_reset_password"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("departments").select("id, name"),
    ]);
    setRows((profiles as Row[]) ?? []);
    const map: Record<string, AppRole[]> = {};
    for (const r of roles ?? []) (map[r.user_id] ??= []).push(r.role as AppRole);
    setRoleMap(map);
    setDepts(dpts ?? []);
  };

  useEffect(() => { load(); }, []);

  const validateEdu = (email: string) => /\.edu(\.[a-z]{2,})?$/i.test(email.trim());

  const submit = async () => {
    if (!form.email.trim() || !form.full_name.trim()) return toast.error("Name and email required");
    if (form.password.length < 8) return toast.error("Temporary password must be at least 8 characters");
    if (!validateEdu(form.email)) {
      const ok = window.confirm("Email is not a .edu address. Create user anyway?");
      if (!ok) return;
    }

    setSubmitting(true);
    const payload: Record<string, unknown> = {
      email: form.email.trim(),
      password: form.password,
      full_name: form.full_name.trim(),
      role: form.role,
      department_id: form.department_id || null,
    };
    if (form.role === "student") {
      if (!form.roll_no.trim()) { setSubmitting(false); return toast.error("Roll number required"); }
      payload.roll_no = form.roll_no.trim();
      payload.section = form.section;
      payload.year = Number(form.year);
    } else if (form.role === "faculty" || form.role === "hod") {
      if (!form.employee_no.trim()) { setSubmitting(false); return toast.error("Employee number required"); }
      payload.employee_no = form.employee_no.trim();
      payload.subjects = form.subjects.split(",").map((s) => s.trim()).filter(Boolean);
    }
    const { data, error } = await supabase.functions.invoke("create-user", { body: payload });
    setSubmitting(false);
    if (error || (data as { error?: string })?.error) {
      return toast.error(error?.message || (data as { error?: string }).error || "Failed");
    }
    toast.success("User created");
    setCreatedCreds({ email: form.email, password: form.password });
    setOpen(false);
    setForm({
      ...form,
      email: "",
      password: generateTempPassword(),
      full_name: "",
      roll_no: "",
      employee_no: "",
      subjects: "",
    });
    load();
  };

  const deptName = (id: string | null) => depts.find((d) => d.id === id)?.name ?? "—";

  // Filter visible users by role scope
  const visibleRows = rows.filter((r) => {
    if (primaryRole === "admin") return true;
    if (primaryRole === "hod" || primaryRole === "faculty") return r.department_id === profile?.department_id;
    return false;
  });

  const description =
    primaryRole === "admin" ? "All users in the system"
    : primaryRole === "hod" ? "Faculty and students in your department"
    : "Students in your department";

  return (
    <RoleGuard allow={["admin", "hod", "faculty"]}>
      <PageHeader
        title="Users"
        description={description}
        action={
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> New user</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader><SheetTitle>Create user</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3">
                <div className="grid gap-1.5"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Email (.edu preferred)</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@college.edu" /></div>
                <div className="grid gap-1.5">
                  <Label>Temporary password</Label>
                  <div className="flex gap-2">
                    <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, password: generateTempPassword() })} aria-label="Regenerate">
                      <KeyRound className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">User will be forced to change this on first sign in.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allowedRoles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.role !== "admin" && (
                  <div className="grid gap-1.5">
                    <Label>Department</Label>
                    {primaryRole === "admin" ? (
                      <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Pick department" /></SelectTrigger>
                        <SelectContent>
                          {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={deptName(profile?.department_id ?? null)} disabled />
                    )}
                  </div>
                )}
                {form.role === "student" && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="grid gap-1.5"><Label>Roll no</Label><Input value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label>Section</Label><Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label>Year</Label><Input type="number" min="1" max="5" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
                  </div>
                )}
                {(form.role === "faculty" || form.role === "hod") && (
                  <>
                    <div className="grid gap-1.5"><Label>Employee no</Label><Input value={form.employee_no} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} /></div>
                    <div className="grid gap-1.5"><Label>Subjects (comma-separated)</Label><Input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="DSA, OS, DB" /></div>
                  </>
                )}
                <Button className="w-full" onClick={submit} disabled={submitting || !form.email || !form.password || !form.full_name}>
                  {submitting ? "Creating…" : "Create user"}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      {createdCreds && (
        <div className="mb-4 rounded-xl border-2 border-success/40 bg-success/5 p-4">
          <div className="mb-2 text-sm font-semibold text-success">User created — share these credentials securely</div>
          <div className="grid gap-1 text-sm">
            <div><span className="text-muted-foreground">Email:</span> <code className="font-mono">{createdCreds.email}</code></div>
            <div><span className="text-muted-foreground">Temp password:</span> <code className="font-mono">{createdCreds.password}</code></div>
          </div>
          <button onClick={() => setCreatedCreds(null)} className="mt-2 text-xs text-muted-foreground hover:underline">Dismiss</button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Department</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleRows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No users yet.</td></tr>
            )}
            {visibleRows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium">
                  <Link to="/app/users/$userId" params={{ userId: r.id }} className="hover:text-primary hover:underline">
                    {r.full_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-3">
                  {(roleMap[r.id] ?? []).map((role) => (
                    <span key={role} className="mr-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{ROLE_LABEL[role]}</span>
                  ))}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{deptName(r.department_id)}</td>
                <td className="px-4 py-3">
                  {r.must_reset_password ? (
                    <span className="inline-flex rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">Pending reset</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">Active</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RoleGuard>
  );
}
