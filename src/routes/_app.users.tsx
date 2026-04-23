import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "Users — AcademiaHub" }] }),
  component: UsersPage,
});

type Row = { id: string; full_name: string; email: string; department_id: string | null };
type Dept = { id: string; name: string };

function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, AppRole[]>>({});
  const [depts, setDepts] = useState<Dept[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // form fields
  const [form, setForm] = useState({
    email: "", password: "", full_name: "", role: "student" as AppRole,
    department_id: "", roll_no: "", section: "A", year: "1",
    employee_no: "", subjects: "",
  });

  const load = async () => {
    const [{ data: profiles }, { data: roles }, { data: dpts }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, department_id"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("departments").select("id, name"),
    ]);
    setRows(profiles ?? []);
    const map: Record<string, AppRole[]> = {};
    for (const r of roles ?? []) (map[r.user_id] ??= []).push(r.role as AppRole);
    setRoleMap(map);
    setDepts(dpts ?? []);
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    setSubmitting(true);
    const payload: Record<string, unknown> = {
      email: form.email, password: form.password, full_name: form.full_name, role: form.role,
      department_id: form.department_id || null,
    };
    if (form.role === "student") {
      payload.roll_no = form.roll_no;
      payload.section = form.section;
      payload.year = Number(form.year);
    } else if (form.role === "faculty" || form.role === "hod") {
      payload.employee_no = form.employee_no;
      payload.subjects = form.subjects.split(",").map((s) => s.trim()).filter(Boolean);
    }
    const { data, error } = await supabase.functions.invoke("create-user", { body: payload });
    setSubmitting(false);
    if (error || (data as { error?: string })?.error) {
      toast.error(error?.message || (data as { error?: string }).error || "Failed");
      return;
    }
    toast.success("User created");
    setOpen(false);
    setForm({ email: "", password: "", full_name: "", role: "student", department_id: "", roll_no: "", section: "A", year: "1", employee_no: "", subjects: "" });
    load();
  };

  const deptName = (id: string | null) => depts.find((d) => d.id === id)?.name ?? "—";

  return (
    <RoleGuard allow={["admin"]}>
      <PageHeader
        title="Users"
        description="All users in the system"
        action={
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> New user</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader><SheetTitle>Create user</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3">
                <div className="grid gap-1.5"><Label>Full name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label>Password</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 chars" /></div>
                <div className="grid gap-1.5">
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Super Admin</SelectItem>
                      <SelectItem value="hod">Head of Department</SelectItem>
                      <SelectItem value="faculty">Faculty</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.role !== "admin" && (
                  <div className="grid gap-1.5">
                    <Label>Department</Label>
                    <Select value={form.department_id} onValueChange={(v) => setForm({ ...form, department_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Pick department" /></SelectTrigger>
                      <SelectContent>
                        {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {form.role === "student" && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="grid gap-1.5"><Label>Roll no</Label><Input value={form.roll_no} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label>Section</Label><Input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} /></div>
                      <div className="grid gap-1.5"><Label>Year</Label><Input type="number" min="1" max="5" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
                    </div>
                  </>
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
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Department</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3 font-medium">{r.full_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-3">
                  {(roleMap[r.id] ?? []).map((role) => (
                    <span key={role} className="mr-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{ROLE_LABEL[role]}</span>
                  ))}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{deptName(r.department_id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RoleGuard>
  );
}
