-- PrintBall payroll: remove the early-checkout full-pay window.
-- Early checkout is no longer a separate payroll rule; keep the clean model
-- of daily base pay + late deductions + overtime + absence/leave deductions.
ALTER TABLE public.payroll_settings
  DROP CONSTRAINT IF EXISTS payroll_settings_early_checkout_full_pay_minutes_check;

ALTER TABLE public.payroll_settings
  DROP COLUMN IF EXISTS early_checkout_full_pay_minutes;
