export type AppRole = "admin" | "hod" | "faculty" | "student";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Principal (Admin)",
  hod: "Head of Department",
  faculty: "Faculty",
  student: "Student",
};

export const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Returns 0..6 where 1=Mon..6=Sat (Sun=0). Our timetable uses 1..6.
export function todayDow(): number {
  return new Date().getDay();
}

export function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  // t is "HH:MM:SS" or "HH:MM"
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = m ?? "00";
  const am = hh < 12;
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${mm} ${am ? "AM" : "PM"}`;
}
