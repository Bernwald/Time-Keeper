// Google Calendar API helper for Edge Functions
// Uses OAuth refresh token to get access tokens and interact with Calendar API

import { getGoogleCredsForOrg } from "./integration-registry.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

function getGoogleClientId(): string {
  const id = Deno.env.get("GOOGLE_CLIENT_ID");
  if (!id) throw new Error("GOOGLE_CLIENT_ID not set");
  return id;
}

function getGoogleClientSecret(): string {
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET not set");
  return secret;
}

export type CalendarSettings = {
  default_duration_minutes: number;
  buffer_minutes: number;
  working_hours_start: string; // "HH:MM"
  working_hours_end: string;   // "HH:MM"
  timezone: string;
};

export type TimeSlot = {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
};

export type CalendarEvent = {
  summary: string;
  date: string;         // "YYYY-MM-DD"
  startTime: string;    // "HH:MM"
  durationMinutes: number;
  attendeeName?: string;
  attendeeEmail?: string;
  description?: string;
};

// ─── TOKEN MANAGEMENT ────────────────────────────────────────────────────────

export async function refreshAccessToken(
  refreshToken: string,
  orgId?: string,
): Promise<{ access_token: string; expires_at: Date } | null> {
  try {
    // Use org-specific credentials if orgId provided, else global env vars
    let clientId: string;
    let clientSecret: string;
    if (orgId) {
      const creds = await getGoogleCredsForOrg(orgId);
      clientId = creds.clientId;
      clientSecret = creds.clientSecret;
    } else {
      clientId = getGoogleClientId();
      clientSecret = getGoogleClientSecret();
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[calendar] Token refresh error:", response.status, errText);
      return null;
    }

    const data = await response.json();
    console.log("[calendar] Token refreshed, expires_in:", data.expires_in);
    const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);

    return {
      access_token: data.access_token,
      expires_at: expiresAt,
    };
  } catch (err) {
    console.error("Google token refresh failed:", err);
    return null;
  }
}

// ─── AVAILABLE SLOTS ─────────────────────────────────────────────────────────

async function listBusyCalendarIds(
  accessToken: string,
  primaryCalendarId: string,
): Promise<string[]> {
  // Fetch all calendars the user is subscribed to and consider every one that
  // is not hidden for busy-time aggregation. We intentionally ignore the
  // `selected` flag (that only controls UI visibility) so secondary calendars
  // like "Chiara&Thomas" or "Arbeit" always count as busy time.
  try {
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/users/me/calendarList?minAccessRole=freeBusyReader&showHidden=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      console.error("[calendar] calendarList error:", res.status, await res.text());
      return [primaryCalendarId];
    }
    const data = await res.json();
    const items = (data.items ?? []) as Array<{ id: string; hidden?: boolean }>;
    const ids = items.filter((c) => !c.hidden && c.id).map((c) => c.id);
    // Ensure the primary/booking calendar is always included, even if for some
    // reason it is not returned by calendarList.
    if (!ids.includes(primaryCalendarId)) ids.push(primaryCalendarId);
    return ids;
  } catch (err) {
    console.error("[calendar] calendarList fetch failed:", err);
    return [primaryCalendarId];
  }
}

