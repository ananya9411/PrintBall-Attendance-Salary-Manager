import type { AttendanceRow, Employee } from "./attendance";

export type PayrollSettings = {
  office_start: string;
  office_end: string;
  grace_start_minutes: number;
  grace_end_minutes: number;
  half_day_minutes?: number;
  overtime_multiplier: number;
  /** Normal working weekdays. Sunday (0) is optional and, when enabled, is paid as overtime. */
  working_days: number[];
};

export type Holiday = {
  id: string;
  holiday_date: string;
  start_date?: string;
  end_date?: string;
  name: string;
  created_at?: string;
  automatic?: boolean;
};

export type Leave = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  leave_type: "paid" | "unpaid";
  reason: string | null;
  created_at?: string;
};

export type SalaryDay = {
  date: string;
  label: string;
  status: "present" | "absent" | "cleared" | "holiday" | "paid_leave" | "unpaid_leave" | "not_joined" | "upcoming" | "off";
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  basePay: number;
  lateDeduction: number;
  overtimePay: number;
};

export type SalarySummary = {
  employee: Employee;
  month: string;
  monthLabel: string;
  monthlySalary: number;
  calendarDays: number;
  elapsedCalendarDays: number;
  dailyRate: number;
  perMinuteRate: number;
  scheduledDays: number;
  monthlyScheduledDays: number;
  presentDays: number;
  halfDays: number;
  absentDays: number;
  clearedDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  holidayDays: number;
  workedMinutes: number;
  lateMinutes: number;
  overtimeMinutes: number;
  basePay: number;
  lateDeduction: number;
  halfDayDeduction: number;
  absenceDeduction: number;
  unpaidLeaveDeduction: number;
  overtimePay: number;
  netSalary: number;
  days: SalaryDay[];
  salaryPeriodStart: string | null;
  salaryPeriodEnd: string | null;
};

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  office_start: "10:00",
  office_end: "19:00",
  grace_start_minutes: 0,
  grace_end_minutes: 0,
  half_day_minutes: 270,
  overtime_multiplier: 1,
  // Sunday is deliberately excluded by default. If an admin enables it,
  // Sunday attendance is paid minute-by-minute as overtime rather than
  // becoming an absence if nobody works that day.
  working_days: [1, 2, 3, 4, 5, 6],
};

function dateObj(key: string) {
  return new Date(`${key}T00:00:00+05:30`);
}

function parseKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetweenInclusive(start: string, end: string) {
  if (start > end) return 0;
  return Math.floor((parseKey(end) - parseKey(start)) / 86400000) + 1;
}

