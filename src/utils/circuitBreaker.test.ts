import { describe, expect, it, beforeEach } from "vitest";
import {
  _resetCircuitBreakerForTests,
  getCircuitFailureCount,
  isCircuitOpen,
  resetCircuitBreaker,
  shouldSkipBlockingNetworkRead,
  tripCircuitBreaker,
} from "./circuitBreaker";

describe("circuitBreaker", () => {
  beforeEach(() => {
    _resetCircuitBreakerForTests();
  });

  it("starts closed", () => {
    expect(isCircuitOpen()).toBe(false);
    expect(shouldSkipBlockingNetworkRead()).toBe(false);
  });

  it("opens after trip and resets on success", () => {
    tripCircuitBreaker();
    expect(isCircuitOpen()).toBe(true);
    // Reads no longer fast-bail on circuit alone — radio-up reads keep trying.
    expect(shouldSkipBlockingNetworkRead()).toBe(false);
    resetCircuitBreaker();
    expect(isCircuitOpen()).toBe(false);
  });

  it("increments failure count once per trip call", () => {
    tripCircuitBreaker();
    expect(getCircuitFailureCount()).toBe(1);
    tripCircuitBreaker();
    expect(getCircuitFailureCount()).toBe(2);
  });
});
