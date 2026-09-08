import { describe, expect, it } from "vitest";
import { scrollSection } from "./scrollSection";

describe("combined team navigation", () => {
  const sections = [
    { name: "My Team", top: -600 },
    { name: "Standings", top: 130 },
    { name: "Matchups", top: 500 },
  ];
  it("highlights the section crossing the sticky navigation", () => {
    expect(scrollSection(sections, 146, 700, 800, 2000)).toBe("Standings");
  });
  it("highlights a short final section at the bottom even when it cannot reach the header", () => {
    expect(scrollSection(sections, 146, 1200, 800, 2000)).toBe("Matchups");
  });
  it("returns to My Team when scrolling upward above standings", () => {
    expect(
      scrollSection(
        sections.map((s) => ({ ...s, top: s.top + 100 })),
        146,
        600,
        800,
        2000,
      ),
    ).toBe("My Team");
  });
  it("does not jump to Matchups on a short initial or loading page", () => {
    expect(scrollSection(sections, 100, 0, 800, 800)).toBe("My Team");
  });
  it("handles missing sections while changing pages", () => {
    expect(scrollSection([], 100, 0, 800, 800)).toBeUndefined();
  });
});
