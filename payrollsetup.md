# Payroll Setup & Formulas

## Monthly base
Payroll resets each calendar month.

```text
Scheduled working days = calendar days - Sundays
Daily rate = monthly salary / scheduled working days
```

Examples:
- 30 days, 4 Sundays → 26 working days
- 31 days, 4 Sundays → 27 working days
- 31 days, 5 Sundays → 26 working days
- 28-day February → 24 working days
- Leap February → 24 if 5 Sundays, otherwise 25

The joining date applies to eligibility in the first month, but the daily-rate denominator is still based on the full month's scheduled working days.

## Minute-based base pay
A normal day is paid from actual worked minutes.

```text
Per-minute rate = daily rate / scheduled working minutes
Base pay = worked minutes × per-minute rate
Base pay <= daily rate
```

A 1-minute attendance therefore does not automatically receive a full day's salary.

## Late
After the configured start grace:

```text
Late deduction = late minutes × per-minute rate
```

## Overtime
Early check-in before office start can produce overtime. Late checkout produces overtime after the configured end grace.

Example: office 10 AM–7 PM, end grace 15 minutes:
- 9:30–7:00 → 30 minutes early OT
- 9:30–7:30 → 30 early OT + 15 late OT

Overtime is paid separately using the configured OT multiplier.

## Sunday
Sunday is excluded from the base denominator.

No Sunday attendance:
```text
Sunday base = 0
Sunday OT = 0
```

Actual Sunday check-in/out:
```text
worked Sunday minutes → Sunday OT
```

Only that employee is affected.

## Leave and holidays
Paid leave: no deduction.  
Unpaid leave: applicable deduction.  
Paid holidays: no deduction.  
Cleared attendance: no deduction.

## No half-day threshold
There is no half-day threshold. Partial attendance uses actual worked minutes.

## No early-checkout full-pay window
There is no special full-day payment window for early checkout.

## Net salary
```text
Net = base earned
    - late deductions
    - absence/unpaid-leave deductions
    + overtime
```

Payroll must always be calculated independently per employee.