export async function listAvailableSlots(
  accessToken: string,
  calendarId: string,
  date: string,
  durationMinutes: number,
  settings: CalendarSettings,
): Promise<TimeSlot[]> {
  const tz = settings.timezone || "Europe/Berlin";
  const startOfDay = `${date}T${settings.working_hours_start}:00`;
  const endOfDay = `${date}T${settings.working_hours_end}:00`;

  // Aggregate busy periods across ALL of the user's calendars, not just the
  // primary booking calendar. Otherwise events in secondary calendars (e.g.
  // shared family or work calendars) would be treated as free time.
  const calendarIds = await listBusyCalendarIds(accessToken, calendarId);

  // FreeBusy supports up to 50 items per request — chunk defensively.
  const chunks: string[][] = [];
  for (let i = 0; i < calendarIds.length; i += 50) {
    chunks.push(calendarIds.slice(i, i + 50));
  }

  const busyPeriods: Array<{ start: string; end: string }> = [];
  for (const chunk of chunks) {
    const response = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: toISOWithTZ(startOfDay, tz),
        timeMax: toISOWithTZ(endOfDay, tz),
        timeZone: tz,
        items: chunk.map((id) => ({ id })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[calendar] FreeBusy error:", response.status, errText);
      return [{ start: "__ERROR__", end: `${response.status}: ${errText.slice(0, 200)}` }];
    }

    const data = await response.json();
    const calendars = data.calendars ?? {};
    for (const id of chunk) {
      const calendarData = calendars[id];
      if (!calendarData) continue;
      if (calendarData.errors) {
        // Skip calendars we cannot read (e.g. no access) but keep going —
        // a single unreadable secondary calendar must not break scheduling.
        console.warn("[calendar] FreeBusy calendar skipped:", id, JSON.stringify(calendarData.errors));
        continue;
      }
      for (const period of calendarData.busy ?? []) {
        busyPeriods.push(period);
      }
    }
  }

  // Convert busy periods to minutes since start of working hours
  const workStart = timeToMinutes(settings.working_hours_start);
  const workEnd = timeToMinutes(settings.working_hours_end);
  const buffer = settings.buffer_minutes || 0;

  const busySlots = busyPeriods.map((period: { start: string; end: string }) => {
    const start = dateToMinutesSinceWorkStart(period.start, tz, workStart);
    const end = dateToMinutesSinceWorkStart(period.end, tz, workStart);
    return { start: start - buffer, end: end + buffer };
  });

  // Find free slots
  const slots: TimeSlot[] = [];
  let cursor = 0; // minutes from work start
  const totalMinutes = workEnd - workStart;

  while (cursor + durationMinutes <= totalMinutes) {
    const slotStart = cursor;
    const slotEnd = cursor + durationMinutes;

    // Check if this slot overlaps with any busy period
    const isAvailable = !busySlots.some(
      (busy: { start: number; end: number }) =>
        slotStart < busy.end && slotEnd > busy.start,
    );

    if (isAvailable) {
      slots.push({
        start: minutesToTime(workStart + slotStart),
        end: minutesToTime(workStart + slotEnd),
      });
      cursor += durationMinutes + buffer;
    } else {
      // Jump past the blocking busy period
      const blockingEnd = Math.max(
        ...busySlots
          .filter((busy: { start: number; end: number }) => slotStart < busy.end && slotEnd > busy.start)
          .map((busy: { start: number; end: number }) => busy.end),
      );
      cursor = Math.max(cursor + 15, blockingEnd); // advance at least 15 min
    }
  }

  return slots;
}

// ─── CREATE EVENT ────────────────────────────────────────────────────────────

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent,
  timezone: string,
): Promise<{ ok: boolean; eventLink?: string; error?: string }> {
  const startDateTime = `${event.date}T${event.startTime}:00`;
  const endMinutes = timeToMinutes(event.startTime) + event.durationMinutes;
  const endTime = minutesToTime(endMinutes);
  const endDateTime = `${event.date}T${endTime}:00`;

  const eventBody: Record<string, unknown> = {
    summary: event.summary,
    start: { dateTime: toISOWithTZ(startDateTime, timezone), timeZone: timezone },
    end: { dateTime: toISOWithTZ(endDateTime, timezone), timeZone: timezone },
  };

  if (event.description) {
    eventBody.description = event.description;
  }

  if (event.attendeeEmail) {
    eventBody.attendees = [
      {
        email: event.attendeeEmail,
        displayName: event.attendeeName || undefined,
      },
    ];
    eventBody.sendUpdates = "all";
  }

  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google Calendar create event error:", response.status, errText);
      return { ok: false, error: `Google API Fehler: ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, eventLink: data.htmlLink };
  } catch (err) {
    console.error("Google Calendar create event failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toISOWithTZ(localDateTime: string, tz: string): string {
  // Create a date in the specified timezone and return ISO string
  // localDateTime format: "YYYY-MM-DDThh:mm:ss"
  try {
    const date = new Date(localDateTime);
    // Use Intl to get the timezone offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    });

    const parts = formatter.formatToParts(date);
    const offset = parts.find((p) => p.type === "timeZoneName")?.value ?? "+00:00";
    // offset format: "GMT+01:00" → "+01:00"
    const cleanOffset = offset.replace("GMT", "") || "+00:00";

    return `${localDateTime}${cleanOffset}`;
  } catch {
    // Fallback: append Z
    return `${localDateTime}Z`;
  }
}

function dateToMinutesSinceWorkStart(
  isoDate: string,
  tz: string,
  workStartMinutes: number,
): number {
  const date = new Date(isoDate);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeStr = formatter.format(date); // "HH:MM"
  const totalMinutes = timeToMinutes(timeStr);
  return totalMinutes - workStartMinutes;
}
