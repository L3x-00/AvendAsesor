/**
 * Conversions between the `<input type="date">` value the panel shows and the
 * ISO instants the API stores for an access window.
 *
 * Peru does not observe daylight saving time, so America/Lima is a fixed
 * UTC-05:00. A start date means the beginning of that day in Lima and an expiry
 * date means the end of that day, so access lasts through the chosen date.
 */
const LIMA_UTC_OFFSET = "-05:00";
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const limaDayFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Lima",
  year: "numeric",
});

function toLimaInstant(dateInput: string, timeOfDay: string): string | null {
  const normalized = dateInput.trim();
  const match = DATE_INPUT_PATTERN.exec(normalized);
  if (!match) return null;

  // Date.parse rolls impossible days over (2026-02-30 becomes March 2), so the
  // calendar day is confirmed before it is trusted.
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const parsed = Date.parse(`${normalized}T${timeOfDay}${LIMA_UTC_OFFSET}`);
  if (Number.isNaN(parsed)) return null;

  return new Date(parsed).toISOString();
}

/** Start of the given calendar day in Lima, as an ISO instant. */
export function accessStartInstant(dateInput: string): string | null {
  return toLimaInstant(dateInput, "00:00:00.000");
}

/** End of the given calendar day in Lima, so access covers the whole day. */
export function accessExpiryInstant(dateInput: string): string | null {
  return toLimaInstant(dateInput, "23:59:59.999");
}

/** Calendar day (YYYY-MM-DD) as seen in Lima, for prefilling a date input. */
export function toDateInputValue(instant: string | null): string {
  if (!instant) return "";

  const parsed = Date.parse(instant);
  if (Number.isNaN(parsed)) return "";

  return limaDayFormatter.format(new Date(parsed));
}
