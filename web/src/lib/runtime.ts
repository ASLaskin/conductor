import { ManagedRuntime } from "effect";
import { ApiClientLive } from "./ApiClient";

// one runtime for the lifetime of the SPA. components run programs against
// it via the useEffectRunner hook.
export const runtime = ManagedRuntime.make(ApiClientLive);
