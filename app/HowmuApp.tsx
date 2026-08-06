"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyKey,
  applyOperator,
  convertAmount,
  formatInput,
  isRateFresh,
  type KeypadKey,
  type Operator,
} from "./calculator";

type Currency = {
  iso_code: string;
  name: string;
  symbol?: string;
};

type Rate = {
  base: string;
  quote: string;
  rate: number;
  date: string;
  fetchedAt: number;
};

type PickerTarget = "home" | "travel";
type Theme = "light" | "dark";

const API = "https://api.frankfurter.dev/v2";
const PREFS_KEY = "howmu:preferences";
const CURRENCIES_KEY = "howmu:currencies";
const THEME_KEY = "howmu:theme";

const FALLBACK_CURRENCIES: Currency[] = [
  { iso_code: "THB", name: "Thai Baht", symbol: "฿" },
  { iso_code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { iso_code: "USD", name: "United States Dollar", symbol: "$" },
  { iso_code: "VND", name: "Vietnamese Đồng", symbol: "₫" },
  { iso_code: "EUR", name: "Euro", symbol: "€" },
  { iso_code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { iso_code: "TWD", name: "New Taiwan Dollar", symbol: "NT$" },
  { iso_code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { iso_code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { iso_code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { iso_code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { iso_code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { iso_code: "GBP", name: "British Pound", symbol: "£" },
  { iso_code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { iso_code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { iso_code: "KRW", name: "South Korean Won", symbol: "₩" },
];

const POPULAR_CODES = ["THB", "JPY", "USD", "VND", "EUR", "TWD"];
const KEYPAD: (KeypadKey | Operator)[] = [
  "1", "2", "3", "÷",
  "4", "5", "6", "×",
  "7", "8", "9", "−",
  ".", "0", "backspace", "+",
];

const displayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["ko"], { type: "currency" })
    : null;

function currencyName(currency: Currency): string {
  const localized = displayNames?.of(currency.iso_code);
  return localized && localized !== currency.iso_code ? localized : currency.name;
}

function safeRead<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function validRate(value: unknown, base: string, quote: string): value is Rate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Rate>;
  return (
    candidate.base === base &&
    candidate.quote === quote &&
    typeof candidate.rate === "number" &&
    Number.isFinite(candidate.rate) &&
    candidate.rate > 0 &&
    typeof candidate.date === "string" &&
    typeof candidate.fetchedAt === "number"
  );
}

function rateKey(base: string, quote: string) {
  return `howmu:rate:${base}:${quote}`;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#050608" : "#f1f2f6");
}

function formatMoney(value: number | null, currency: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(value);
}

function formatRate(value: number, currency: string): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KRW" ? 2 : 4,
  }).format(value);
}

function CurrencyOption({ currency, onSelect }: { currency: Currency; onSelect: () => void }) {
  return (
    <button className="currency-option" type="button" onClick={onSelect}>
      <span className="currency-symbol" aria-hidden="true">
        {currency.symbol || currency.iso_code.slice(0, 1)}
      </span>
      <span className="currency-copy">
        <strong>{currencyName(currency)}</strong>
        <small>{currency.name}</small>
      </span>
      <b>{currency.iso_code}</b>
    </button>
  );
}

function CurrencyList({
  currencies,
  query,
  onSelect,
}: {
  currencies: Currency[];
  query: string;
  onSelect: (currency: Currency) => void;
}) {
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ko");
    const source = needle
      ? currencies.filter((currency) =>
          [currency.iso_code, currency.name, currencyName(currency)]
            .join(" ")
            .toLocaleLowerCase("ko")
            .includes(needle),
        )
      : [...currencies].sort((a, b) => {
          const aPopular = POPULAR_CODES.indexOf(a.iso_code);
          const bPopular = POPULAR_CODES.indexOf(b.iso_code);
          if (aPopular >= 0 || bPopular >= 0) {
            if (aPopular < 0) return 1;
            if (bPopular < 0) return -1;
            return aPopular - bPopular;
          }
          return currencyName(a).localeCompare(currencyName(b), "ko");
        });
    return source.slice(0, needle ? 80 : 24);
  }, [currencies, query]);

  if (!results.length) return <p className="empty-search">일치하는 통화를 찾지 못했어요.</p>;

  return (
    <div className="currency-list">
      {results.map((currency) => (
        <CurrencyOption
          key={currency.iso_code}
          currency={currency}
          onSelect={() => onSelect(currency)}
        />
      ))}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="HOWMU 하무">
      <span>howmu</span>
      <b>?</b>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const label = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";

  return (
    <button className="theme-toggle" type="button" aria-label={label} title={label} onClick={onToggle}>
      <span aria-hidden="true">{theme === "dark" ? "☀︎" : "☾"}</span>
    </button>
  );
}

export default function HowmuApp() {
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [home, setHome] = useState("KRW");
  const [travel, setTravel] = useState("");
  const [amount, setAmount] = useState("");
  const [pendingCalculation, setPendingCalculation] = useState<{ value: number; operator: Operator } | null>(null);
  const [replaceAmount, setReplaceAmount] = useState(false);
  const [currencies, setCurrencies] = useState<Currency[]>(FALLBACK_CURRENCIES);
  const [rate, setRate] = useState<Rate | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [rateError, setRateError] = useState(false);
  const [online, setOnline] = useState(true);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const preferences = safeRead<{ home?: string; travel?: string }>(PREFS_KEY);
    const cachedCurrencies = safeRead<Currency[]>(CURRENCIES_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY);
    const initialTheme: Theme = savedTheme === "light" || savedTheme === "dark"
      ? savedTheme
      : "dark";
    applyTheme(initialTheme);

    queueMicrotask(() => {
      if (preferences?.home) setHome(preferences.home);
      if (preferences?.travel) setTravel(preferences.travel);
      if (Array.isArray(cachedCurrencies) && cachedCurrencies.length) {
        setCurrencies(cachedCurrencies);
      }
      setTheme(initialTheme);
      setOnline(navigator.onLine);
      setReady(true);
    });

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    fetch(`${API}/currencies`)
      .then((response) => {
        if (!response.ok) throw new Error("currency request failed");
        return response.json();
      })
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const next = data.filter(
          (item): item is Currency =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof item.iso_code === "string" &&
                /^[A-Z]{3}$/.test(item.iso_code) &&
                typeof item.name === "string",
            ),
        );
        if (next.length) {
          setCurrencies(next);
          localStorage.setItem(CURRENCIES_KEY, JSON.stringify(next));
        }
      })
      .catch(() => undefined);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!ready || !home || !travel) return;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ home, travel }));

    if (home === travel) {
      queueMicrotask(() => {
        setRate({ base: travel, quote: home, rate: 1, date: new Date().toISOString().slice(0, 10), fetchedAt: Date.now() });
      });
      return;
    }

    const storageKey = rateKey(travel, home);
    const cached = safeRead<Rate>(storageKey);
    const usableCache = validRate(cached, travel, home) ? cached : null;
    queueMicrotask(() => {
      setRate(usableCache);
      setRateError(false);
    });

    if (usableCache && isRateFresh(usableCache.fetchedAt)) return;

    const controller = new AbortController();
    queueMicrotask(() => setRefreshing(true));

    fetch(`${API}/rate/${travel}/${home}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("rate request failed");
        return response.json();
      })
      .then((data: unknown) => {
        const candidate = data as Partial<Rate>;
        if (
          candidate.base !== travel ||
          candidate.quote !== home ||
          typeof candidate.rate !== "number" ||
          !Number.isFinite(candidate.rate) ||
          candidate.rate <= 0 ||
          typeof candidate.date !== "string"
        ) {
          throw new Error("invalid rate response");
        }
        const next: Rate = {
          base: travel,
          quote: home,
          rate: candidate.rate,
          date: candidate.date,
          fetchedAt: Date.now(),
        };
        setRate(next);
        setRateError(false);
        localStorage.setItem(storageKey, JSON.stringify(next));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setRateError(true);
      })
      .finally(() => setRefreshing(false));

    return () => controller.abort();
  }, [home, ready, travel]);

  useEffect(() => {
    if (picker) requestAnimationFrame(() => searchRef.current?.focus());
  }, [picker]);

  const homeCurrency = currencies.find((currency) => currency.iso_code === home) ?? {
    iso_code: home,
    name: home,
  };
  const travelCurrency = currencies.find((currency) => currency.iso_code === travel) ?? {
    iso_code: travel,
    name: travel,
  };
  const converted = convertAmount(amount, rate?.rate ?? null);

  const chooseCurrency = (currency: Currency, target: PickerTarget) => {
    if (target === "travel") {
      if (currency.iso_code === home && travel) {
        setHome(travel);
        setTravel(home);
      } else {
        setTravel(currency.iso_code);
      }
    } else if (currency.iso_code === travel) {
      setTravel(home);
      setHome(currency.iso_code);
    } else {
      setHome(currency.iso_code);
    }
    setPicker(null);
    setQuery("");
    setAmount("");
    setPendingCalculation(null);
    setReplaceAmount(false);
  };

  const openPicker = (target: PickerTarget) => {
    setQuery("");
    setPicker(target);
  };

  const pressKey = (key: KeypadKey) => {
    if (key === "clear" || key === "backspace") {
      setPendingCalculation(null);
      setReplaceAmount(false);
    }
    setAmount((current) => applyKey(replaceAmount && key !== "clear" && key !== "backspace" ? "" : current, key));
    if (key !== "clear" && key !== "backspace") setReplaceAmount(false);
  };

  const pressOperator = (operator: Operator) => {
    if (!amount) return;
    const current = Number(amount);
    const result = pendingCalculation && !replaceAmount
      ? applyOperator(pendingCalculation.value, current, pendingCalculation.operator)
      : amount;
    if (result === null) return;
    const value = Number(result);
    setAmount(result);
    setPendingCalculation({ value, operator });
    setReplaceAmount(true);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  };

  if (!ready) {
    return (
      <main className="app-shell loading-shell">
        <Brand />
        <div className="loading-mark" aria-label="불러오는 중">?</div>
      </main>
    );
  }

  if (!travel) {
    return (
      <main className="app-shell onboarding-shell">
        <header className="onboarding-header">
          <Brand />
          <div className="header-actions">
            <p>HOWMU 하무</p>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </header>

        <section className="onboarding-intro">
          <span className="eyebrow">Know before you pay.</span>
          <h1>여행지 가격,<br />이제 바로 알아봐요.</h1>
          <p>내 기준 통화는 원화로 준비했어요.<br />여행지 통화만 골라주세요.</p>
        </section>

        <section className="setup-card" aria-labelledby="travel-currency-title">
          <div className="setup-title-row">
            <div>
              <span>내 기준 통화</span>
              <strong>대한민국 원</strong>
            </div>
            <b>KRW</b>
          </div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="여행지 통화 검색"
              aria-label="여행지 통화 검색"
            />
          </label>
          <h2 id="travel-currency-title">{query ? "검색 결과" : "인기 여행지 통화"}</h2>
          <CurrencyList currencies={currencies} query={query} onSelect={(currency) => chooseCurrency(currency, "travel")} />
        </section>
      </main>
    );
  }

  const rateStatus = !rate
    ? refreshing
      ? "환율을 불러오는 중이에요"
      : "인터넷에 연결해 환율을 받아주세요"
    : !online || rateError
      ? `저장된 ${rate.date} 환율 사용 중`
      : refreshing
        ? "최신 환율 확인 중"
        : `${rate.date} 기준 환율`;

  return (
    <main className="app-shell calculator-shell">
      <header className="app-header">
        <Brand />
        <div className="header-actions">
          <span className="header-caption">환율 계산기</span>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <section className="exchange-card" aria-label="통화 설정" aria-live="polite">
        <div className="currency-row">
          <button className="currency-select" type="button" onClick={() => openPicker("travel")}>
            <span className="currency-badge" aria-hidden="true">{travelCurrency.symbol || travelCurrency.iso_code.slice(0, 1)}</span>
            <span className="currency-label">
              <strong>{travelCurrency.iso_code}</strong>
              <small>{currencyName(travelCurrency)}</small>
            </span>
            <span className="chevron" aria-hidden="true">⌄</span>
          </button>
          <div className={`amount-value ${amount.length > 9 ? "amount-small" : ""}`}>
            {formatInput(amount)}
          </div>
        </div>

        <div className="exchange-divider">
          <span />
          <button
            className="swap-button"
            type="button"
            aria-label="두 통화 교환"
            onClick={() => {
              setTravel(home);
              setHome(travel);
              setAmount("");
              setPendingCalculation(null);
              setReplaceAmount(false);
            }}
          >
            ⇅
          </button>
          <span />
        </div>

        <div className="currency-row">
          <button className="currency-select" type="button" onClick={() => openPicker("home")}>
            <span className="currency-badge currency-badge-home" aria-hidden="true">{homeCurrency.symbol || homeCurrency.iso_code.slice(0, 1)}</span>
            <span className="currency-label">
              <strong>{homeCurrency.iso_code}</strong>
              <small>{currencyName(homeCurrency)}</small>
            </span>
            <span className="chevron" aria-hidden="true">⌄</span>
          </button>
          <div className="conversion-result">
            <strong>{formatMoney(converted, home)}</strong>
            <small>{rate ? `1 ${travel} ≈ ${formatRate(rate.rate, home)}` : "환율을 불러오는 중"}</small>
          </div>
        </div>
      </section>

      <div className={`rate-status ${!online || rateError ? "rate-stale" : ""}`} role="status">
        <span className="status-dot" aria-hidden="true" />
        {rateStatus}
      </div>

      <section className="keypad keypad-card" aria-label="숫자 패드">
        <div className="keypad-topline">
          <span>{pendingCalculation ? `${formatInput(String(pendingCalculation.value))} ${pendingCalculation.operator}` : "현지 가격"}</span>
        </div>
        <div className="key-grid">
          {KEYPAD.map((key) => (
            <button
              className={key === "÷" || key === "×" || key === "−" || key === "+" ? "operator-key" : key === "backspace" ? "delete-key" : ""}
              key={key}
              type="button"
              onClick={() => key === "÷" || key === "×" || key === "−" || key === "+" ? pressOperator(key) : pressKey(key)}
              disabled={(key === "backspace" || key === "÷" || key === "×" || key === "−" || key === "+") && !amount}
              aria-label={key === "." ? "소수점" : key === "backspace" ? "한 자리 삭제" : key}
            >
              {key === "backspace" ? "삭제" : key}
            </button>
          ))}
        </div>
      </section>

      {picker && (
        <div className="sheet-backdrop">
          <button className="sheet-dismiss" type="button" aria-label="통화 선택 닫기" onClick={() => setPicker(null)} />
          <section className="currency-sheet" role="dialog" aria-modal="true" aria-labelledby="picker-title">
            <div className="sheet-handle" aria-hidden="true" />
            <header>
              <div>
                <span>{picker === "travel" ? "여행지 통화" : "내 기준 통화"}</span>
                <h2 id="picker-title">어떤 통화를 사용할까요?</h2>
              </div>
              <button type="button" onClick={() => setPicker(null)} aria-label="닫기">×</button>
            </header>
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="통화 코드 또는 이름 검색"
                aria-label="통화 검색"
              />
            </label>
            <CurrencyList currencies={currencies} query={query} onSelect={(currency) => chooseCurrency(currency, picker)} />
          </section>
        </div>
      )}
    </main>
  );
}
