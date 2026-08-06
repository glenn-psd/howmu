export const MAX_INTEGER_DIGITS = 12;
export const MAX_DECIMAL_DIGITS = 2;
export const RATE_TTL_MS = 6 * 60 * 60 * 1000;

export type KeypadKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "00"
  | "."
  | "clear"
  | "backspace";

export function applyKey(current: string, key: KeypadKey): string {
  if (key === "clear") return "";
  if (key === "backspace") return current.slice(0, -1);
  if (key === ".") return current.includes(".") ? current : `${current || "0"}.`;
  if (!current && key === "00") return "0";

  const [integer = "", decimals] = current.split(".");
  if (decimals !== undefined) {
    if (decimals.length >= MAX_DECIMAL_DIGITS) return current;
    return `${current}${key}`.slice(0, current.length + (MAX_DECIMAL_DIGITS - decimals.length));
  }

  if (current === "0") return key === "00" ? current : key;
  if (integer.length >= MAX_INTEGER_DIGITS) return current;

  const remaining = MAX_INTEGER_DIGITS - integer.length;
  return `${current}${key.slice(0, remaining)}`;
}

export function convertAmount(amount: string, rate: number | null): number | null {
  if (!amount || rate === null) return null;
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed * rate : null;
}

export function isRateFresh(fetchedAt: number, now = Date.now()): boolean {
  return fetchedAt > 0 && now - fetchedAt < RATE_TTL_MS;
}

export function formatInput(amount: string): string {
  if (!amount) return "0";
  const [integer, decimals] = amount.split(".");
  const grouped = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(
    Number(integer || 0),
  );
  return decimals === undefined ? grouped : `${grouped}.${decimals}`;
}
