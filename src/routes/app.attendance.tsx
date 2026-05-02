import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, ChevronRight } from "lucide-react";
import { ScopeFilters, ALL_SCOPE, type Scope } from "@/components/ScopeFilters";
import { DAYS, todayDow } from "@/lib/types";

export const Route = createFileRoute("/app/attendance")({
  head: () => ({ meta: [{ title: "Attendance — AcademiaHub" }] }),
  component: AttendancePage,
});

type StudentRow = { id: string; roll_no: string; section: string; year: number; department_id: string; profiles: { full_name: string } | null };
type TimetableClass = { id: string; subject: string; section: string; year: number; department_id: string; start_time: string | null; end_time: string | null };

function AttendancePage() {
  const { primaryRole, userId, profile } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [marks, setMarks] = useState<Record<string, "present" | "absent">>({});
  const [existing, setExisting] = useState<Record<string, "present" | "absent">>({});
  const [myAttendance, setMyAttendance] = useState<{ subject: string; date: string; status: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<Scope>(ALL_SCOPE);

  // Faculty: today's classes from timetable
  const [todayClasses, setTodayClasses] = useState<TimetableClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<TimetableClass | null>(null);

  // Load today's classes for faculty
  useEffect(() => {
    if (primaryRole !== "faculty" || !userId) return;
    (async () => {
      const dow = todayDow(); // 0=Sun, 1=Mon..6=Sat
      if (dow === 0) { setTodayClasses([]); return; } // No classes on Sunday
      const { data } = await supabase
        .from("timetable")
        .select("id, subject, section, year, department_id, start_time, end_time")
        .eq("faculty_id", userId)
        .eq("day_of_week", dow)
        .eq("approved", true)
        .order("start_time");
      setTodayClasses((data as TimetableClass[]) ?? []);
    })();
  }, [primaryRole, userId]);

  // load students/subjects on role change
  useEffect(() => {
    (async () => {
      if (primaryRole === "student" && userId) {
        const { data } = await supabase
          .from("attendance")
          .select("subject, date, status")
          .eq("student_id", userId)
          .order("date", { ascending: false })
          .limit(100);
        setMyAttendance(data ?? []);
        return;
      }
      if (primaryRole === "faculty" && userId) {
        const { data: f } = await supabase.from("faculty").select("subjects").eq("id", userId).maybeSingle();
        setSubjects(f?.subjects ?? []);
      }
      // dept-scoped students for faculty/HOD; admin sees all
      let q = supabase.from("students").select("id, roll_no, section, year, department_id, profiles(full_name)").order("roll_no");
      if ((primaryRole === "faculty" || primaryRole === "hod") && profile?.department_id) {
        q = q.eq("department_id", profile.department_id);
      }
      const { data: st } = await q;
      setStudents((st as unknown as StudentRow[]) ?? []);
    })();
  }, [primaryRole, userId, profile?.department_id]);

  // When faculty selects a class, set subject and scope
  useEffect(() => {
    if (selectedClass) {
      setSubject(selectedClass.subject);
      setScope({
        department_id: selectedClass.department_id,
        year: String(selectedClass.year),
        section: selectedClass.section,
      });
    }
  }, [selectedClass]);

  // load existing attendance for that subject+date
  useEffect(() => {
    (async () => {
      if (primaryRole === "student" || !subject || !date) return;
      const { data } = await supabase.from("attendance").select("student_id, status").eq("subject", subject).eq("date", date);
      const map: Record<string, "present" | "absent"> = {};
      for (const r of data ?? []) map[r.student_id] = r.status as "present" | "absent";
      setExisting(map);
      setMarks(map);
    })();
  }, [subject, date, primaryRole]);

  const setStatus = (id: string, status: "present" | "absent") =>
    setMarks((m) => ({ ...m, [id]: status }));

  const filteredStudents = students.filter((s) => {
    if (scope.department_id !== "all" && s.department_id !== scope.department_id) return false;
    if (scope.year !== "all" && s.year !== Number(scope.year)) return false;
    if (scope.section !== "all" && s.section !== scope.section) return false;
    return true;
  });

  const submit = async () => {
    if (!subject || !date || !userId) return toast.error("Pick a subject and date");
    // Auto-mark unmarked students as absent
    const rows = filteredStudents.map((s) => ({
      student_id: s.id,
      faculty_id: userId,
      subject,
      date,
      status: marks[s.id] || "absent",
    }));
    if (rows.length === 0) return toast.error("No students to mark");
    setSaving(true);
    const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,subject,date" });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Saved ${rows.length} entries`);
      const newMap: Record<string, "present" | "absent"> = {};
      for (const r of rows) newMap[r.student_id] = r.status as "present" | "absent";
      setExisting(newMap);
      setMarks(newMap);
    }
  };

  // ===== STUDENT VIEW =====
  if (primaryRole === "student") {
    const total = myAttendance.length;
    const present = myAttendance.filter((a) => a.status === "present").length;
    const pct = total ? Math.round((present / total) * 100) : 0;

    const bySub: Record<string, { p: number; t: number; latest?: { date: string; status: string } }> = {};
    for (const r of myAttendance) {
      bySub[r.subject] ??= { p: 0, t: 0 };
      bySub[r.subject].t++;
      if (r.status === "present") bySub[r.subject].p++;
      if (!bySub[r.subject].latest) bySub[r.subject].latest = { date: r.date, status: r.status };
    }
    const today = format(new Date(), "yyyy-MM-dd");

    return (
      <div>
        <PageHeader title="My attendance" description={`Overall ${pct}% (${present}/${total})`} />
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Overall" value={`${pct}%`} accent={pct >= 75 ? "success" : "destructive"} />
          <StatCard label="Present" value={present} accent="success" />
          <StatCard label="Absent" value={total - present} accent="destructive" />
        </div>

        <h2 className="mt-6 mb-2 text-sm font-medium">By subject</h2>
        <div className="space-y-2">
          {Object.keys(bySub).length === 0 && (
            <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No attendance records yet.</p>
          )}
          {Object.entries(bySub).map(([sub, v]) => {
            const subPct = Math.round((v.p / v.t) * 100);
            const todayMark = myAttendance.find((a) => a.subject === sub && a.date === today)?.status;
            return (
              <div key={sub} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{sub}</div>
                    <div className="text-xs text-muted-foreground">{v.p}/{v.t} classes</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`text-lg font-semibold ${subPct >= 75 ? "text-success" : "text-destructive"}`}>{subPct}%</div>
                    {todayMark === "present" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[11px] font-medium text-success">
                        <CheckCircle2 className="h-3 w-3" /> Today
                      </span>
                    )}
                    {todayMark === "absent" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
                        <XCircle className="h-3 w-3" /> Today
                      </span>
                    )}
                    {!todayMark && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        <Clock className="h-3 w-3" /> Not marked
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${subPct >= 75 ? "bg-success" : "bg-destructive"}`} style={{ width: `${subPct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===== FACULTY VIEW — show today's classes first =====
  const canMark = primaryRole === "faculty";
  const dirty = useMemo(
    () => filteredStudents.some((s) => (marks[s.id] || "absent") !== (existing[s.id] || undefined)),
    [marks, existing, filteredStudents]
  );

  const fmtTime = (t: string | null) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hh = Number(h);
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${m ?? "00"} ${hh < 12 ? "AM" : "PM"}`;
  };

  return (
    <div>
      <PageHeader title="Attendance" description={canMark ? "Select a class to mark attendance" : "View attendance"} />

      {/* Faculty: Today's classes cards */}
      {canMark && todayClasses.length > 0 && (
        <div className="mb-4">
          <h2 className="mb-2 text-sm font-medium">Today's classes ({DAYS[todayDow()]})</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {todayClasses.map((cls) => {
              const isSelected = selectedClass?.id === cls.id;
              return (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClass(cls)}
                  className={`rounded-xl border p-3 text-left transition-colors ${isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">{cls.subject}</div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Sec {cls.section} · Year {cls.year} · {fmtTime(cls.start_time)} – {fmtTime(cls.end_time)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {canMark && todayClasses.length === 0 && (
        <div className="mb-4 rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
          No classes scheduled for today ({DAYS[todayDow()] || "Sunday"}).
        </div>
      )}

      {/* Manual subject/date picker + filters for HOD/Admin or fallback */}
      <div className="rounded-xl border bg-card p-4 shadow-soft">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Subject</Label>
            <Select value={subject} onValueChange={(v) => { setSubject(v); setSelectedClass(null); }}>
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
              <Button className="w-full" onClick={submit} disabled={saving || filteredStudents.length === 0}>
                {saving ? "Saving…" : "Save attendance"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-card p-3">
        <ScopeFilters scope={scope} onChange={setScope} />
      </div>

      <div className="mt-4 rounded-xl border bg-card divide-y">
        {filteredStudents.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No students match the filters.</p>}
        {filteredStudents.map((s) => {
          const status = marks[s.id];
          const wasExisting = existing[s.id];
          return (
            <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{s.profiles?.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground">
                  {s.roll_no} · Sec {s.section} · Y{s.year}
                  {wasExisting && <span className="ml-2 text-[10px] uppercase tracking-wide">(saved)</span>}
                </div>
              </div>
              {canMark ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setStatus(s.id, "present")}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      status === "present" ? "bg-success text-success-foreground" : "bg-success/10 text-success hover:bg-success/20"
                    }`}
                    aria-label="Mark present"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setStatus(s.id, "absent")}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      status === "absent" ? "bg-destructive text-destructive-foreground" : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                    }`}
                    aria-label="Mark absent"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <span className={`text-xs font-medium ${
                  status === "present" ? "text-success" : status === "absent" ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {status ? status : "Not marked"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
