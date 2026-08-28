import { describe, expect, it } from "vitest";
import type { ValueProvider } from "./ValueProvider.js";
import { DstOverlayValueProvider, dstValueMap } from "./dst.js";

describe("DST value overlay", () => {
  const dst = dstValueMap({ order: ["DEN", "PHI", "BAL", "CAR"] });
  const base: ValueProvider = {
    getValue: async (id) => (id === "wr1" ? 9000 : 0),
    getValues: async (ids) => new Map(ids.map((id) => [id, id === "wr1" ? 9000 : 0])),
  };
  const vp = new DstOverlayValueProvider(base, dst);

  it("ranks defenses by tier and defers non-DEF to the base", async () => {
    const v = await vp.getValues(["DEN", "PHI", "CAR", "wr1", "unknown"]);
    expect(v.get("DEN")!).toBeGreaterThan(v.get("PHI")!); // #1 defense beats #2
    expect(v.get("PHI")!).toBeGreaterThan(v.get("CAR")!); // #2 beats last
    expect(v.get("CAR")!).toBeGreaterThan(0); // worst defense still visible/ranked
    expect(v.get("wr1")).toBe(9000); // non-DEF deferred to base
    expect(v.get("unknown")).toBe(0);
  });
});
