/**
 * Google Calendar integration — busca slots livres e cria eventos
 * Usa OAuth2 com refresh_token armazenado no funil
 */

type TokenResponse = { access_token: string; expires_in: number };
type CalEvent = { id: string; start: { dateTime: string }; end: { dateTime: string }; summary?: string };

// ── Renovar access token via refresh token ──────────────────────
export async function getAccessToken(refreshToken: string): Promise<string | null> {
  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) return null;
    const data: TokenResponse = await res.json();
    return data.access_token ?? null;
  } catch { return null; }
}

// ── Buscar eventos do dia seguinte ──────────────────────────────
async function getEventsForDay(
  accessToken: string,
  calendarId: string,
  date: Date
): Promise<CalEvent[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", start.toISOString());
  url.searchParams.set("timeMax", end.toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? [];
}

// ── Gerar slots disponíveis para o dia seguinte ─────────────────
export async function getAvailableSlots(
  refreshToken: string,
  calendarId: string,
  slotDuration: number,  // minutos
  startHour: number,     // ex: 9
  endHour: number        // ex: 18
): Promise<{ label: string; start: Date; end: Date }[]> {
  const accessToken = await getAccessToken(refreshToken);
  if (!accessToken) return [];

  // Dia seguinte em BRT (UTC-3)
  const nowBRT  = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const tomorrow = new Date(nowBRT);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const events = await getEventsForDay(accessToken, calendarId, tomorrow);

  // Mapear eventos ocupados
  const busy: { start: Date; end: Date }[] = events.map(e => ({
    start: new Date(e.start.dateTime),
    end:   new Date(e.end.dateTime),
  }));

  // Gerar todos os slots do dia
  const slots: { label: string; start: Date; end: Date }[] = [];
  const dayStart = new Date(tomorrow);
  dayStart.setHours(startHour, 0, 0, 0);
  const dayEnd = new Date(tomorrow);
  dayEnd.setHours(endHour, 0, 0, 0);

  let cursor = new Date(dayStart);
  while (cursor < dayEnd) {
    const slotEnd = new Date(cursor.getTime() + slotDuration * 60 * 1000);
    if (slotEnd > dayEnd) break;

    // Verificar se está livre
    const isBusy = busy.some(b => cursor < b.end && slotEnd > b.start);
    if (!isBusy) {
      const label = cursor.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      slots.push({ label, start: new Date(cursor), end: new Date(slotEnd) });
    }
    cursor = slotEnd;
  }

  return slots;
}

// ── Criar evento no Google Calendar ────────────────────────────
export async function createCalendarEvent(
  refreshToken: string,
  calendarId: string,
  title: string,
  description: string,
  start: Date,
  end: Date,
  attendeeEmail?: string
): Promise<string | null> {
  const accessToken = await getAccessToken(refreshToken);
  if (!accessToken) return null;

  const body: any = {
    summary:     title,
    description,
    start:       { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
    end:         { dateTime: end.toISOString(),   timeZone: "America/Sao_Paulo" },
  };

  if (attendeeEmail) {
    body.attendees = [{ email: attendeeEmail }];
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method:  "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      }
    );
    if (!res.ok) { console.error("GCal create event error:", await res.text()); return null; }
    const data = await res.json();
    return data.id ?? null;
  } catch (e) {
    console.error("createCalendarEvent error:", e);
    return null;
  }
}
