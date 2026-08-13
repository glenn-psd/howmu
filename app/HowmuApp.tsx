"use client";

/* eslint-disable @next/next/no-img-element -- Figma에서 내려받은 20px SVG 원본을 그대로 사용한다. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyKey,
  applyOperator,
  convertAmount,
  formatInput,
  isRateFresh,
  KEYPAD,
  type KeypadKey,
  type Operator,
} from "./calculator";
import {
  parseCurrencies,
  parsePreferences,
  parseRate,
  parseRateResponse,
  selectCurrencyPair,
  type Currency,
  type PickerTarget,
  type Rate,
} from "./howmu-data";

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

const POPULAR_CODES = ["THB", "JPY", "USD", "EUR", "VND", "TWD"];
const CURRENCY_NAMES: Record<string, string> = {
  EUR: "유로",
  JPY: "일본 엔",
  KRW: "대한민국 원",
  THB: "태국 바트",
  USD: "미국 달러",
};
const displayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["ko"], { type: "currency" })
    : null;

function currencyName(currency: Currency): string {
  if (CURRENCY_NAMES[currency.iso_code]) return CURRENCY_NAMES[currency.iso_code];
  const localized = displayNames?.of(currency.iso_code);
  return localized && localized !== currency.iso_code ? localized : currency.name;
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 저장소가 차단돼도 계산기는 메모리 상태로 계속 동작한다.
  }
}

function storageWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // Safari 비공개 모드나 저장 공간 부족에서도 앱을 중단하지 않는다.
  }
}

function safeRead(key: string): unknown {
  const raw = storageGet(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    storageRemove(key);
    return null;
  }
}

function rateKey(base: string, quote: string) {
  return `howmu:rate:${base}:${quote}`;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#000000" : "#f5f5f7");
}

function formatMoney(value: number | null, currency: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("ko-KR", {
    style: "decimal",
    maximumFractionDigits: currency === "KRW" ? 0 : 2,
  }).format(value);
}

function CurrencyOption({
  currency,
  selected = false,
  subtitle,
  onSelect,
}: {
  currency: Currency;
  selected?: boolean;
  subtitle?: string;
  onSelect: () => void;
}) {
  return (
    <button className={`currency-option ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <span className="currency-symbol" aria-hidden="true">
        {currency.iso_code.slice(0, 2)}
      </span>
      <span className="currency-copy">
        <strong>{currency.iso_code} · {currencyName(currency)}</strong>
        <small>{subtitle ?? currency.name}</small>
      </span>
      <span className="currency-row-icon" aria-hidden="true">
        <img className={selected ? "check-glyph" : "chevron-right-glyph"} src={selected ? "/icons/check.svg" : "/icons/chevron-right.svg"} alt="" />
      </span>
    </button>
  );
}

function currencySubtitle(code: string): string {
  return code === "THB" ? "태국 · ไทย"
    : code === "JPY" ? "일본 · 日本語"
      : code === "USD" ? "미국 · English"
        : code === "EUR" ? "유럽연합"
          : "";
}

function CurrencyList({
  currencies,
  query,
  selectedCode,
  onSelect,
}: {
  currencies: Currency[];
  query: string;
  selectedCode?: string;
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
    return source.slice(0, needle ? 80 : 4);
  }, [currencies, query]);

  if (!results.length) return <p className="empty-search">일치하는 통화를 찾지 못했어요.</p>;

  return (
    <div className="currency-list">
      {results.map((currency) => (
        <CurrencyOption
          key={currency.iso_code}
          currency={currency}
          selected={currency.iso_code === selectedCode}
          subtitle={currencySubtitle(currency.iso_code) || currency.name}
          onSelect={() => onSelect(currency)}
        />
      ))}
    </div>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="HOWMU 하무">
      <span>howmu</span><b>?</b>
    </div>
  );
}

function ExchangeMenu() {
  return (
    <div className="exchange-menu" aria-label="환율 계산기">
      <span>환율</span>
      <img src="/icons/chevron-up.svg" alt="" />
    </div>
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
  const [rateError, setRateError] = useState(false);
  const [rateAttempt, setRateAttempt] = useState(0);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [query, setQuery] = useState("");
  const [draftTravel, setDraftTravel] = useState("THB");
  const searchRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLElement | null>(null);
  const pickerOpenerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const cachedCurrencies = parseCurrencies(safeRead(CURRENCIES_KEY));
    const initialCurrencies = parseCurrencies([...cachedCurrencies, ...FALLBACK_CURRENCIES]);
    const preferences = parsePreferences(safeRead(PREFS_KEY), initialCurrencies.map((currency) => currency.iso_code));
    const savedTheme = storageGet(THEME_KEY);
    const initialTheme: Theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
    applyTheme(initialTheme);

    queueMicrotask(() => {
      setHome(preferences.home);
      setTravel(preferences.travel);
      if (cachedCurrencies.length) setCurrencies(initialCurrencies);
      setTheme(initialTheme);
      setReady(true);
    });

    let active = true;
    const controller = new AbortController();
    fetch(`${API}/currencies`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("currency request failed");
        return response.json();
      })
      .then((data: unknown) => {
        const next = parseCurrencies(data);
        if (active && next.length) {
          const merged = parseCurrencies([...next, ...FALLBACK_CURRENCIES]);
          setCurrencies(merged);
          storageWrite(CURRENCIES_KEY, merged);
        }
      })
      .catch(() => undefined);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!ready || !home || !travel) return;
    storageWrite(PREFS_KEY, { home, travel });
    let active = true;

    if (home === travel) {
      queueMicrotask(() => {
        if (!active) return;
        setRate({ base: travel, quote: home, rate: 1, date: new Date().toISOString().slice(0, 10), fetchedAt: Date.now() });
        setRateError(false);
      });
      return () => { active = false; };
    }

    const storageKey = rateKey(travel, home);
    const usableCache = parseRate(safeRead(storageKey), travel, home);
    queueMicrotask(() => {
      if (!active) return;
      setRate(usableCache);
      if (usableCache) setRateError(false);
    });

    if (usableCache && isRateFresh(usableCache.fetchedAt)) {
      return () => { active = false; };
    }

    const controller = new AbortController();

    fetch(`${API}/rate/${travel}/${home}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("rate request failed");
        return response.json();
      })
      .then((data: unknown) => {
        const next = parseRateResponse(data, travel, home);
        if (!next) throw new Error("invalid rate response");
        if (!active) return;
        setRate(next);
        setRateError(false);
        storageWrite(storageKey, next);
      })
      .catch((error: unknown) => {
        if (active && !(error && typeof error === "object" && "name" in error && error.name === "AbortError")) {
          setRateError(true);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [home, rateAttempt, ready, travel]);

  useEffect(() => {
    if (!picker) return;
    const opener = pickerOpenerRef.current;
    requestAnimationFrame(() => searchRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPicker(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        pickerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      opener?.focus();
    };
  }, [picker]);

  const homeCurrency = currencies.find((currency) => currency.iso_code === home) ?? { iso_code: home, name: home };
  const travelCurrency = currencies.find((currency) => currency.iso_code === travel) ?? { iso_code: travel, name: travel };
  const currentRate = rate?.base === travel && rate.quote === home ? rate : null;
  const converted = convertAmount(amount, currentRate?.rate ?? null);

  const chooseCurrency = (currency: Currency, target: PickerTarget) => {
    const next = selectCurrencyPair(home, travel, currency.iso_code, target);
    setHome(next.home);
    setTravel(next.travel);
    setRate(null);
    setRateError(false);
    setPicker(null);
    setQuery("");
    setAmount("");
    setPendingCalculation(null);
    setReplaceAmount(false);
  };

  const openPicker = (target: PickerTarget) => {
    pickerOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    setAmount(result);
    setPendingCalculation({ value: Number(result), operator });
    setReplaceAmount(true);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    storageWrite(THEME_KEY, next);
    setTheme(next);
  };

  const retryRate = () => {
    setRateAttempt((current) => current + 1);
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
    const draftCurrency = currencies.find((currency) => currency.iso_code === draftTravel);
    return (
      <main className="app-shell setup-shell">
        <div className="setup-content">
          <section className="setup-intro">
            <h1>여행지 통화를<br />선택하세요</h1>
            <p>가격표에 표시된 통화를 고르면<br />원화로 바로 계산해드려요.</p>
          </section>

          <section className="setup-section">
            <h2 className="list-title">내 기준 통화</h2>
            <div className="currency-option fixed" aria-label="KRW 대한민국 원, 기본 통화">
              <span className="currency-symbol" aria-hidden="true">KR</span>
              <span className="currency-copy"><strong>KRW · 대한민국 원</strong><small>기본 통화</small></span>
              <img className="currency-row-icon" src="/icons/chevron-right.svg" alt="" />
            </div>
          </section>

          <section className="setup-section travel-section">
            <h2 className="list-title">여행지 통화</h2>
            <label className="search-box setup-search">
              <img src="/icons/search.svg" alt="" />
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="국가 또는 통화 검색" aria-label="여행지 통화 검색" />
            </label>
            {query ? (
              <CurrencyList currencies={currencies.filter((currency) => currency.iso_code !== home)} query={query} selectedCode={draftTravel} onSelect={(currency) => {
                setDraftTravel(currency.iso_code);
                setQuery("");
              }} />
            ) : draftCurrency ? (
              <CurrencyOption currency={draftCurrency} selected subtitle={currencySubtitle(draftCurrency.iso_code) || draftCurrency.name} onSelect={() => searchRef.current?.focus()} />
            ) : null}
          </section>
        </div>

        <button
          className="setup-submit"
          type="button"
          disabled={!draftCurrency || draftCurrency.iso_code === home}
          onClick={() => draftCurrency && chooseCurrency(draftCurrency, "travel")}
        >계산기 시작하기</button>
      </main>
    );
  }

  if (!currentRate && rateError) {
    return (
      <main className="app-shell network-shell">
        <div className="network-pill">환율 업데이트 대기</div>
        <h1>인터넷 연결이<br />필요해요</h1>
        <p className="network-description">첫 환율을 받으려면 한 번만 연결해 주세요.<br />이후에는 저장된 환율로 계산할 수 있어요.</p>
        <section className="network-checklist">
          <strong>확인할 사항</strong>
          <p>Wi-Fi 또는 셀룰러 연결<br />날짜 및 시간 설정<br />잠시 후 다시 시도</p>
        </section>
        <p className="network-support">계속 문제가 발생하면 앱을 닫았다가 다시 열어주세요.</p>
        <button className="network-retry" type="button" onClick={retryRate}>다시 시도</button>
      </main>
    );
  }

  return (
    <main className="app-shell product-shell">
      <div className="screen-content" inert={picker ? true : undefined} aria-hidden={picker ? true : undefined}>
        <header className="product-header">
          <ExchangeMenu />
          <button className="theme-button" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}>
            <img src="/icons/sun.svg" alt="" />
          </button>
        </header>

        <section className="exchange-card" aria-label="통화 설정">
              <div className="currency-row">
                <button className="currency-select" type="button" onClick={() => openPicker("travel")}>
                  <span className={`currency-badge ${travel === "THB" ? "" : "currency-badge-code"}`} aria-hidden="true">
                    {travel === "THB" ? <img src="/icons/flag-th.svg" alt="" /> : travel.slice(0, 2)}
                  </span>
                  <span className="currency-label"><strong>{travelCurrency.iso_code}</strong></span>
                  <span className="chevron" aria-hidden="true"><img src="/icons/chevron-down.svg" alt="" /></span>
                </button>
                <div className={`amount-value ${amount.length > 9 ? "amount-small" : ""}`}>{formatInput(amount)}</div>
              </div>

              <div className="currency-row">
                <button className="currency-select" type="button" onClick={() => openPicker("home")}>
                  <span className={`currency-badge ${home === "KRW" ? "" : "currency-badge-code"}`} aria-hidden="true">
                    {home === "KRW" ? <img src="/icons/flag-kr.svg" alt="" /> : home.slice(0, 2)}
                  </span>
                  <span className="currency-label"><strong>{homeCurrency.iso_code}</strong></span>
                  <span className="chevron" aria-hidden="true"><img src="/icons/chevron-down.svg" alt="" /></span>
                </button>
                <div className="conversion-result" aria-live="polite" aria-atomic="true">
                  <strong>{formatMoney(converted, home)}</strong>
                </div>
              </div>
        </section>

        <section className="keypad-card" aria-label="숫자 패드">
              <div className="key-grid">
                {KEYPAD.map((key) => {
                  const disabled = (key === "backspace" || key === "÷" || key === "×" || key === "−" || key === "+") && !amount;
                  return (
                  <button
                    className={`${key === "÷" || key === "×" || key === "−" || key === "+" ? "operator-key" : key === "backspace" ? "delete-key" : ""} ${disabled ? "key-disabled" : ""}`}
                    key={key}
                    type="button"
                    onClick={() => key === "÷" || key === "×" || key === "−" || key === "+" ? pressOperator(key) : pressKey(key)}
                    disabled={disabled}
                    aria-label={key === "." ? "소수점" : key === "backspace" ? "한 자리 삭제" : key}
                  >{key === "backspace" ? "삭제" : key}</button>
                  );
                })}
              </div>
        </section>
      </div>

      {picker && (
        <section ref={pickerRef} className="picker-screen" role="dialog" aria-modal="true" aria-labelledby="picker-title">
          <header className="picker-header">
            <button type="button" onClick={() => setPicker(null)} aria-label="통화 선택 닫기">‹</button>
          </header>
          <h2 id="picker-title">{picker === "travel" ? "여행지 통화" : "내 기준 통화"}</h2>
          <label className="search-box">
            <img src="/icons/search.svg" alt="" />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="국가 또는 통화 검색" aria-label="통화 검색" />
          </label>
          <h3 className="list-title">{query ? "검색 결과" : "많이 찾는 통화"}</h3>
          <CurrencyList currencies={currencies} query={query} selectedCode={picker === "travel" ? travel : home} onSelect={(currency) => chooseCurrency(currency, picker)} />
        </section>
      )}

    </main>
  );
}
