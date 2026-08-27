import { describe, expect, it } from "vitest";
import { GenericValueProvider } from "./genericValueProvider.js";

describe("GenericValueProvider", () => {
  it("returns ranked values and a neutral baseline for unknown players", async () => {
    const vp = new GenericValueProvider({ p1: 95, p2: 30 });
    expect(await vp.getValue("p1")).toBe(95);
    expect(await vp.getValue("unknown")).toBe(GenericValueProvider.NEUTRAL);

    const map = await vp.getValues(["p1", "p2", "unknown"]);
    expect(map.get("p1")).toBe(95);
    expect(map.get("unknown")).toBe(GenericValueProvider.NEUTRAL);
  });
});
