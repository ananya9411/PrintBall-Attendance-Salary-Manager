# Attendance & Admin Guide

## Admin responsibilities
Admin manages employees, attendance corrections, leaves, holidays and payroll.

## Employee management
Admin can manage:
- Name
- Employee ID/code
- Joining date
- Salary
- Profile photo
- Employee details/status supported by the app

Employee IDs reuse gaps. Example: if PB-0002 is deleted while PB-0001 and PB-0003 exist, the next employee can receive PB-0002.

## Attendance
Flow:
```text
Start liveness
→ TURN LEFT / TURN RIGHT
→ liveness passes
→ manual Capture
→ backend face verification
→ check-in/check-out
```

After checkout the employee is completed for the day.

## Face verification
Uses server-side SCRFD + ArcFace. The employee profile image is the reference.

## Calendar
Admin can navigate month/year and view statuses such as Present, Absent, Paid leave, Unpaid leave, Holiday, Sunday, Cleared and Not joined.

Green indicates Present; red indicates Absent; cleared is neutral.

## Attendance actions
**Edit/mark present:** admin can correct attendance; policy start/end values can be used as defaults.

**Clear:** no absence and no salary deduction.

**Delete:** removes the attendance record. A normal working day without attendance, leave or holiday can then be absent.

## Leave
Paid leave → no salary deduction.  
Unpaid leave → applicable deduction.

Actual attendance takes precedence when an attendance record exists.

## Holidays
Sundays are the default weekly holiday. Automatic national holidays and manually configured holidays are supported. Paid holidays do not deduct salary.

## Salary management
Admin can search by employee name/ID and review:
- base/earned salary
- late deductions
- overtime
- leave
- absence deductions
- final payable amount
- monthly printable receipt

## Sunday overtime
Only employees who actually check in/out on Sunday receive Sunday OT.

## Troubleshooting
If the browser says `Failed to fetch` or mentions CORS, inspect the backend terminal first. A backend 500 can surface as a browser CORS error.

The previous timezone failure was caused by missing `tzdata`:
```powershell
python -m pip install tzdata
```
