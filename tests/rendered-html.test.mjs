import assert from "node:assert/strict";
import test from "node:test";
import { applyKey, applyOperator, convertAmount, formatInput, isRateFresh, KEYPAD, RATE_TTL_MS } from "../app/calculator.ts";
import {
  isCurrencyCode,
  parseCurrencies,
  parsePreferences,
  parseRate,
  parseRateResponse,
  selectCurrencyPair,
} from "../app/howmu-data.ts";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("HOWMU 첫 화면을 서버 렌더링한다", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>HOWMU 하무 – 해외여행 현지 가격 확인<\/title>/i);
  assert.match(html, /howmu/);
  assert.match(html, /불러오는 중/);
  assert.match(html, /howmu:theme/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("숫자 입력 규칙과 즉시 환산이 안정적이다", () => {
  assert.deepEqual(KEYPAD, [
    "1", "2", "3", "÷",
    "4", "5", "6", "×",
    "7", "8", "9", "−",
    ".", "0", "backspace", "+",
  ]);
  assert.equal(applyKey("", "00"), "0");
  assert.equal(applyKey("0", "4"), "4");
  assert.equal(applyKey("430", "."), "430.");
  assert.equal(applyKey("430.", "."), "430.");
  assert.equal(applyKey("430.12", "3"), "430.12");
  assert.equal(applyKey("430.1", "2"), "430.12");
  assert.equal(applyKey("123456789012", "3"), "123456789012");
  assert.equal(applyKey("430", "backspace"), "43");
  assert.equal(applyKey("430", "clear"), "");
  assert.equal(convertAmount("430", 41.25), 17737.5);
  assert.equal(convertAmount("", 41.25), null);
  assert.equal(convertAmount("430", null), null);
  assert.equal(formatInput("1234567.8"), "1,234,567.8");
  assert.equal(applyOperator(100, 20, "+"), "120");
  assert.equal(applyOperator(100, 20, "−"), "80");
  assert.equal(applyOperator(12, 3, "×"), "36");
  assert.equal(applyOperator(10, 4, "÷"), "2.5");
  assert.equal(applyOperator(10, 0, "÷"), null);
  assert.equal(applyOperator(10, 20, "−"), null);
});

test("환율은 6시간 동안 최신으로 취급한다", () => {
  const now = Date.now();
  assert.equal(isRateFresh(now - 5 * 60 * 60 * 1000, now), true);
  assert.equal(isRateFresh(now - 7 * 60 * 60 * 1000, now), false);
  assert.equal(isRateFresh(now - RATE_TTL_MS, now), false);
  assert.equal(isRateFresh(now + 1, now), false);
  assert.equal(isRateFresh(Number.NaN, now), false);
});

test("손상된 설정과 통화 캐시는 안전한 값만 사용한다", () => {
  assert.equal(isCurrencyCode("KRW"), true);
  assert.equal(isCurrencyCode("krw"), false);
  assert.deepEqual(parsePreferences(null), { home: "KRW", travel: "" });
  assert.deepEqual(parsePreferences({ home: 7, travel: "THB" }), { home: "KRW", travel: "THB" });
  assert.deepEqual(parsePreferences({ home: "KRW", travel: "KRW" }), { home: "KRW", travel: "" });
  assert.deepEqual(parsePreferences({ home: "BAD!", travel: [] }), { home: "KRW", travel: "" });
  assert.deepEqual(parsePreferences({ home: "AAA", travel: "BBB" }, ["KRW", "THB"]), { home: "KRW", travel: "" });

  assert.deepEqual(parseCurrencies([null, {}, { iso_code: "usd", name: "Dollar" }]), []);
  assert.deepEqual(parseCurrencies([
    { iso_code: "THB", name: " Thai Baht ", symbol: "฿" },
    { iso_code: "THB", name: "duplicate" },
    { iso_code: "JPY", name: "Japanese Yen" },
  ]), [
    { iso_code: "THB", name: "Thai Baht", symbol: "฿" },
    { iso_code: "JPY", name: "Japanese Yen" },
  ]);
});

test("환율 캐시와 API 응답은 통화쌍과 값 형식을 검증한다", () => {
  const fetchedAt = 1_800_000_000_000;
  const valid = { base: "THB", quote: "KRW", rate: 42.5, date: "2026-08-13", fetchedAt };
  assert.deepEqual(parseRate(valid, "THB", "KRW"), valid);
  assert.equal(parseRate(valid, "JPY", "KRW"), null);
  assert.equal(parseRate({ ...valid, rate: 0 }, "THB", "KRW"), null);
  assert.equal(parseRate({ ...valid, fetchedAt: Number.NaN }, "THB", "KRW"), null);
  assert.equal(parseRate({ ...valid, date: "today" }, "THB", "KRW"), null);
  assert.equal(parseRate({ ...valid, date: "2026-99-99" }, "THB", "KRW"), null);
  assert.equal(parseRate({ ...valid, date: "2026-02-31" }, "THB", "KRW"), null);
  assert.deepEqual(
    parseRateResponse({ base: "THB", quote: "KRW", rate: 42.5, date: "2026-08-13" }, "THB", "KRW", fetchedAt),
    valid,
  );
  assert.equal(parseRateResponse({ base: "THB", quote: "USD", rate: 1, date: "2026-08-13" }, "THB", "KRW", fetchedAt), null);
});

test("통화 변경은 같은 통화 선택 시 교환하고 다른 통화는 대상만 바꾼다", () => {
  assert.deepEqual(selectCurrencyPair("KRW", "THB", "JPY", "travel"), { home: "KRW", travel: "JPY" });
  assert.deepEqual(selectCurrencyPair("KRW", "THB", "KRW", "travel"), { home: "THB", travel: "KRW" });
  assert.deepEqual(selectCurrencyPair("KRW", "", "KRW", "travel"), { home: "KRW", travel: "" });
  assert.deepEqual(selectCurrencyPair("KRW", "THB", "USD", "home"), { home: "USD", travel: "THB" });
  assert.deepEqual(selectCurrencyPair("KRW", "THB", "THB", "home"), { home: "THB", travel: "KRW" });
});
