import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/stores/auth-store";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { DAYS, fmtTime, todayDow } from "@/lib/types";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AcademiaHub" }] }),
  component: DashboardPage,
});

type Stat = { label: string; value: string | number; hint?: string; accent?: "primary" | "success" | "warning" | "destructive" };
type TT = { id: string; subject: string; start_time: string | null; end_time: string | null; faculty_id: string | null; section: string };

function DashboardPage() {
  const { primaryRole, profile, userId } = useAuth();
  const [stats, setStats] = useState<Stat[]>([]);
  const [chart, setChart] = useState<{ name: string; value: number }[]>([]);
  const [pie, setPie] = useState<{ name: string; value: number }[]>([]);
  const [todayClasses, setTodayClasses] = useState<TT[]>([]);
  const [facultyMap, setFacultyMap] = useState<Record<string, string>>({});
  const [recentNotices, setRecentNotices] = useState<{ id: string; title: string; created_at: string }[]>([]);

  useEffect(() => {
    (async () => {
      if (!primaryRole) return;
      const dow = todayDow();

      // Today's classes — visible to everyone
      const { data: tt } = await supabase
        .from("timetable")
        .select("id, subject, start_time, end_time, faculty_id, section, department_id")
        .eq("day_of_week", dow)
        .eq("approved", true)
        .order("start_time");
      let today = (tt as TT[]) ?? [];
      // scope by department for non-admin
      if (primaryRole !== "admin" && profile?.department_id) {
        today = today.filter((r: TT & { department_id?: string }) => (r as { department_id?: string }).department_id === profile.department_id);
      }
      setTodayClasses(today);
      const fids = Array.from(new Set(today.map((t) => t.faculty_id).filter(Boolean))) as string[];
      if (fids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", fids);
        const map: Record<string, string> = {};
        for (const p of profs ?? []) map[p.id] = p.full_name;
        setFacultyMap(map);
      }

      // Recent notices (top 3)
      const { data: ns } = await supabase
        .from("notices")
        .select("id, title, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      setRecentNotices(ns ?? []);

      if (primaryRole === "admin") {
        const [u, s, f, d] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("students").select("*", { count: "exact", head: true }),
          supabase.from("faculty").select("*", { count: "exact", head: true }),
          supabase.from("departments").select("*", { count: "exact", head: true }),
        ]);
        setStats([
          { label: "Users", value: u.count ?? 0 },
          { label: "Students", value: s.count ?? 0, accent: "success" },
          { label: "Faculty", value: f.count ?? 0, accent: "warning" },
          { label: "Departments", value: d.count ?? 0 },
        ]);
        const { data: fees } = await supabase.from("fees").select("total_fee, paid_amount");
        const total = (fees ?? []).reduce((a, x) => a + Number(x.total_fee), 0);
        const paid = (fees ?? []).reduce((a, x) => a + Number(x.paid_amount), 0);
        setPie([
          { name: "Collected", value: paid },
          { name: "Pending", value: Math.max(total - paid, 0) },
        ]);
        const { data: att } = await supabase.from("attendance").select("status");
        const present = (att ?? []).filter((a) => a.status === "present").length;
        const absent = (att ?? []).filter((a) => a.status === "absent").length;
        setChart([{ name: "Present", value: present }, { name: "Absent", value: absent }]);
      } else if (primaryRole === "student" && userId) {
        const [att, fees] = await Promise.all([
          supabase.from("attendance").select("status, subject").eq("student_id", userId),
          supabase.from("fees").select("total_fee, paid_amount, due_amount").eq("student_id", userId).maybeSingle(),
        ]);
        const records = att.data ?? [];
        const present = records.filter((r) => r.status === "present").length;
        const pct = records.length ? Math.round((present / records.length) * 100) : 0;
        setStats([
          { label: "Attendance", value: `${pct}%`, accent: pct >= 75 ? "success" : "destructive", hint: `${present}/${records.length} classes` },
          { label: "Today's classes", value: today.length, accent: "primary" },
          { label: "Paid", value: `₹${Number(fees.data?.paid_amount ?? 0).toLocaleString()}`, accent: "success" },
          { label: "Due", value: `₹${Number(fees.data?.due_amount ?? 0).toLocaleString()}`, accent: Number(fees.data?.due_amount ?? 0) > 0 ? "destructive" : "success" },
        ]);
        const bySub: Record<string, { p: number; t: number }> = {};
        for (const r of records) {
          bySub[r.subject] ??= { p: 0, t: 0 };
          bySub[r.subject].t++;
          if (r.status === "present") bySub[r.subject].p++;
        }
        setChart(Object.entries(bySub).map(([name, v]) => ({ name, value: Math.round((v.p / v.t) * 100) })));
      } else if (primaryRole === "faculty" && userId) {
        const [att, deptStudents] = await Promise.all([
          supabase.from("attendance").select("status, date").eq("faculty_id", userId),
          supabase.from("students").select("*", { count: "exact", head: true }).eq("department_id", profile?.department_id ?? ""),
        ]);
        setStats([
          { label: "Today's classes", value: today.filter((t) => t.faculty_id === userId).length, accent: "primary" },
          { label: "Attendance entries", value: att.data?.length ?? 0, accent: "success" },
          { label: "Dept students", value: deptStudents.count ?? 0 },
          { label: "Notices", value: recentNotices.length },
        ]);
      } else if (primaryRole === "hod" && profile?.department_id) {
        const [s, f, t, att] = await Promise.all([
          supabase.from("students").select("*", { count: "exact", head: true }).eq("department_id", profile.department_id),
          supabase.from("faculty").select("*", { count: "exact", head: true }).eq("department_id", profile.department_id),
          supabase.from("timetable").select("approved").eq("department_id", profile.department_id),
          supabase.from("attendance").select("status"),
        ]);
        const approved = (t.data ?? []).filter((x) => x.approved).length;
        const pending = (t.data ?? []).length - approved;
        const present = (att.data ?? []).filter((a) => a.status === "present").length;
        const absent = (att.data ?? []).filter((a) => a.status === "absent").length;
        const pct = present + absent ? Math.round((present / (present + absent)) * 100) : 0;
        setStats([
          { label: "Dept students", value: s.count ?? 0 },
          { label: "Dept faculty", value: f.count ?? 0, accent: "success" },
          { label: "Avg attendance", value: `${pct}%`, accent: pct >= 75 ? "success" : "warning" },
          { label: "TT pending", value: pending, accent: pending ? "warning" : "success" },
        ]);
        setChart([{ name: "Approved", value: approved }, { name: "Pending", value: pending }]);
      }
    })();
  }, [primaryRole, userId, profile?.department_id]);

  const COLORS = ["oklch(0.62 0.18 255)", "oklch(0.62 0.22 25)"];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${profile?.full_name ?? "there"} 👋`}
        description={`Today is ${DAYS[todayDow()] ?? "off-day"} · ${new Date().toLocaleDateString()}`}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Today's classes — for student / faculty / HOD */}
      {primaryRole !== "admin" && (
        <div className="mt-6 rounded-xl border bg-card p-4 shadow-soft">
          <h2 className="mb-3 text-sm font-medium">Today's schedule</h2>
          {todayClasses.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No classes scheduled today.</p>
          ) : (
            <div className="space-y-2">
              {todayClasses.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-md border-l-2 border-primary bg-muted/30 px-3 py-2 text-sm">
                  <div className="min-w-[80px] text-xs text-muted-foreground">{fmtTime(c.start_time)}</div>
                  <div className="flex-1">
                    <div className="font-medium">{c.subject}</div>
                    <div className="text-xs text-muted-foreground">{facultyMap[c.faculty_id ?? ""] ?? "—"} · Sec {c.section}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {chart.length > 0 && (
          <div className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="mb-3 text-sm font-medium">{primaryRole === "student" ? "Attendance % by subject" : "Activity"}</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <XAxis dataKey="name" stroke="oklch(0.55 0.02 255)" fontSize={12} />
                  <YAxis stroke="oklch(0.55 0.02 255)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.92 0.01 255)", borderRadius: 8 }} />
                  <Bar dataKey="value" fill="oklch(0.62 0.18 255)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {pie.length > 0 && (
          <div className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="mb-3 text-sm font-medium">Fee collection</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pie} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                    {pie.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex justify-center gap-4 text-xs">
              {pie.map((p, i) => (
                <div key={p.name} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} /> {p.name}: ₹{p.value.toLocaleString()}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {recentNotices.length > 0 && (
        <div className="mt-6 rounded-xl border bg-card p-4 shadow-soft">
          <h2 className="mb-3 text-sm font-medium">Latest notices</h2>
          <ul className="space-y-2">
            {recentNotices.map((n) => (
              <li key={n.id} className="flex items-center justify-between text-sm">
                <span className="truncate font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(n.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
