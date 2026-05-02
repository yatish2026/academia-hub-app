import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { RoleGuard } from "@/components/RoleGuard";
import { ScopeFilters, ALL_SCOPE, type Scope } from "@/components/ScopeFilters";
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/app/fees")({
  head: () => ({ meta: [{ title: "Fees — AcademiaHub" }] }),
  component: FeesPage,
});

type FeeRow = {
  id: string;
  student_id: string;
  total_fee: number;
  paid_amount: number;
  due_amount: number;
  semester: string;
  fee_type: string;
  students?: { roll_no: string; section: string; year: number; department_id: string; profiles: { full_name: string } | null } | null;
};

const FEE_TYPES = ["Tuition Fee", "Hostel Fee", "Lab Fee", "Library Fee", "Other"];

function FeesPage() {
  const { primaryRole, userId } = useAuth();
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [scope, setScope] = useState<Scope>(ALL_SCOPE);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ total: "", paid: "" });
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ student_id: "", fee_type: "Tuition Fee", semester: "Sem 1", total_fee: "", paid_amount: "0", custom_fee_type: "" });
  const [studentsList, setStudentsList] = useState<{ id: string; roll_no: string; full_name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const canManage = primaryRole === "admin" || primaryRole === "hod";

  const load = async () => {
    if (primaryRole === "student" && userId) {
      const { data } = await supabase.from("fees").select("*").eq("student_id", userId);
      setRows((data as FeeRow[]) ?? []);
    } else {
      const { data } = await supabase.from("fees").select("*, students(roll_no, section, year, department_id, profiles(full_name))").order("updated_at", { ascending: false });
      setRows((data as unknown as FeeRow[]) ?? []);
    }
  };

  const loadStudents = async () => {
    if (!canManage) return;
    const { data: studs } = await supabase.from("students").select("id, roll_no").order("roll_no");
    const ids = (studs ?? []).map((s) => s.id);
    const nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      for (const p of profs ?? []) nameMap[p.id] = p.full_name;
    }
    setStudentsList((studs ?? []).map((s) => ({ id: s.id, roll_no: s.roll_no, full_name: nameMap[s.id] ?? "—" })));
  };

  useEffect(() => { load(); loadStudents(); }, [primaryRole, userId]);

  const filteredRows = primaryRole === "student" ? rows : rows.filter((r) => {
    const s = r.students;
    if (!s) return scope.department_id === "all" && scope.year === "all" && scope.section === "all";
    if (scope.department_id !== "all" && s.department_id !== scope.department_id) return false;
    if (scope.year !== "all" && s.year !== Number(scope.year)) return false;
    if (scope.section !== "all" && s.section !== scope.section) return false;
    return true;
  });

  const totalAll = filteredRows.reduce((a, r) => a + Number(r.total_fee), 0);
  const paidAll = filteredRows.reduce((a, r) => a + Number(r.paid_amount), 0);
  const dueAll = totalAll - paidAll;

  const saveEdit = async (id: string) => {
    const total = Number(editForm.total);
    const paid = Number(editForm.paid);
    const { error } = await supabase.from("fees").update({
      total_fee: total,
      paid_amount: paid,
      due_amount: total - paid,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Updated"); setEditId(null); load(); }
  };

  const addFee = async () => {
    if (!addForm.student_id) return toast.error("Select a student");
    const feeType = addForm.fee_type === "Other" ? (addForm.custom_fee_type.trim() || "Other") : addForm.fee_type;
    const total = Number(addForm.total_fee);
    const paid = Number(addForm.paid_amount);
    setSaving(true);
    const { error } = await supabase.from("fees").insert({
      student_id: addForm.student_id,
      fee_type: feeType,
      semester: addForm.semester,
      total_fee: total,
      paid_amount: paid,
      due_amount: total - paid,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Fee added");
    setAddOpen(false);
    setAddForm({ student_id: "", fee_type: "Tuition Fee", semester: "Sem 1", total_fee: "", paid_amount: "0", custom_fee_type: "" });
    load();
  };

  if (primaryRole === "student") {
    return (
      <div>
        <PageHeader title="My fees" description="Your fee statement" />
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={`₹${totalAll.toLocaleString()}`} />
          <StatCard label="Paid" value={`₹${paidAll.toLocaleString()}`} accent="success" />
          <StatCard label="Due" value={`₹${dueAll.toLocaleString()}`} accent={dueAll > 0 ? "destructive" : "success"} />
        </div>
        <div className="mt-4 rounded-xl border bg-card divide-y">
          {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No fee records.</p>}
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">{r.fee_type ?? "Tuition Fee"}</div>
                <div className="text-xs text-muted-foreground">{r.semester} · Total ₹{Number(r.total_fee).toLocaleString()} · Paid ₹{Number(r.paid_amount).toLocaleString()}</div>
              </div>
              <div className={`text-sm font-semibold ${Number(r.due_amount) > 0 ? "text-destructive" : "text-success"}`}>₹{Number(r.due_amount).toLocaleString()} due</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allow={["admin", "hod"]}>
      <PageHeader
        title="Fees"
        description={primaryRole === "admin" ? "Manage all student fees" : "View department fees"}
        action={canManage && (
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Add fee</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader><SheetTitle>Add fee record</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3">
                <div className="grid gap-1.5">
                  <Label>Student</Label>
                  <Select value={addForm.student_id} onValueChange={(v) => setAddForm({ ...addForm, student_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick student" /></SelectTrigger>
                    <SelectContent>
                      {studentsList.map((s) => <SelectItem key={s.id} value={s.id}>{s.roll_no} · {s.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Fee type</Label>
                  <Select value={addForm.fee_type} onValueChange={(v) => setAddForm({ ...addForm, fee_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FEE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {addForm.fee_type === "Other" && (
                  <div className="grid gap-1.5">
                    <Label>Custom fee name</Label>
                    <Input value={addForm.custom_fee_type} onChange={(e) => setAddForm({ ...addForm, custom_fee_type: e.target.value })} placeholder="e.g. Transport Fee" />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>Semester</Label>
                  <Select value={addForm.semester} onValueChange={(v) => setAddForm({ ...addForm, semester: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Sem 1", "Sem 2", "Sem 3", "Sem 4", "Sem 5", "Sem 6", "Sem 7", "Sem 8"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5"><Label>Total fee (₹)</Label><Input type="number" value={addForm.total_fee} onChange={(e) => setAddForm({ ...addForm, total_fee: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Paid (₹)</Label><Input type="number" value={addForm.paid_amount} onChange={(e) => setAddForm({ ...addForm, paid_amount: e.target.value })} /></div>
                </div>
                <Button className="w-full" onClick={addFee} disabled={saving}>{saving ? "Saving…" : "Add fee"}</Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      />
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total billed" value={`₹${totalAll.toLocaleString()}`} />
        <StatCard label="Collected" value={`₹${paidAll.toLocaleString()}`} accent="success" />
        <StatCard label="Outstanding" value={`₹${dueAll.toLocaleString()}`} accent="destructive" />
      </div>
      <div className="mt-4 rounded-xl border bg-card p-3">
        <ScopeFilters scope={scope} onChange={setScope} />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border bg-card">
        <div className="divide-y">
          {filteredRows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No fee records match the filters.</p>}
          {filteredRows.map((r) => {
            const isEditing = editId === r.id;
            return (
              <div key={r.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="text-sm font-medium">{r.students?.profiles?.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.students?.roll_no} · {r.fee_type ?? "Tuition Fee"} · {r.semester}</div>
                </div>
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Total</Label>
                        <Input type="number" value={editForm.total} onChange={(e) => setEditForm({ ...editForm, total: e.target.value })} className="h-9 w-24" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Paid</Label>
                        <Input type="number" value={editForm.paid} onChange={(e) => setEditForm({ ...editForm, paid: e.target.value })} className="h-9 w-24" />
                      </div>
                      <Button size="sm" onClick={() => saveEdit(r.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Due</div>
                        <div className={`text-sm font-semibold ${Number(r.due_amount) > 0 ? "text-destructive" : "text-success"}`}>₹{Number(r.due_amount).toLocaleString()}</div>
                      </div>
                      {canManage && (
                        <Button size="sm" variant="outline" onClick={() => { setEditId(r.id); setEditForm({ total: String(r.total_fee), paid: String(r.paid_amount) }); }}>
                          <Pencil className="mr-1 h-3 w-3" /> Edit
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </RoleGuard>
  );
}
