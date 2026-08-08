import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Finds the Chromium this machine already has.
 *
 * CI images commonly ship a pinned Playwright browser build that does not match
 * the revision the installed @playwright/test wants. Resolving the binary here
 * lets the suite run against whatever is present instead of failing with a
 * "run npx playwright install" wall of text. Returns undefined when nothing is
 * pre-installed, in which case Playwright falls back to its own lookup.
 */
export function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;

  const candidates = readdirSync(root)
    // Prefer the full browser over the headless shell: it supports the whole
    // surface, including anything media-related we may want to exercise later.
    .filter((entry) => entry.startsWith('chromium-'))
    .map((entry) => join(root, entry, 'chrome-linux', 'chrome'))
    .concat(
      readdirSync(root)
        .filter((entry) => entry.startsWith('chromium_headless_shell-'))
        .map((entry) => join(root, entry, 'chrome-linux', 'headless_shell')),
    );

  return candidates.find((path) => existsSync(path));
}
