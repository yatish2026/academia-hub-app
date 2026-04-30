import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/marks")({
  head: () => ({ meta: [{ title: "Marks — AcademiaHub" }] }),
  component: MarksPage,
});

type Mark = {
  id: string;
  student_id: string;
  faculty_id: string;
  subject: string;
  exam_type: string;
  marks_obtained: number;
  max_marks: number;
};
type StudentLite = { id: string; roll_no: string; section: string; year: number; full_name: string };

function MarksPage() {
  const { primaryRole, profile, userId } = useAuth();
  const [marks, setMarks] = useState<Mark[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Mark | null>(null);
  const [filterStudent, setFilterStudent] = useState<string>("all");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [form, setForm] = useState({
    student_id: "",
    subject: "",
    exam_type: "Internal 1",
    marks_obtained: "",
    max_marks: "100",
  });

  const isStudent = primaryRole === "student";
  const canManage = primaryRole === "faculty" || primaryRole === "hod" || primaryRole === "admin";

  const load = async () => {
    let mq = supabase.from("marks").select("*").order("created_at", { ascending: false });
    if (isStudent && userId) mq = mq.eq("student_id", userId);
    const { data: m } = await mq;
    setMarks((m as Mark[]) ?? []);

    if (canManage) {
      let sq = supabase.from("students").select("id, roll_no, section, year").order("roll_no");
      if ((primaryRole === "faculty" || primaryRole === "hod") && profile?.department_id) {
        sq = sq.eq("department_id", profile.department_id);
      }
      const { data: studs } = await sq;
      const ids = (studs ?? []).map((s) => s.id);
      const nm: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const p of profs ?? []) nm[p.id] = p.full_name;
      }
      setStudents((studs ?? []).map((s) => ({ ...s, full_name: nm[s.id] ?? "—" })));
    }

    if (primaryRole === "faculty" && userId) {
      const { data: f } = await supabase.from("faculty").select("subjects").eq("id", userId).maybeSingle();
      setSubjects(f?.subjects ?? []);
    } else if ((primaryRole === "hod" || primaryRole === "admin") && profile?.department_id) {
      const { data: facs } = await supabase.from("faculty").select("subjects").eq("department_id", profile.department_id);
      const all = new Set<string>();
      for (const f of facs ?? []) (f.subjects ?? []).forEach((s: string) => all.add(s));
      setSubjects(Array.from(all));
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [primaryRole, userId, profile?.department_id]);

  const submit = async () => {
    if (!form.student_id || !form.subject || !userId) return toast.error("Fill all fields");
    const payload = {
      student_id: form.student_id,
      faculty_id: userId,
      subject: form.subject.trim(),
      exam_type: form.exam_type.trim() || "Internal",
      marks_obtained: Number(form.marks_obtained),
      max_marks: Number(form.max_marks) || 100,
    };
    let res;
    if (editing) {
      res = await supabase.from("marks").update(payload).eq("id", editing.id);
    } else {
      res = await supabase.from("marks").upsert(payload, { onConflict: "student_id,subject,exam_type" });
    }
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Mark updated" : "Mark saved");
    setOpen(false);
    setEditing(null);
    setForm({ student_id: "", subject: "", exam_type: "Internal 1", marks_obtained: "", max_marks: "100" });
    load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this mark?")) return;
    const { error } = await supabase.from("marks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const startEdit = (m: Mark) => {
    setEditing(m);
    setForm({
      student_id: m.student_id,
      subject: m.subject,
      exam_type: m.exam_type,
      marks_obtained: String(m.marks_obtained),
      max_marks: String(m.max_marks),
    });
    setOpen(true);
  };

  const studentName = (id: string) => students.find((s) => s.id === id)?.full_name ?? "—";

  // Student grouped view
  const grouped = useMemo(() => {
    const g: Record<string, Mark[]> = {};
    for (const m of marks) {
      if (filterStudent !== "all" && m.student_id !== filterStudent) continue;
      if (filterSubject !== "all" && m.subject !== filterSubject) continue;
      (g[m.subject] ??= []).push(m);
    }
    return g;
  }, [marks, filterStudent, filterSubject]);

  return (
    <div>
      <PageHeader
        title={isStudent ? "My marks" : "Marks"}
        description={isStudent ? "Your marks across subjects" : "Add and manage student marks"}
        action={canManage && (
          <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <SheetTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Add mark</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader><SheetTitle>{editing ? "Edit" : "Add"} mark</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3">
                <div className="grid gap-1.5">
                  <Label>Student</Label>
                  <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })} disabled={!!editing}>
                    <SelectTrigger><SelectValue placeholder="Pick student" /></SelectTrigger>
                    <SelectContent>
                      {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.roll_no} · {s.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Subject</Label>
                  {subjects.length > 0 ? (
                    <Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v })}>
                      <SelectTrigger><SelectValue placeholder="Pick subject" /></SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
                  )}
                </div>
                <div className="grid gap-1.5"><Label>Exam type</Label><Input value={form.exam_type} onChange={(e) => setForm({ ...form, exam_type: e.target.value })} placeholder="Internal 1 / Mid / Final" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5"><Label>Marks</Label><Input type="number" value={form.marks_obtained} onChange={(e) => setForm({ ...form, marks_obtained: e.target.value })} /></div>
                  <div className="grid gap-1.5"><Label>Out of</Label><Input type="number" value={form.max_marks} onChange={(e) => setForm({ ...form, max_marks: e.target.value })} /></div>
                </div>
                <Button className="w-full" onClick={submit}>{editing ? "Update" : "Save"}</Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      />

      {canManage && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <Select value={filterStudent} onValueChange={setFilterStudent}>
            <SelectTrigger><SelectValue placeholder="All students" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All students</SelectItem>
              {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.roll_no} · {s.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger><SelectValue placeholder="All subjects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {Array.from(new Set(marks.map((m) => m.subject))).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No marks yet.</div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([subject, list]) => (
            <div key={subject} className="rounded-xl border bg-card overflow-hidden">
              <div className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">{subject}</div>
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr>
                    {!isStudent && <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Student</th>}
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Exam</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Marks</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">%</th>
                    {canManage && <th className="px-3 py-2"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.map((m) => {
                    const pct = m.max_marks > 0 ? Math.round((m.marks_obtained / m.max_marks) * 100) : 0;
                    return (
                      <tr key={m.id}>
                        {!isStudent && <td className="px-3 py-2 font-medium">{studentName(m.student_id)}</td>}
                        <td className="px-3 py-2 text-muted-foreground">{m.exam_type}</td>
                        <td className="px-3 py-2">{m.marks_obtained} / {m.max_marks}</td>
                        <td className={`px-3 py-2 font-medium ${pct >= 40 ? "text-success" : "text-destructive"}`}>{pct}%</td>
                        {canManage && (
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => startEdit(m)} className="mr-2 text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => remove(m.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