export function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return { start, end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01` };
}

export function monthDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const key = `${month}-${String(day).padStart(2, "0")}`;
    // Use UTC calendar arithmetic so weekday calculations are independent of
    // the browser/server's local timezone. The stored key is an India-local
    // calendar date, so its weekday must come from the date components only.
    const date = new Date(Date.UTC(year, monthNumber - 1, day));
    return { key, day, weekday: date.getUTCDay() };
  });
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function localMinutes(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Format a number of minutes for payroll/attendance displays. */
export function minutesLabel(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

/** Format Indian-rupee amounts consistently across payroll screens. */
export function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function holidayForDate(holidays: Holiday[], date: string) {
  return holidays.find((holiday) => {
    const start = holiday.start_date ?? holiday.holiday_date;
    const end = holiday.end_date ?? holiday.holiday_date;
    return start <= date && end >= date;
  });
}

function leaveForDate(leaves: Leave[], date: string) {
  return leaves.find((leave) => leave.start_date <= date && leave.end_date >= date);
}

/** India's three gazetted national days. Festival/regional holidays can be added as custom ranges. */
export function getIndiaNationalHolidays(year: number): Holiday[] {
  return [
    { id: `national-${year}-01-26`, holiday_date: `${year}-01-26`, start_date: `${year}-01-26`, end_date: `${year}-01-26`, name: "Republic Day", automatic: true },
    { id: `national-${year}-08-15`, holiday_date: `${year}-08-15`, start_date: `${year}-08-15`, end_date: `${year}-08-15`, name: "Independence Day", automatic: true },
    { id: `national-${year}-10-02`, holiday_date: `${year}-10-02`, start_date: `${year}-10-02`, end_date: `${year}-10-02`, name: "Gandhi Jayanti", automatic: true },
  ];
}

export function getAutomaticNationalHolidaysForMonth(month: string) {
  return getIndiaNationalHolidays(Number(month.slice(0, 4)));
}

/**
 * Monthly payroll model:
 *
 * - The monthly salary is divided by the actual scheduled working days in
 *   that calendar month (Monday-Saturday by default; Sundays are always off).
 * - Paid holidays do not reduce the denominator because they are paid days.
 * - One payout cycle is one calendar month. The daily rate is always the
 *   monthly salary divided by that month's actual Monday-Saturday working days.
 *   Sundays are excluded from the denominator.
 * - A mid-month joiner earns the daily rate only for payable scheduled days
 *   from the joining date through the end/current date of that month. The next
 *   calendar month starts a fresh salary period.
 * - A normal present day, paid leave day, paid holiday, or cleared day earns
 *   one daily rate. An absent or unpaid-leave day earns nothing; it is not
 *   separately deducted from already-earned base pay.
 * - Sundays are weekly holidays and never part of base salary. If an employee
 *   actually attends on Sunday, that employee alone earns Sunday overtime based
 *   on the worked minutes and the same daily rate for that month.
 * - Late minutes after the start grace are deducted. Overtime is calculated
 *   after the end grace period. There is no half-day threshold and no
 *   early-checkout deduction.
 */
export function calculateSalary(
  employee: Employee,
  month: string,
  attendance: AttendanceRow[],
  holidays: Holiday[],
  leaves: Leave[],
  settings: PayrollSettings,
  todayKey: string,
): SalarySummary {
  const dates = monthDates(month);
  const monthStart = dates[0]?.key ?? `${month}-01`;
  const monthEnd = dates.at(-1)?.key ?? monthStart;
  const calendarDays = dates.length;
  const effectiveToday = todayKey < monthStart ? "0000-00-00" : todayKey > monthEnd ? monthEnd : todayKey;
  const joinDate = employee.join_date || monthStart;
  // Sunday is always a weekly holiday. The working_days policy controls only
  // Monday-Saturday; Sunday attendance is handled separately as OT.
  const workingDays = Array.isArray(settings.working_days)
    ? settings.working_days.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 6)
    : DEFAULT_PAYROLL_SETTINGS.working_days.filter((day) => day !== 0);
  const officeStart = typeof settings.office_start === "string" ? settings.office_start.slice(0, 5) : DEFAULT_PAYROLL_SETTINGS.office_start;
  const officeEnd = typeof settings.office_end === "string" ? settings.office_end.slice(0, 5) : DEFAULT_PAYROLL_SETTINGS.office_end;
  const graceStartMinutes = Math.max(0, Number(settings.grace_start_minutes) || 0);
  const graceEndMinutes = Math.max(0, Number(settings.grace_end_minutes) || 0);
  const overtimeMultiplier = Math.max(0, Number(settings.overtime_multiplier) || 0);
  const elapsedStart = joinDate > monthStart ? joinDate : monthStart;
  const elapsedCalendarDays = effectiveToday === "0000-00-00" ? 0 : daysBetweenInclusive(elapsedStart, effectiveToday);

  // Base salary is spread across this month's actual scheduled workdays.
  // Sundays are excluded from the base denominator. Paid holidays remain paid
  // days, so they are NOT removed from the denominator.
  const monthScheduledWorkingDays = dates.filter(
    (item) => item.weekday !== 0 && workingDays.includes(item.weekday),
  ).length;
  const dailyRate = Number(employee.monthly_salary ?? 0) / Math.max(monthScheduledWorkingDays, 1);
  const scheduledMinutes = Math.max(1, minutesFromTime(officeEnd) - minutesFromTime(officeStart));
  const perMinuteRate = dailyRate / scheduledMinutes;

  const salaryPeriodStart = joinDate > monthEnd ? null : (joinDate > monthStart ? joinDate : monthStart);
  const salaryPeriodEnd = salaryPeriodStart ? monthEnd : null;

  const holidayMap = new Map<string, Holiday>();
  for (const holiday of holidays) {
    const start = holiday.start_date ?? holiday.holiday_date;
    const end = holiday.end_date ?? holiday.holiday_date;
    for (const item of dates) {
      if (start <= item.key && end >= item.key) holidayMap.set(item.key, holiday);
    }
  }

  const attendanceMap = new Map<string, AttendanceRow>();
  for (const row of attendance) attendanceMap.set(row.work_date, row);

  // Scheduled working days that have elapsed in this employee's payroll
  // period. This is informational; basePay below is earned-pay only.
  const scheduledDays = dates.filter((item) =>
    item.key >= joinDate &&
    item.key <= effectiveToday &&
    item.weekday !== 0 &&
    workingDays.includes(item.weekday),
  ).length;

  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;
  let clearedDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let holidayDays = 0;
  let workedMinutes = 0;
  let lateMinutes = 0;
  let overtimeMinutes = 0;
  let lateDeduction = 0;
  let halfDayDeduction = 0;
  let absenceDeduction = 0;
  let unpaidLeaveDeduction = 0;
  let overtimePay = 0;

  const dayRows: SalaryDay[] = dates.map((item) => {
    const label = dateObj(item.key).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    const notJoined = item.key < joinDate;
    const future = item.key > effectiveToday && effectiveToday !== "0000-00-00";

    if (notJoined) {
      return { date: item.key, label, status: "not_joined", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    if (effectiveToday === "0000-00-00" || future) {
      return { date: item.key, label, status: "upcoming", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    const holiday = holidayForDate(holidays, item.key);
    const isSunday = item.weekday === 0;
    const normalWorkingDay = workingDays.includes(item.weekday) && !isSunday;
    const row = attendanceMap.get(item.key);

    // Sunday is a weekly holiday by default. When Sunday OT is enabled in the
    // policy, actual Sunday attendance is paid minute-by-minute as overtime.
    // A missing Sunday never creates an absence deduction.
    if (isSunday) {
      // Sunday is always off for base salary. It becomes overtime ONLY when
      // an actual attendance record exists for that Sunday.
      if (!row || row.status === "cleared") {
        if (row?.status === "cleared") clearedDays += 1;
        return { date: item.key, label, status: row?.status === "cleared" ? "cleared" : "off", checkIn: row?.check_in_at ?? null, checkOut: row?.check_out_at ?? null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
      }
      const worked = row.check_out_at ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000)) : 0;
      const sundayPay = worked * perMinuteRate * Math.max(0, overtimeMultiplier);
      presentDays += 1;
      workedMinutes += worked;
      overtimeMinutes += worked;
      overtimePay += sundayPay;
      return { date: item.key, label, status: "present", checkIn: row.check_in_at, checkOut: row.check_out_at, workedMinutes: worked, lateMinutes: 0, overtimeMinutes: worked, basePay: 0, lateDeduction: 0, overtimePay: sundayPay };
    }
    if (holiday) {
      holidayDays += 1;
      // Holiday pay is already part of the calendar-day accrual. There is no
      // separate base-pay addition here, preventing double payment.
      if (!row || row.status === "cleared") {
        if (row?.status === "cleared") clearedDays += 1;
        return { date: item.key, label, status: row?.status === "cleared" ? "cleared" : "holiday", checkIn: row?.check_in_at ?? null, checkOut: row?.check_out_at ?? null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: dailyRate, lateDeduction: 0, overtimePay: 0 };
      }
    }

    if (!normalWorkingDay) {
      if (row?.status === "present") {
        const worked = row.check_out_at ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000)) : 0;
        const sundayPay = isSunday ? worked * perMinuteRate * Math.max(0, overtimeMultiplier) : 0;
        presentDays += 1;
        workedMinutes += worked;
        overtimeMinutes += sundayPay > 0 ? worked : 0;
        overtimePay += sundayPay;
        return { date: item.key, label, status: "present", checkIn: row.check_in_at, checkOut: row.check_out_at, workedMinutes: worked, lateMinutes: 0, overtimeMinutes: sundayPay > 0 ? worked : 0, basePay: 0, lateDeduction: 0, overtimePay: sundayPay };
      }
      return { date: item.key, label, status: "off", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    const leave = leaveForDate(leaves, item.key);
    if (leave) {
      if (leave.leave_type === "paid") {
        paidLeaveDays += 1;
        return { date: item.key, label, status: "paid_leave", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: dailyRate, lateDeduction: 0, overtimePay: 0 };
      }
      unpaidLeaveDays += 1;
      // Unpaid leave earns no base pay. It is not separately deducted because
      // basePay already contains earned-pay only.
      return { date: item.key, label, status: "unpaid_leave", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    if (row?.status === "cleared") {
      clearedDays += 1;
      return { date: item.key, label, status: "cleared", checkIn: row.check_in_at, checkOut: row.check_out_at, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: dailyRate, lateDeduction: 0, overtimePay: 0 };
    }

    if (!row) {
      absentDays += 1;
      // Absence means the employee did not earn that day's base pay. We do
      // not also subtract the same amount later, because basePay represents
      // earned base salary only.
      return { date: item.key, label, status: "absent", checkIn: null, checkOut: null, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0, basePay: 0, lateDeduction: 0, overtimePay: 0 };
    }

    presentDays += 1;
    const worked = row.check_out_at ? Math.max(0, Math.round((new Date(row.check_out_at).getTime() - new Date(row.check_in_at).getTime()) / 60000)) : 0;
    const openingMinutes = minutesFromTime(officeStart);
    const closingMinutes = minutesFromTime(officeEnd);
    const late = Math.max(0, localMinutes(row.check_in_at) - openingMinutes - graceStartMinutes);
    const checkoutMinutes = row.check_out_at ? localMinutes(row.check_out_at) : null;
    // Early arrival is overtime too. It starts at the configured office
    // opening time; the late-arrival grace period does not reduce early OT.
    // Example: office starts at 10:00 AM and an employee checks in at 9:30 AM
    // -> 30 minutes of overtime.
    const earlyOvertime = checkoutMinutes !== null
      ? Math.max(0, openingMinutes - localMinutes(row.check_in_at))
      : 0;
    const lateCheckoutOvertime = checkoutMinutes !== null
      ? Math.max(0, checkoutMinutes - closingMinutes - graceEndMinutes)
      : 0;
    const overtime = earlyOvertime + lateCheckoutOvertime;
    const lateDed = Math.min(dailyRate, late * perMinuteRate);
    const overtimeAmount = overtime * perMinuteRate * Math.max(0, overtimeMultiplier);

    // Normal attendance is paid by actual worked minutes, not simply by
    // having an attendance row. Add late minutes back to the payable base so
    // the separate late deduction remains the only late penalty. This means:
    // - 1 minute worked at 10:00 AM -> 1 minute of base pay.
    // - 10:00 AM to 6:00 PM -> 8 hours of base pay; no early-checkout window.
    // - 10:30 AM to 7:00 PM -> full scheduled base, minus the late deduction.
    // - 9:30 AM to 7:00 PM -> full scheduled base + 30 minutes of OT.
    // The base is capped at one daily rate; early/late extra time is OT.
    const payableBaseMinutes = Math.min(scheduledMinutes, worked + late);
    const presentBasePay = payableBaseMinutes * perMinuteRate;

    workedMinutes += worked;
    lateMinutes += late;
    lateDeduction += lateDed;
    overtimeMinutes += overtime;
    overtimePay += overtimeAmount;

    return {
      date: item.key,
      label,
      status: "present",
      checkIn: row.check_in_at,
      checkOut: row.check_out_at,
      workedMinutes: worked,
      lateMinutes: late,
      overtimeMinutes: overtime,
      basePay: presentBasePay,
      lateDeduction: lateDed,
      overtimePay: overtimeAmount,
    };
  });

  // Base salary is the sum of the actual payable amount for each day.
  // Present days are minute-based, while cleared/holiday/paid-leave days earn
  // a full daily rate. This prevents a 1-minute attendance record from
  // earning a full day's salary.
  const basePay = dayRows
    .filter((day) => day.date >= joinDate && day.date <= effectiveToday)
    .reduce((sum, day) => sum + day.basePay, 0);

  // Keep absence/unpaid counters available for reporting, but do not subtract
  // them a second time from earned base pay.
  const totalDeductions = lateDeduction + halfDayDeduction;
  const netSalary = Math.max(0, roundMoney(basePay - totalDeductions + overtimePay));

  return {
    employee,
    month,
    monthLabel: dateObj(`${month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    monthlySalary: Number(employee.monthly_salary ?? 0),
    calendarDays,
    elapsedCalendarDays,
    dailyRate: roundMoney(dailyRate),
    perMinuteRate: roundMoney(perMinuteRate),
    scheduledDays,
    monthlyScheduledDays: monthScheduledWorkingDays,
    presentDays,
    halfDays,
    absentDays,
    clearedDays,
    paidLeaveDays,
    unpaidLeaveDays,
    holidayDays,
    workedMinutes,
    lateMinutes,
    overtimeMinutes,
    basePay: roundMoney(basePay),
    lateDeduction: roundMoney(lateDeduction),
    halfDayDeduction: roundMoney(halfDayDeduction),
    absenceDeduction: roundMoney(absenceDeduction),
    unpaidLeaveDeduction: roundMoney(unpaidLeaveDeduction),
    overtimePay: roundMoney(overtimePay),
    netSalary,
    days: dayRows,
    salaryPeriodStart,
    salaryPeriodEnd,
  };
}
