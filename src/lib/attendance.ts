import { supabase } from "@/integrations/supabase/client";

export const TIME_ZONE = "Asia/Kolkata";
export const EMPLOYEE_PHOTO_BUCKET = "employee-photos";
export const ATTENDANCE_PHOTO_BUCKET = "attendance-photos";

export type Employee = {
  id: string;
  employee_code: string;
  name: string;
  phone: string | null;
  address: string | null;
  age: number | null;
  role: string | null;
  active: boolean;
  created_at: string;
  join_date: string;
  photo_path: string | null;
  monthly_salary: number;
};

export type AttendanceRow = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in_at: string;
  check_out_at: string | null;
  check_in_photo: string | null;
  check_out_photo: string | null;
  status: "present" | "cleared";
};

export function todayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

export function formatTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string) {
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function workedDuration(row: AttendanceRow) {
  if (!row.check_out_at) return "—";
  const ms = new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime();
  if (ms <= 0) return "—";
  const mins = Math.round(ms / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function employeePhotoUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function fetchEmployees(includeInactive = false) {
  let query = supabase.from("employees").select("*").order("name");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Employee[];
}

export async function fetchTodayAttendance() {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("work_date", todayKey())
    .order("check_in_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttendanceRow[];
}

export async function fetchAttendanceHistory(employeeId?: string) {
  let query = supabase
    .from("attendance")
    .select("*")
    .order("work_date", { ascending: false })
    .order("check_in_at", { ascending: false });
  if (employeeId) query = query.eq("employee_id", employeeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AttendanceRow[];
}

export async function fetchAttendanceMonth(employeeId: string, monthStart: string, monthEnd: string) {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("employee_id", employeeId)
    .gte("work_date", monthStart)
    .lt("work_date", monthEnd)
    .order("work_date", { ascending: true })
    .order("check_in_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AttendanceRow[];
}

export async function uploadPhoto(employeeId: string, mode: "in" | "out", photo: Blob | null) {
  if (!photo) return null;
  const path = `${employeeId}/${todayKey()}-${Date.now()}-${mode}.jpg`;
  const { error } = await supabase.storage
    .from(ATTENDANCE_PHOTO_BUCKET)
    .upload(path, photo, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadEmployeePhoto(employeeId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(extension) ? extension : "jpg";
  const path = `${employeeId}/profile.${safeExtension}`;
  const { error } = await supabase.storage
    .from(EMPLOYEE_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

export async function removeEmployeePhoto(path: string | null) {
  if (!path) return;
  const { error } = await supabase.storage.from(EMPLOYEE_PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}

function securityApiUrl() {
  const value = String(import.meta.env.VITE_ATTENDANCE_API_URL ?? "").trim();
  if (!value) throw new Error("Attendance security server is not configured. Set VITE_ATTENDANCE_API_URL.");
  return value.replace(/\/$/, "");
}

async function postSecureAttendance(path: string, employeeId: string, photo: Blob | null) {
  if (!photo) throw new Error("A verified live camera capture is required for attendance.");
  const form = new FormData();
  form.append("employee_id", employeeId);
  form.append("challenge_passed", "true");
  form.append("image", photo, "attendance.jpg");
  const response = await fetch(`${securityApiUrl()}${path}`, { method: "POST", body: form });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.detail ?? "Secure attendance verification failed.");
  return payload;
}

export async function checkIn(employeeId: string, photo: Blob | null) {
  await postSecureAttendance("/api/attendance/check-in", employeeId, photo);
}

export async function checkOut(row: AttendanceRow, photo: Blob | null) {
  await postSecureAttendance("/api/attendance/check-out", row.employee_id, photo);
}

export async function signedPhotoUrl(path: string) {
  const { data, error } = await supabase.storage
    .from(ATTENDANCE_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
