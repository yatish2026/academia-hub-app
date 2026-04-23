import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/app/attendance")({
  head: () => ({ meta: [{ title: "Attendance — AcademiaHub" }] }),
  component: AttendancePage,
});

type StudentRow = { id: string; roll_no: string; section: string; profiles: { full_name: string } | null };

function AttendancePage() {
  const { primaryRole, userId } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [marks, setMarks] = useState<Record<string, "present" | "absent">>({});
  const [myAttendance, setMyAttendance] = useState<{ subject: string; date: string; status: string }[]>([]);

  useEffect(() => {
    (async () => {
      if (primaryRole === "student" && userId) {
        const { data } = await supabase.from("attendance").select("subject, date, status").eq("student_id", userId).order("date", { ascending: false }).limit(50);
        setMyAttendance(data ?? []);
        return;
      }
      if (primaryRole === "faculty" && userId) {
        const { data: f } = await supabase.from("faculty").select("subjects").eq("id", userId).maybeSingle();
        setSubjects(f?.subjects ?? []);
        if (f?.subjects?.[0]) setSubject(f.subjects[0]);
      }
      // Load students visible to this user
      const { data: st } = await supabase.from("students").select("id, roll_no, section, profiles(full_name)").order("roll_no");
      setStudents((st as unknown as StudentRow[]) ?? []);
    })();
  }, [primaryRole, userId]);

  const toggle = (id: string) => setMarks((m) => ({ ...m, [id]: m[id] === "present" ? "absent" : "present" }));

  const submit = async () => {
    if (!subject || !date || !userId) { toast.error("Pick a subject and date"); return; }
    const rows = students.map((s) => ({
      student_id: s.id, faculty_id: userId, subject, date, status: marks[s.id] ?? "present" as const,
    }));
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,subject,date" });
    if (error) toast.error(error.message); else toast.success(`Saved attendance for ${rows.length} students`);
  };

  if (primaryRole === "student") {
    const total = myAttendance.length;
    const present = myAttendance.filter((a) => a.status === "present").length;
    const pct = total ? Math.round((present / total) * 100) : 0;
    return (
      <div>
        <PageHeader title="My attendance" description={`Overall: ${present}/${total} (${pct}%)`} />
        <div className="rounded-xl border bg-card divide-y">
          {myAttendance.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No records yet.</p>}
          {myAttendance.map((a, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium">{a.subject}</div>
                <div className="text-xs text-muted-foreground">{a.date}</div>
              </div>
              {a.status === "present" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Present</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive"><XCircle className="h-3.5 w-3.5" /> Absent</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Admin / HOD / Faculty marker view
  const canMark = primaryRole === "faculty";
  return (
    <div>
      <PageHeader title="Attendance" description={canMark ? "Mark today's attendance" : "View attendance"} />
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger><SelectValue placeholder="Pick subject" /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                {subjects.length === 0 && <SelectItem value="General">General</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {canMark && (
            <div className="flex items-end">
              <Button className="w-full" onClick={submit}>Save attendance</Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-card divide-y">
        {students.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No students visible.</p>}
        {students.map((s) => {
          const status = marks[s.id] ?? "present";
          return (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.profiles?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{s.roll_no} · Sec {s.section}</div>
              </div>
              {canMark ? (
                <button
                  onClick={() => toggle(s.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    status === "present"
                      ? "bg-success/10 text-success hover:bg-success/20"
                      : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                  }`}
                >
                  {status === "present" ? "Present" : "Absent"}
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
