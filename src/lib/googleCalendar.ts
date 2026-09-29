export type GoogleHoliday = {
  date: string;
  endDate: string;
  name: string;
  eventId: string;
};

export type HolidaySyncResult = {
  source: "google" | "nager";
  events: GoogleHoliday[];
  warning?: string;
};

const DEFAULT_INDIA_HOLIDAY_CALENDAR = "en.indian#holiday@group.v.calendar.google.com";

function getApiKey() {
  return String(import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY ?? "").trim();
}

export async function fetchGoogleIndiaHolidays(year: number): Promise<GoogleHoliday[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("Google Calendar API key is not configured. Add VITE_GOOGLE_CALENDAR_API_KEY to .env and restart Vite.");
  }

  const calendarId = String(import.meta.env.VITE_GOOGLE_HOLIDAY_CALENDAR_ID ?? DEFAULT_INDIA_HOLIDAY_CALENDAR).trim() || DEFAULT_INDIA_HOLIDAY_CALENDAR;
  const timeMin = `${year}-01-01T00:00:00+05:30`;
  const timeMax = `${year + 1}-01-01T00:00:00+05:30`;
  const params = new URLSearchParams({
    key: apiKey,
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`);
  if (!response.ok) {
    let message = `Google Calendar request failed (${response.status}).`;
    try {
      const body = await response.json() as { error?: { message?: string; status?: string } };
      if (body.error?.message) message = `Google Calendar: ${body.error.message}`;
    } catch {
      // Keep the generic HTTP error if Google did not return JSON.
    }
    throw new Error(message);
  }

  const payload = await response.json() as { items?: Array<{ id?: string; summary?: string; start?: { date?: string }; end?: { date?: string } }> };
  return (payload.items ?? [])
    .filter((event) => event.start?.date && event.end?.date)
    .map((event) => ({
      date: event.start!.date!,
      endDate: event.end!.date!,
      name: event.summary || "Google Calendar holiday",
      eventId: event.id || `${event.start!.date!}-${event.summary || "holiday"}`,
    }));
}

/**
 * No-key fallback for Indian public holidays. This keeps the Manager sync
 * usable when a Google browser key is missing, restricted, expired, or
 * temporarily unavailable. The app still prefers Google when it works.
 */
export async function fetchNagerIndiaHolidays(year: number): Promise<GoogleHoliday[]> {
  const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/IN`);
  if (!response.ok) {
    throw new Error(`Holiday fallback request failed (${response.status}).`);
  }

  const payload = await response.json() as Array<{ date?: string; localName?: string; name?: string; global?: boolean; types?: string[] }>;
  return payload
    .filter((holiday) => holiday.date)
    .map((holiday) => ({
      date: holiday.date!,
      endDate: holiday.date!,
      name: holiday.localName || holiday.name || "India public holiday",
      eventId: `nager-${holiday.date}-${holiday.name || holiday.localName || "holiday"}`,
    }));
}

export async function fetchIndiaHolidays(year: number): Promise<HolidaySyncResult> {
  try {
    const events = await fetchGoogleIndiaHolidays(year);
    return { source: "google", events };
  } catch (googleError) {
    const warning = googleError instanceof Error ? googleError.message : "Google Calendar was unavailable.";
    const events = await fetchNagerIndiaHolidays(year);
    return { source: "nager", events, warning };
  }
}
