export type AppRole = "admin" | "hod" | "faculty" | "student";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Super Admin",
  hod: "Head of Department",
  faculty: "Faculty",
  student: "Student",
};

export const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
