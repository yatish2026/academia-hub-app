import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/stores/auth-store";
import { GraduationCap, ShieldCheck, CalendarCheck, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AcademiaHub — College Management ERP" },
      { name: "description", content: "Modern, role-based ERP for colleges. Attendance, fees, timetable, notices — all in one place." },
      { property: "og:title", content: "AcademiaHub — College Management ERP" },
      { property: "og:description", content: "Modern role-based ERP for colleges with attendance, fees, timetable and notices." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { init, userId, initialized, mustReset } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    if (initialized && userId) navigate({ to: mustReset ? "/reset-password" : "/app/dashboard" });
  }, [initialized, userId, mustReset, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/40">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">AcademiaHub</span>
        </div>
        <Link to="/login" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-8 pb-16 md:px-8 md:pt-16">
        <div className="text-center">
          <span className="inline-block rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">College Management ERP</span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Run your campus, <span className="text-primary">beautifully.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            One platform for principals, HODs, faculty, and students. Attendance, fees, timetable, and notices — fast, secure, and mobile-first.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link to="/login" className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              Sign in
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Accounts are created by your administration — there is no public signup.</p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Strict role-based access", desc: "Database-enforced permissions for every role. No public signup." },
            { icon: CalendarCheck, title: "Smart attendance", desc: "One-click marking, real-time percentages, no duplicates." },
            { icon: Users, title: "Department-aware", desc: "HODs and faculty see only their department." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border bg-card p-5 shadow-soft">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-medium">{title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
