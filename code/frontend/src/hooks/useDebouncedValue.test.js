import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test("returns the initial value immediately", () => {
  const { result } = renderHook(() => useDebouncedValue("a", 300));
  expect(result.current).toBe("a");
});

test("does not update until the delay has passed", () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
    initialProps: { value: "a" },
  });

  rerender({ value: "b" });
  expect(result.current).toBe("a");

  act(() => {
    vi.advanceTimersByTime(299);
  });
  expect(result.current).toBe("a");

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(result.current).toBe("b");
});

test("resets the timer on rapid successive changes", () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
    initialProps: { value: "a" },
  });

  rerender({ value: "b" });
  act(() => {
    vi.advanceTimersByTime(200);
  });
  rerender({ value: "c" });
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(result.current).toBe("a");

  act(() => {
    vi.advanceTimersByTime(100);
  });
  expect(result.current).toBe("c");
});
