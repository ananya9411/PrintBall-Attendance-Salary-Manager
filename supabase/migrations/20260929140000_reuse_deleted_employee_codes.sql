-- Reuse the smallest available PrintBall employee code.
-- Auto-generated IDs now fill deleted gaps instead of always incrementing.

CREATE OR REPLACE FUNCTION public.assign_employee_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  next_number bigint;
BEGIN
  IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
    -- Serialize automatic code allocation so two simultaneous employee
    -- creations cannot receive the same free number.
    PERFORM pg_advisory_xact_lock(2147483647);

    SELECT MIN(n)
    INTO next_number
    FROM generate_series(
      1,
      COALESCE(
        (
          SELECT MAX(
            regexp_replace(employee_code, '^PB-', '')::bigint
          )
          FROM public.employees
          WHERE employee_code ~ '^PB-[0-9]+$'
        ),
        0
      ) + 1
    ) AS numbers(n)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.employee_code = 'PB-' || lpad(numbers.n::text, 4, '0')
    );

    NEW.employee_code := 'PB-' || lpad(next_number::text, 4, '0');
  ELSE
    NEW.employee_code := upper(btrim(NEW.employee_code));
  END IF;

  RETURN NEW;
END;
$$;
