import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { RoleGuard } from "@/components/RoleGuard";
import { Building2, Plus, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/app/departments")({
  head: () => ({ meta: [{ title: "Departments — AcademiaHub" }] }),
  component: DepartmentsPage,
});

type Row = { id: string; name: string; code: string; hod_id: string | null };
type Person = { id: string; full_name: string };

function DepartmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, { s: number; f: number }>>({});
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });
  const [saving, setSaving] = useState(false);
  const [hodDialog, setHodDialog] = useState<Row | null>(null);
  const [hodCandidates, setHodCandidates] = useState<Person[]>([]);
  const [pickedHod, setPickedHod] = useState("");

  const load = async () => {
    const { data } = await supabase.from("departments").select("*").order("name");
    const list = (data ?? []) as Row[];
    setRows(list);

    const c: Record<string, { s: number; f: number }> = {};
    await Promise.all(
      list.map(async (d) => {
        const [s, f] = await Promise.all([
          supabase.from("students").select("*", { count: "exact", head: true }).eq("department_id", d.id),
          supabase.from("faculty").select("*", { count: "exact", head: true }).eq("department_id", d.id),
        ]);
        c[d.id] = { s: s.count ?? 0, f: f.count ?? 0 };
      })
    );
    setCounts(c);

    const hodIds = list.map((d) => d.hod_id).filter(Boolean) as string[];
    if (hodIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", hodIds);
      const map: Record<string, string> = {};
      for (const p of profs ?? []) map[p.id] = p.full_name;
      setProfileMap(map);
    } else {
      setProfileMap({});
    }
  };

  useEffect(() => { load(); }, []);

  const addDepartment = async () => {
    if (!form.name.trim() || !form.code.trim()) return toast.error("Name and code required");
    setSaving(true);
    const { error } = await supabase
      .from("departments")
      .insert({ name: form.name.trim(), code: form.code.trim().toUpperCase() });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Department created");
    setForm({ name: "", code: "" });
    setOpen(false);
    load();
  };

  const openHodPicker = async (dept: Row) => {
    setHodDialog(dept);
    setPickedHod(dept.hod_id ?? "");
    // Candidates = faculty already in this department
    const { data: facs } = await supabase
      .from("faculty")
      .select("id")
      .eq("department_id", dept.id);
    const ids = (facs ?? []).map((f) => f.id);
    if (ids.length === 0) { setHodCandidates([]); return; }
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    setHodCandidates((profs ?? []).map((p) => ({ id: p.id, full_name: p.full_name })));
  };

  const assignHod = async () => {
    if (!hodDialog || !pickedHod) return;
    const { error: dErr } = await supabase
      .from("departments")
      .update({ hod_id: pickedHod })
      .eq("id", hodDialog.id);
    if (dErr) return toast.error(dErr.message);
    // Promote to hod role if they don't already have it
    const { data: existing } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", pickedHod);
    const hasHod = (existing ?? []).some((r) => r.role === "hod");
    if (!hasHod) {
      await supabase.from("user_roles").insert({ user_id: pickedHod, role: "hod" });
    }
    toast.success("HOD assigned");
    setHodDialog(null);
    load();
  };

  return (
    <RoleGuard allow={["admin"]}>
      <PageHeader
        title="Departments"
        description="Manage academic departments and assign HODs"
        action={
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> New department</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Create department</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3">
                <div className="grid gap-1.5">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Computer Science" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Code</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="CSE" />
                </div>
                <Button className="w-full" onClick={addDepartment} disabled={saving}>
                  {saving ? "Creating…" : "Create"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  After creating, you can assign an HOD by clicking the department card. The HOD must first be created as faculty under this department.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((d) => (
          <div key={d.id} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">{d.code}</div>
              </div>
            </div>
            <div className="mb-3 flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">HOD</span>
              <span className="font-medium">{d.hod_id ? profileMap[d.hod_id] ?? "—" : "Not assigned"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-muted/50 py-2">
                <div className="text-lg font-semibold">{counts[d.id]?.s ?? 0}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Students</div>
              </div>
              <div className="rounded-md bg-muted/50 py-2">
                <div className="text-lg font-semibold">{counts[d.id]?.f ?? 0}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Faculty</div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => openHodPicker(d)}>
              <UserCog className="mr-1 h-4 w-4" /> {d.hod_id ? "Change HOD" : "Assign HOD"}
            </Button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="col-span-full rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            No departments yet. Click "New department" to get started.
          </p>
        )}
      </div>

      <Dialog open={!!hodDialog} onOpenChange={(o) => !o && setHodDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign HOD — {hodDialog?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {hodCandidates.length === 0 ? (
              <p className="rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                No faculty in this department yet. Create a faculty user first under Users page, then come back to assign them as HOD.
              </p>
            ) : (
              <div className="grid gap-1.5">
                <Label>Pick faculty</Label>
                <Select value={pickedHod} onValueChange={setPickedHod}>
                  <SelectTrigger><SelectValue placeholder="Select faculty" /></SelectTrigger>
                  <SelectContent>
                    {hodCandidates.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="w-full" disabled={!pickedHod} onClick={assignHod}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </RoleGuard>
  );
}
