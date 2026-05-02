import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/stores/auth-store";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, ChevronRight } from "lucide-react";
import { ScopeFilters, ALL_SCOPE, type Scope } from "@/components/ScopeFilters";
import { DAYS, todayDow, type TimetableClass } from "@/lib/types";
import { MarkAttendanceSheet } from "@/components/MarkAttendanceSheet";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/app/attendance")({
  head: () => ({ meta: [{ title: "Attendance — AcademiaHub" }] }),
  component: AttendancePage,
});

function AttendancePage() {
  const { primaryRole, userId, profile } = useAuth();
  const [myAttendance, setMyAttendance] = useState<{ subject: string; date: string; status: string }[]>([]);
  const [markCell, setMarkCell] = useState<TimetableClass | null>(null);
  const [scope, setScope] = useState<Scope>(ALL_SCOPE);
  const [todayClasses, setTodayClasses] = useState<TimetableClass[]>([]);
  const [searchStudents, setSearchStudents] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Faculty: today's classes from timetable
  useEffect(() => {
    if (primaryRole !== "faculty" || !userId) return;
    (async () => {
      const dow = todayDow();
      if (dow === 0) { setTodayClasses([]); return; }
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

  // load my attendance (student view)
  useEffect(() => {
    if (primaryRole === "student" && userId) {
      (async () => {
        const { data } = await supabase
          .from("attendance")
          .select("subject, date, status")
          .eq("student_id", userId)
          .order("date", { ascending: false })
          .limit(100);
        setMyAttendance(data ?? []);
      })();
    }
  }, [primaryRole, userId, profile?.department_id]);

  // Fetch students for manual search list
  useEffect(() => {
    if (primaryRole === "student" || !userId) return;
    (async () => {
      setSearchLoading(true);
      let q = supabase.from("students").select("id, roll_no, section, year, department_id").order("roll_no");
      
      if (scope.department_id !== "all") q = q.eq("department_id", scope.department_id);
      if (scope.year !== "all") q = q.eq("year", Number(scope.year));
      if (scope.section !== "all") q = q.eq("section", scope.section);
      
      const { data: studs } = await q;
      
      const ids = (studs ?? []).map(s => s.id);
      const nameMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const p of profs ?? []) nameMap[p.id] = p.full_name;
      }

      setSearchStudents((studs ?? []).map(s => ({
        ...s,
        profiles: { full_name: nameMap[s.id] ?? "—" }
      })));
      setSearchLoading(false);
    })();
  }, [primaryRole, userId, scope.department_id, scope.year, scope.section]);

  const fmtTime = (t: string | null) => {
    if (!t) return "";
    const [h, m] = t.split(":");
    const hh = Number(h);
    const h12 = ((hh + 11) % 12) + 1;
    return `${h12}:${m ?? "00"} ${hh < 12 ? "AM" : "PM"}`;
  };

  const openManualSheet = (s: any) => {
    setMarkCell({
      id: "manual-" + s.id,
      subject: "General",
      department_id: s.department_id,
      section: s.section,
      year: s.year,
      start_time: null,
      end_time: null
    } as any);
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

  // ===== FACULTY / HOD / ADMIN VIEW =====
  const canMark = primaryRole === "faculty";

  return (
    <div>
      <PageHeader title="Attendance" description={canMark ? "Select a class to mark attendance" : "View attendance records"} />

      {/* Faculty: Today's classes cards */}
      {canMark && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Today's classes ({DAYS[todayDow()]})</h2>
          {todayClasses.length === 0 ? (
            <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              No classes scheduled for today ({DAYS[todayDow()] || "Sunday"}).
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {todayClasses.map((cls) => (
                <button
                  key={cls.id}
                  onClick={() => setMarkCell(cls)}
                  className="group relative flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="font-semibold text-foreground group-hover:text-primary">{cls.subject}</div>
                      <div className="text-xs text-muted-foreground">
                        Sec {cls.section} · Year {cls.year}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-primary" />
                  </div>
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {fmtTime(cls.start_time)} – {fmtTime(cls.end_time)}
                  </div>
                  <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Tap to mark attendance →
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scope Filters and Search Results — HOD and Admin ONLY */}
      {(primaryRole === "hod" || primaryRole === "admin") && (
        <>
          <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">Find students by department/class</div>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                onClick={() => setScope(ALL_SCOPE)}
              >
                Reset Filters
              </Button>
            </div>
            <ScopeFilters scope={scope} onChange={setScope} />
          </div>

          <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
            <div className="bg-muted/50 px-4 py-2 border-b">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">Search Results</div>
            </div>
            {searchLoading ? (
              <div className="p-12 text-center">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                <p className="mt-2 text-sm text-muted-foreground">Searching students...</p>
              </div>
            ) : searchStudents.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground/20 mb-2" />
                No students found matching these filters.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Roll No</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</th>
                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {searchStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{s.roll_no}</td>
                      <td className="px-4 py-3 font-medium">{s.profiles?.full_name}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">Sec {s.section} · Year {s.year}</td>
                      <td className="px-4 py-3 text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-[11px]"
                          onClick={() => openManualSheet(s)}
                        >
                          Mark Attendance
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {canMark && (
        <div className="mt-8 rounded-xl border bg-card p-8 text-center bg-muted/5">
          <div className="mb-3 flex justify-center">
            <div className="rounded-full bg-background p-4 shadow-sm">
              <CheckCircle2 className="h-8 w-8 text-primary/40" />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">Select a class card at the top</p>
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">Click any of today's classes to record attendance for that group.</p>
        </div>
      )}

      {/* Sheet for marking attendance */}
      {markCell && (
        <MarkAttendanceSheet
          cell={markCell as any}
          onClose={() => setMarkCell(null)}
          facultyId={userId!}
        />
      )}
    </div>
  );
}
