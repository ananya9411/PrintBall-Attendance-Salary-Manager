-- PrintBall security boundary for kiosk attendance.
-- Public kiosk writes now go through the dedicated security API, which performs
-- server-side liveness/anti-spoofing and face verification before writing.

REVOKE INSERT, UPDATE ON public.attendance FROM anon;

DROP POLICY IF EXISTS "Kiosk can check in" ON public.attendance;
DROP POLICY IF EXISTS "Kiosk can check out" ON public.attendance;

-- Attendance photos are uploaded by the security backend with service_role.
-- Remove the old anonymous upload capability so a client cannot bypass the
-- liveness/face-verification endpoint by uploading a photo directly.
DROP POLICY IF EXISTS "Kiosk can upload attendance photos" ON storage.objects;

-- Prevent two live attendance rows for the same employee/day. Cleared rows are
-- intentionally excluded so admin workflows can clear and recreate a day.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_employee_workday_present_key
ON public.attendance(employee_id, work_date)
WHERE status = 'present';
