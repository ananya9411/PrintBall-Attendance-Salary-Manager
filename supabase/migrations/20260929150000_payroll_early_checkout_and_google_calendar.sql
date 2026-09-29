-- PrintBall payroll: configurable full-day pay window for early checkout.
ALTER TABLE public.payroll_settings
  ADD COLUMN IF NOT EXISTS early_checkout_full_pay_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.payroll_settings
  DROP CONSTRAINT IF EXISTS payroll_settings_early_checkout_full_pay_minutes_check;
ALTER TABLE public.payroll_settings
  ADD CONSTRAINT payroll_settings_early_checkout_full_pay_minutes_check
  CHECK (early_checkout_full_pay_minutes >= 0 AND early_checkout_full_pay_minutes <= 720);
