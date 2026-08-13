export type Currency = {
  iso_code: string;
  name: string;
  symbol?: string;
};

export type Rate = {
  base: string;
  quote: string;
  rate: number;
  date: string;
  fetchedAt: number;
};

export type PickerTarget = "home" | "travel";

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value);
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parsePreferences(value: unknown, supportedCodes?: readonly string[]): { home: string; travel: string } {
  if (!value || typeof value !== "object") return { home: "KRW", travel: "" };
  const candidate = value as { home?: unknown; travel?: unknown };
  const supported = supportedCodes ? new Set(supportedCodes) : null;
  const isSupported = (code: unknown): code is string => isCurrencyCode(code) && (!supported || supported.has(code));
  const home = isSupported(candidate.home) ? candidate.home : "KRW";
  const travel = isSupported(candidate.travel) && candidate.travel !== home ? candidate.travel : "";
  return { home, travel };
}

export function parseCurrencies(value: unknown): Currency[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<Currency>;
    if (!isCurrencyCode(candidate.iso_code) || typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    if (seen.has(candidate.iso_code)) return [];
    seen.add(candidate.iso_code);
    return [{
      iso_code: candidate.iso_code,
      name: candidate.name.trim(),
      ...(typeof candidate.symbol === "string" ? { symbol: candidate.symbol } : {}),
    }];
  });
}

export function parseRate(value: unknown, base: string, quote: string): Rate | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<Rate>;
  if (
    candidate.base !== base ||
    candidate.quote !== quote ||
    typeof candidate.rate !== "number" ||
    !Number.isFinite(candidate.rate) ||
    candidate.rate <= 0 ||
    typeof candidate.date !== "string" ||
    !isCalendarDate(candidate.date) ||
    typeof candidate.fetchedAt !== "number" ||
    !Number.isFinite(candidate.fetchedAt) ||
    candidate.fetchedAt <= 0
  ) return null;

  return candidate as Rate;
}

export function parseRateResponse(value: unknown, base: string, quote: string, fetchedAt = Date.now()): Rate | null {
  if (!value || typeof value !== "object") return null;
  return parseRate({ ...(value as Partial<Rate>), fetchedAt }, base, quote);
}

export function selectCurrencyPair(
  home: string,
  travel: string,
  selected: string,
  target: PickerTarget,
): { home: string; travel: string } {
  if (target === "travel") {
    if (selected === home) {
      return travel ? { home: travel, travel: home } : { home, travel: "" };
    }
    return { home, travel: selected };
  }

  return selected === travel
    ? { home: selected, travel: home }
    : { home: selected, travel };
}
