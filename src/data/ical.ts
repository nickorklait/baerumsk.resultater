// Minimal iCalendar (RFC 5545) reader: enough for the fotball.no feeds.
// Handles line folding, property parameters and TEXT escapes.

export interface IcalProperty {
  value: string;
  params: Record<string, string>;
}

export type IcalEvent = Record<string, IcalProperty>;

export interface IcalCalendar {
  name?: string;
  events: IcalEvent[];
}

export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

function parseLine(line: string): [string, IcalProperty] | null {
  const colon = findValueColon(line);
  if (colon < 0) return null;
  const [name, ...paramParts] = line.slice(0, colon).split(';');
  const params: Record<string, string> = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return [name.toUpperCase(), { value: line.slice(colon + 1), params }];
}

// The first colon outside a quoted parameter value separates name from value.
function findValueColon(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) return i;
  }
  return -1;
}

export function parseIcal(text: string): IcalCalendar {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const cal: IcalCalendar = { events: [] };
  let current: IcalEvent | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {};
    else if (line === 'END:VEVENT') {
      if (current) cal.events.push(current);
      current = null;
    } else {
      const parsed = parseLine(line);
      if (!parsed) continue;
      const [name, prop] = parsed;
      if (current) current[name] = prop;
      else if (name === 'X-WR-CALNAME') cal.name = unescapeText(prop.value);
    }
  }
  return cal;
}

/** "20261018T170000" (floating, TZID=Europe/Oslo in practice) -> "2026-10-18T17:00". */
export function icalLocalDateTime(value: string): string {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) throw new Error(`Unexpected DATE-TIME: ${value}`);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
}
