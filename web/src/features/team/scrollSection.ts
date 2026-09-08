/** Pick the last section above the sticky navigation, including a short final section. */
export function scrollSection<T extends string>(
  sections: readonly { name: T; top: number }[],
  line: number,
  scrollY: number,
  viewportHeight: number,
  documentHeight: number,
): T | undefined {
  if (!sections.length) return undefined;
  // The final section may never reach the navigation line before scrolling ends.
  if (scrollY > 0 && scrollY + viewportHeight >= documentHeight - 2)
    return sections[sections.length - 1].name;
  let active = sections[0].name;
  for (const section of sections)
    if (section.top <= line) active = section.name;
  return active;
}
