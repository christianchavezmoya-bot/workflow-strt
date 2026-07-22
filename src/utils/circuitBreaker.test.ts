import { describe, expect, it, beforeEach } from "vitest";
import {
  _resetCircuitBreakerForTests,
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
    expect(shouldSkipBlockingNetworkRead()).toBe(true);
    resetCircuitBreaker();
    expect(isCircuitOpen()).toBe(false);
  });
});
