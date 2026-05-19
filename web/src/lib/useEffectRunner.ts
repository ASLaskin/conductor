import { Effect, Exit, Fiber } from "effect";
import { useCallback, useEffect, useRef } from "react";
import { runtime } from "./runtime";
import type { ApiClient } from "./ApiClient";

// runs an Effect against the app runtime and returns its Exit. fibers are
// tracked so a component unmount interrupts in-flight effects.
export function useEffectRunner() {
  const fibers = useRef(new Set<Fiber.RuntimeFiber<unknown, unknown>>());

  useEffect(
    () => () => {
      for (const fiber of fibers.current) runtime.runFork(Fiber.interrupt(fiber));
      fibers.current.clear();
    },
    [],
  );

  return useCallback(
    <A, E>(
      effect: Effect.Effect<A, E, ApiClient>,
    ): Promise<Exit.Exit<A, E>> => {
      const fiber = runtime.runFork(effect);
      fibers.current.add(fiber as Fiber.RuntimeFiber<unknown, unknown>);
      return new Promise((resolve) => {
        fiber.addObserver((exit) => {
          fibers.current.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>);
          resolve(exit);
        });
      });
    },
    [],
  );
}
