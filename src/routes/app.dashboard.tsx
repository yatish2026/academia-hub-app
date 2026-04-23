import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/stores/auth-store";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AcademiaHub" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { primaryRole, profile, userId } = useAuth();
  const [stats, setStats] = useState<{ label: string; value: string | number; hint?: string; accent?: "primary" | "success" | "warning" | "destructive" }[]>([]);
  const [chart, setChart] = useState<{ name: string; value: number }[]>([]);
  const [pie, setPie] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    (async () => {
      if (!primaryRole) return;
      if (primaryRole === "admin") {
        const [u, s, f, d, n] = await Promise.all([
          supabase.from("profiles").select("*", { count: "exact", head: true }),
          supabase.from("students").select("*", { count: "exact", head: true }),
          supabase.from("faculty").select("*", { count: "exact", head: true }),
          supabase.from("departments").select("*", { count: "exact", head: true }),
          supabase.from("notices").select("*", { count: "exact", head: true }),
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
        setChart([
          { name: "Present", value: present },
          { name: "Absent", value: absent },
          { name: "Notices", value: n.count ?? 0 },
        ]);
      } else if (primaryRole === "student" && userId) {
        const [att, fees] = await Promise.all([
          supabase.from("attendance").select("status, subject"),
          supabase.from("fees").select("total_fee, paid_amount, due_amount").eq("student_id", userId).maybeSingle(),
        ]);
        const records = att.data ?? [];
        const present = records.filter((r) => r.status === "present").length;
        const pct = records.length ? Math.round((present / records.length) * 100) : 0;
        setStats([
          { label: "Attendance", value: `${pct}%`, accent: pct >= 75 ? "success" : "destructive", hint: `${present}/${records.length} classes` },
          { label: "Total fee", value: `₹${fees.data?.total_fee ?? 0}` },
          { label: "Paid", value: `₹${fees.data?.paid_amount ?? 0}`, accent: "success" },
          { label: "Due", value: `₹${fees.data?.due_amount ?? 0}`, accent: Number(fees.data?.due_amount ?? 0) > 0 ? "destructive" : "success" },
        ]);
        // per-subject %
        const bySub: Record<string, { p: number; t: number }> = {};
        for (const r of records) {
          bySub[r.subject] ??= { p: 0, t: 0 };
          bySub[r.subject].t++;
          if (r.status === "present") bySub[r.subject].p++;
        }
        setChart(Object.entries(bySub).map(([name, v]) => ({ name, value: Math.round((v.p / v.t) * 100) })));
      } else if (primaryRole === "faculty" && userId) {
        const [att, students] = await Promise.all([
          supabase.from("attendance").select("status, date").eq("faculty_id", userId),
          supabase.from("students").select("*", { count: "exact", head: true }),
        ]);
        setStats([
          { label: "Marked entries", value: att.data?.length ?? 0 },
          { label: "Students in dept", value: students.count ?? 0, accent: "success" },
          { label: "Today", value: new Date().toLocaleDateString() },
          { label: "Role", value: "Faculty" },
        ]);
      } else if (primaryRole === "hod") {
        const [s, f, t] = await Promise.all([
          supabase.from("students").select("*", { count: "exact", head: true }),
          supabase.from("faculty").select("*", { count: "exact", head: true }),
          supabase.from("timetable").select("approved"),
        ]);
        const approved = (t.data ?? []).filter((x) => x.approved).length;
        const pending = (t.data ?? []).length - approved;
        setStats([
          { label: "Dept students", value: s.count ?? 0 },
          { label: "Dept faculty", value: f.count ?? 0, accent: "success" },
          { label: "TT approved", value: approved, accent: "success" },
          { label: "TT pending", value: pending, accent: pending ? "warning" : "success" },
        ]);
      }
    })();
  }, [primaryRole, userId]);

  const COLORS = ["oklch(0.62 0.18 255)", "oklch(0.62 0.22 25)"];

  return (
    <div>
      <PageHeader title={`Welcome, ${profile?.full_name ?? "there"} 👋`} description="Here's a snapshot of what's happening." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

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
    </div>
  );
}
