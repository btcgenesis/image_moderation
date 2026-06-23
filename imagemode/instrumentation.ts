// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const util = require("util");
    Object.defineProperty(util, "isNullOrUndefined", {
      value: (v: unknown) => v === null || v === undefined,
      writable: true,
      configurable: true,
    });
    await import("@tensorflow/tfjs-node");
  }
}