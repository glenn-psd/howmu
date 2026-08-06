import assert from "node:assert/strict";
import test from "node:test";
import { applyKey, applyOperator, convertAmount, isRateFresh } from "../app/calculator.ts";

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
  assert.equal(applyKey("", "00"), "0");
  assert.equal(applyKey("0", "4"), "4");
  assert.equal(applyKey("430", "."), "430.");
  assert.equal(applyKey("430.12", "3"), "430.12");
  assert.equal(applyKey("123456789012", "3"), "123456789012");
  assert.equal(applyKey("430", "backspace"), "43");
  assert.equal(applyKey("430", "clear"), "");
  assert.equal(convertAmount("430", 41.25), 17737.5);
  assert.equal(convertAmount("", 41.25), null);
  assert.equal(applyOperator(100, 20, "+"), "120");
  assert.equal(applyOperator(100, 20, "−"), "80");
  assert.equal(applyOperator(12, 3, "×"), "36");
  assert.equal(applyOperator(10, 4, "÷"), "2.5");
  assert.equal(applyOperator(10, 0, "÷"), null);
});

test("환율은 6시간 동안 최신으로 취급한다", () => {
  const now = Date.now();
  assert.equal(isRateFresh(now - 5 * 60 * 60 * 1000, now), true);
  assert.equal(isRateFresh(now - 7 * 60 * 60 * 1000, now), false);
});
