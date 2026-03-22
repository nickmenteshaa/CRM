/**
 * Centralized date/time formatting utilities.
 * All display dates in the CRM should use these functions
 * to respect the user-selected timezone from AppSettings.
 */

/** Full IANA timezone list for the Settings picker, grouped by region */
export const TIMEZONE_OPTIONS = [
  // UTC
  { value: "UTC", label: "UTC (GMT+0)" },
  // Americas
  { value: "Pacific/Honolulu", label: "Honolulu (GMT-10)" },
  { value: "America/Anchorage", label: "Anchorage (GMT-9/-8)" },
  { value: "America/Los_Angeles", label: "Los Angeles (GMT-8/-7)" },
  { value: "America/Vancouver", label: "Vancouver (GMT-8/-7)" },
  { value: "America/Denver", label: "Denver (GMT-7/-6)" },
  { value: "America/Phoenix", label: "Phoenix (GMT-7)" },
  { value: "America/Chicago", label: "Chicago (GMT-6/-5)" },
  { value: "America/Mexico_City", label: "Mexico City (GMT-6/-5)" },
  { value: "America/New_York", label: "New York (GMT-5/-4)" },
  { value: "America/Toronto", label: "Toronto (GMT-5/-4)" },
  { value: "America/Bogota", label: "Bogota (GMT-5)" },
  { value: "America/Lima", label: "Lima (GMT-5)" },
  { value: "America/Caracas", label: "Caracas (GMT-4)" },
  { value: "America/Halifax", label: "Halifax (GMT-4/-3)" },
  { value: "America/Sao_Paulo", label: "São Paulo (GMT-3)" },
  { value: "America/Buenos_Aires", label: "Buenos Aires (GMT-3)" },
  { value: "America/Santiago", label: "Santiago (GMT-4/-3)" },
  // Europe
  { value: "Atlantic/Reykjavik", label: "Reykjavik (GMT+0)" },
  { value: "Europe/London", label: "London (GMT+0/+1)" },
  { value: "Europe/Dublin", label: "Dublin (GMT+0/+1)" },
  { value: "Europe/Lisbon", label: "Lisbon (GMT+0/+1)" },
  { value: "Europe/Paris", label: "Paris (GMT+1/+2)" },
  { value: "Europe/Berlin", label: "Berlin (GMT+1/+2)" },
  { value: "Europe/Amsterdam", label: "Amsterdam (GMT+1/+2)" },
  { value: "Europe/Brussels", label: "Brussels (GMT+1/+2)" },
  { value: "Europe/Madrid", label: "Madrid (GMT+1/+2)" },
  { value: "Europe/Rome", label: "Rome (GMT+1/+2)" },
  { value: "Europe/Zurich", label: "Zurich (GMT+1/+2)" },
  { value: "Europe/Warsaw", label: "Warsaw (GMT+1/+2)" },
  { value: "Europe/Stockholm", label: "Stockholm (GMT+1/+2)" },
  { value: "Europe/Vienna", label: "Vienna (GMT+1/+2)" },
  { value: "Europe/Prague", label: "Prague (GMT+1/+2)" },
  { value: "Europe/Athens", label: "Athens (GMT+2/+3)" },
  { value: "Europe/Bucharest", label: "Bucharest (GMT+2/+3)" },
  { value: "Europe/Helsinki", label: "Helsinki (GMT+2/+3)" },
  { value: "Europe/Kyiv", label: "Kyiv (GMT+2/+3)" },
  { value: "Europe/Istanbul", label: "Istanbul (GMT+3)" },
  { value: "Europe/Moscow", label: "Moscow (GMT+3)" },
  // Africa
  { value: "Africa/Casablanca", label: "Casablanca (GMT+0/+1)" },
  { value: "Africa/Lagos", label: "Lagos (GMT+1)" },
  { value: "Africa/Cairo", label: "Cairo (GMT+2)" },
  { value: "Africa/Johannesburg", label: "Johannesburg (GMT+2)" },
  { value: "Africa/Nairobi", label: "Nairobi (GMT+3)" },
  // Middle East
  { value: "Asia/Beirut", label: "Beirut (GMT+2/+3)" },
  { value: "Asia/Jerusalem", label: "Jerusalem (GMT+2/+3)" },
  { value: "Asia/Riyadh", label: "Riyadh (GMT+3)" },
  { value: "Asia/Kuwait", label: "Kuwait (GMT+3)" },
  { value: "Asia/Baghdad", label: "Baghdad (GMT+3)" },
  { value: "Asia/Tehran", label: "Tehran (GMT+3:30)" },
  { value: "Asia/Dubai", label: "Dubai (GMT+4)" },
  { value: "Asia/Muscat", label: "Muscat (GMT+4)" },
  { value: "Asia/Tbilisi", label: "Tbilisi (GMT+4)" },
  { value: "Asia/Baku", label: "Baku (GMT+4)" },
  // Central & South Asia
  { value: "Asia/Kabul", label: "Kabul (GMT+4:30)" },
  { value: "Asia/Karachi", label: "Karachi (GMT+5)" },
  { value: "Asia/Tashkent", label: "Tashkent (GMT+5)" },
  { value: "Asia/Yekaterinburg", label: "Yekaterinburg (GMT+5)" },
  { value: "Asia/Kolkata", label: "India (GMT+5:30)" },
  { value: "Asia/Colombo", label: "Colombo (GMT+5:30)" },
  { value: "Asia/Kathmandu", label: "Kathmandu (GMT+5:45)" },
  { value: "Asia/Dhaka", label: "Dhaka (GMT+6)" },
  { value: "Asia/Almaty", label: "Almaty (GMT+6)" },
  { value: "Asia/Yangon", label: "Yangon (GMT+6:30)" },
  // East & Southeast Asia
  { value: "Asia/Bangkok", label: "Bangkok (GMT+7)" },
  { value: "Asia/Jakarta", label: "Jakarta (GMT+7)" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (GMT+7)" },
  { value: "Asia/Shanghai", label: "Shanghai (GMT+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (GMT+8)" },
  { value: "Asia/Singapore", label: "Singapore (GMT+8)" },
  { value: "Asia/Taipei", label: "Taipei (GMT+8)" },
  { value: "Asia/Manila", label: "Manila (GMT+8)" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (GMT+8)" },
  { value: "Asia/Seoul", label: "Seoul (GMT+9)" },
  { value: "Asia/Tokyo", label: "Tokyo (GMT+9)" },
  // Oceania
  { value: "Australia/Perth", label: "Perth (GMT+8)" },
  { value: "Australia/Adelaide", label: "Adelaide (GMT+9:30/+10:30)" },
  { value: "Australia/Sydney", label: "Sydney (GMT+10/+11)" },
  { value: "Australia/Melbourne", label: "Melbourne (GMT+10/+11)" },
  { value: "Australia/Brisbane", label: "Brisbane (GMT+10)" },
  { value: "Pacific/Auckland", label: "Auckland (GMT+12/+13)" },
  { value: "Pacific/Fiji", label: "Fiji (GMT+12/+13)" },
];

/**
 * Format a date/time string or Date for display in the given timezone.
 * Returns a short date like "Mar 22" or "Mar 22, 2026" depending on format.
 */
export function formatDate(
  input: string | Date | null | undefined,
  timezone: string,
  options?: { includeTime?: boolean; includeYear?: boolean },
): string {
  if (!input) return "—";

  const date = typeof input === "string" ? new Date(input) : input;
  if (isNaN(date.getTime())) return typeof input === "string" ? input : "—";

  try {
    const opts: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      month: "short",
      day: "numeric",
    };
    if (options?.includeYear) opts.year = "numeric";
    if (options?.includeTime) {
      opts.hour = "2-digit";
      opts.minute = "2-digit";
      opts.hour12 = false;
    }
    return new Intl.DateTimeFormat("en-US", opts).format(date);
  } catch {
    // Fallback if timezone is invalid
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

/**
 * Format a date as a full datetime string: "Mar 22, 2026 14:30"
 */
export function formatDateTime(
  input: string | Date | null | undefined,
  timezone: string,
): string {
  return formatDate(input, timezone, { includeTime: true, includeYear: true });
}

/**
 * Format a date as relative: "Today", "Yesterday", "Mar 22"
 */
export function formatRelativeDate(
  input: string | Date | null | undefined,
  timezone: string,
): string {
  if (!input) return "—";

  const date = typeof input === "string" ? new Date(input) : input;
  if (isNaN(date.getTime())) return typeof input === "string" ? input : "—";

  try {
    const now = new Date();
    const nowInTz = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const dateInTz = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

    if (nowInTz === dateInTz) return "Today";

    // Check yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayInTz = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(yesterday);
    if (dateInTz === yesterdayInTz) return "Yesterday";

    return formatDate(date, timezone);
  } catch {
    return formatDate(date, timezone);
  }
}

/**
 * Get current time string in the given timezone: "14:30"
 */
export function nowTimeString(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
}

/**
 * Get current date string in the given timezone: "Mar 22"
 */
export function nowDateString(timezone: string): string {
  return formatDate(new Date(), timezone);
}
