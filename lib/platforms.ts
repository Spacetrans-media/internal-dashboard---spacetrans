/**
 * Human labels for the page title and source note.
 *
 * The title is derived from the accounts that actually exist rather than
 * hardcoded, so the day a Google account is connected the page stops claiming
 * to be Meta-only on its own — nobody has to remember to edit a string, and a
 * screenshot can never misstate what it includes.
 */
const LABELS: Record<string, string> = {
  META: "Meta",
  GOOGLE: "Google Ads",
};

/**
 * Platform identity colours — categorical slots 1 and 2 of the validated
 * palette. Checked with the palette validator rather than picked by eye:
 * CVD separation ΔE 24.7 against a target of 8, normal-vision 33.6 against a
 * floor of 15, both ≥3:1 against the surface.
 *
 * Colour follows the PLATFORM, never a row's rank or a measure, so filtering
 * to one account never repaints the survivors.
 */
export const PLATFORM_COLORS: Record<string, string> = {
  META: "#2a78d6",
  GOOGLE: "#eb6834",
};

export const platformColor = (p: string) => PLATFORM_COLORS[p] ?? "#8a8a85";

/** Matching Tailwind classes for badges and chips, kept in step with the hexes. */
export const PLATFORM_CHIP: Record<string, string> = {
  META: "bg-blue-50 text-blue-700",
  GOOGLE: "bg-orange-50 text-orange-700",
};

export const platformLabel = (p: string) => LABELS[p] ?? p;

export function spendTitle(platforms: string[]): string {
  if (platforms.length === 1) return `${platformLabel(platforms[0])} ad spend`;
  return "Ad spend";
}

export function sourceNote(platforms: string[]): string {
  const present = platforms.map(platformLabel);
  const missing = Object.keys(LABELS)
    .filter((p) => !platforms.includes(p))
    .map(platformLabel);

  const from = present.length ? `Source: ${present.join(" + ")}.` : "No ad accounts connected.";
  // Naming what is absent matters more than naming what is present: a total
  // that quietly omits a platform is the kind of number that reaches a meeting.
  const not = missing.length ? ` ${missing.join(" and ")} not included.` : "";
  return from + not;
}
