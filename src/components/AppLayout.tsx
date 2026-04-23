import { Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Receipt,
  CalendarDays,
  Megaphone,
  Building2,
  LogOut,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "@/stores/auth-store";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import { Toaster } from "@/components/ui/sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: AppRole[] };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "hod", "faculty", "student"] },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"] },
  { to: "/departments", label: "Departments", icon: Building2, roles: ["admin"] },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ["admin", "hod", "faculty", "student"] },
  { to: "/fees", label: "Fees", icon: Receipt, roles: ["admin", "hod", "student"] },
  { to: "/timetable", label: "Timetable", icon: CalendarDays, roles: ["admin", "hod", "faculty", "student"] },
  { to: "/notices", label: "Notices", icon: Megaphone, roles: ["admin", "hod", "faculty", "student"] },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard, roles: ["admin", "hod", "faculty", "student"] },
  { to: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ["admin", "hod", "faculty", "student"] },
  { to: "/timetable", label: "Timetable", icon: CalendarDays, roles: ["admin", "hod", "faculty", "student"] },
  { to: "/notices", label: "Notices", icon: Megaphone, roles: ["admin", "hod", "faculty", "student"] },
];

export default function AppLayout() {
  const { profile, primaryRole, signOut, userId, initialized } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (initialized && !userId) navigate({ to: "/login" });
  }, [initialized, userId, navigate]);

  if (!initialized || !userId || !primaryRole) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  const allowed = (item: NavItem) => item.roles.includes(primaryRole);
  const navItems = NAV.filter(allowed);
  const mobileItems = MOBILE_NAV.filter(allowed);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar md:flex md:flex-col">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold text-sidebar-foreground">AcademiaHub</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{ROLE_LABEL[primaryRole]}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-accent-foreground data-[status=active]:font-medium"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="mb-2 rounded-lg bg-sidebar-accent/40 px-3 py-2">
            <div className="truncate text-sm font-medium">{profile?.full_name}</div>
            <div className="truncate text-xs text-muted-foreground">{profile?.email}</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => signOut().then(() => navigate({ to: "/login" }))}
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* Mobile top header */}
      <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b bg-background/90 px-4 pt-safe pb-3 backdrop-blur">
        <div className="flex items-center gap-2 pt-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">AcademiaHub</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{ROLE_LABEL[primaryRole]}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={() => signOut().then(() => navigate({ to: "/login" }))}
            className="rounded-md p-2 text-muted-foreground hover:bg-accent"
            aria-label="Sign out"
          >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Main content */}
      <main className="md:pl-64 pb-24 md:pb-8">
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-safe">
        <div className="grid grid-cols-4">
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Toaster />
    </div>
  );
}
