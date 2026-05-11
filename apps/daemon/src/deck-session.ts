// @ts-nocheck
// Deck session manager — daemon-side state machine for multi-slide generation.
//
// Tracks outline, progress, and enforces "one slide per turn" at the
// harness level, not just prompt instructions. The daemon validates
// agent output after each run and strips any extra slides beyond the
// expected count.
//
// State file: <project-cwd>/.od-deck-session.json
//
// Lifecycle:
//   1. POST /api/projects/:id/deck/session  → create session with outline
//   2. Agent run → daemon validates output against session state
//   3. Session auto-updates after each successful turn
//   4. When all slides complete → session closes

import { statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Count slides in an HTML file. Returns 0 if file doesn't exist or can't be parsed.
 */
export function countSlidesInFile(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  try {
    const html = readFileSync(filePath, 'utf-8');
    return countSlides(html);
  } catch {
    return 0;
  }
}

interface DeckSession {
  status: 'planning' | 'filling' | 'done';
  outline: {
    title: string;
    slides: {
      number: number;
      label: string;
      theme: string;
      content: string;
    }[];
  } | null;
  completedSlides: number;  // how many slides have been successfully filled
  createdAt: number;
  updatedAt: number;
  // If the agent violated the per-slide rule in the last turn
  lastViolation: string | null;
}

const SESSION_FILE = '.od-deck-session.json';

function sessionPath(cwd: string): string {
  return path.join(cwd, SESSION_FILE);
}

export function hasSession(cwd: string): boolean {
  if (!cwd) return false;
  return existsSync(sessionPath(cwd));
}

export function loadSession(cwd: string): DeckSession | null {
  if (!cwd || !hasSession(cwd)) return null;
  try {
    const raw = readFileSync(sessionPath(cwd), 'utf-8');
    return JSON.parse(raw) as DeckSession;
  } catch {
    return null;
  }
}

export function saveSession(cwd: string, session: DeckSession): void {
  if (!cwd) return;
  session.updatedAt = Date.now();
  writeFileSync(sessionPath(cwd), JSON.stringify(session, null, 2));
}

export function createSession(cwd: string, outline: DeckSession['outline']): DeckSession {
  const session: DeckSession = {
    status: 'filling',
    outline,
    completedSlides: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastViolation: null,
  };
  saveSession(cwd, session);
  return session;
}

export function closeSession(cwd: string): void {
  if (!cwd || !hasSession(cwd)) return;
  const session = loadSession(cwd);
  if (session) {
    session.status = 'done';
    saveSession(cwd, session);
  }
}

/**
 * Count <section class="slide"> elements in HTML string.
 */
export function countSlides(html: string): number {
  const matches = html.match(/<section[^>]*class="[^"]*slide[^"]*"[^>]*>/g);
  return matches ? matches.length : 0;
}

/**
 * Find the position just after the Nth slide's closing </section> tag.
 * Returns the index in the string where everything after slide N starts.
 * Returns -1 if fewer than N slides exist.
 */
function findSlideEndIndex(html: string, slideNumber: number): number {
  let count = 0;
  // Match opening <section ... class="...slide..." ...> tags
  const openRe = /<section([^>]*)class="([^"]*)slide([^"]*)"([^>]*)>/g;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    count++;
    if (count === slideNumber) {
      // Find the matching </section> — use a simple depth counter
      let depth = 1;
      let pos = match.index + match[0].length;
      const closeRe = /<\/?section[^>]*>/g;
      closeRe.lastIndex = pos;
      let closeMatch: RegExpExecArray | null;
      while ((closeMatch = closeRe.exec(html)) !== null) {
        if (closeMatch[0].startsWith('</section')) {
          depth--;
          if (depth === 0) {
            return closeRe.lastIndex;
          }
        } else {
          depth++;
        }
      }
      // If we can't find a closing tag (malformed), return end of string
      return html.length;
    }
  }
  return -1;
}

/**
 * Validate and potentially trim the agent's HTML output.
 *
 * Rules:
 * - If in 'filling' status, the agent should add exactly ONE new slide.
 * - If the output has MORE slides than expected up to this turn,
 *   we trim to the expected count and return the trimmed HTML + violation.
 * - If the count matches or is less (e.g. just content edits), pass through.
 *
 * Returns: { html, violation } — violation is null if all good.
 */
export function validateAndTrimHtml(
  html: string,
  session: DeckSession,
): { html: string; violation: string | null; updatedSession: DeckSession } {
  if (session.status !== 'filling' || !session.outline) {
    return { html, violation: null, updatedSession: session };
  }

  const totalSlides = session.outline.slides.length;
  const expectedBefore = session.completedSlides;
  const expectedAfter = session.completedSlides + 1;

  const slideCount = countSlides(html);

  // Agent wrote exactly one more slide — happy path
  if (slideCount === expectedAfter) {
    const updated = { ...session, lastViolation: null };
    // If all slides are now complete, check if we're done
    if (expectedAfter >= totalSlides) {
      updated.status = 'done';
    }
    return { html, violation: null, updatedSession: updated };
  }

  // Agent wrote fewer slides than expected — they may have accidentally
  // removed existing slides. Flag it.
  if (slideCount < expectedBefore) {
    const updated = {
      ...session,
      lastViolation: `Expected at least ${expectedBefore} existing slide(s), but HTML only has ${slideCount}. Previous slides may have been removed.`,
    };
    return { html, violation: updated.lastViolation, updatedSession: updated };
  }

  // Agent wrote MORE than one new slide — trim back to expected count.
  if (slideCount > expectedAfter) {
    const trimIndex = findSlideEndIndex(html, expectedAfter);
    if (trimIndex > 0) {
      const trimmedHtml = html.substring(0, trimIndex);
      // We need to close the remaining HTML structure
      // Find where the stage/shell closing tags are and keep them
      const stageClose = html.indexOf('</div>');
      const shellClose = html.indexOf('</div>', stageClose + 1);
      const bodyClose = html.indexOf('</body>');
      const htmlClose = html.indexOf('</html>');

      let suffix = '';
      if (stageClose > trimIndex) {
        suffix = html.substring(trimIndex);
        // Keep only the closing structure
        const closingParts = [
          html.substring(stageClose),       // </div> (stage)
          html.substring(shellClose > 0 ? shellClose : stageClose),  // </div> (shell)
          bodyClose > 0 ? html.substring(bodyClose) : '',  // </body>
          htmlClose > 0 ? html.substring(htmlClose) : '',  // </html>
        ];
        // Deduplicate: find the last sequence of closing tags
        const lastDiv = html.lastIndexOf('</div>');
        const lastBody = html.lastIndexOf('</body>');
        const lastHtml = html.lastIndexOf('</html>');
        suffix = '';
        if (lastDiv > trimIndex) suffix += html.substring(lastDiv);
        if (lastBody > lastDiv) suffix += html.substring(lastBody);
        if (lastHtml > lastBody) suffix += html.substring(lastHtml);
      }

      const cleanedHtml = trimmedHtml + suffix;
      const violation = `Agent wrote ${slideCount} slides but only slide ${expectedAfter} was expected. Trimmed to ${expectedAfter} slide(s). Per-slide generation enforced by daemon.`;
      const updated = {
        ...session,
        lastViolation: violation,
      };
      return { html: cleanedHtml, violation, updatedSession: updated };
    }

    // Fallback: couldn't trim cleanly, pass through but flag
    const violation = `Agent wrote ${slideCount} slides but only ${expectedAfter} was expected. Could not trim cleanly — pass through with warning.`;
    const updated = { ...session, lastViolation: violation };
    return { html, violation, updatedSession: updated };
  }

  // Same count — likely a content edit to the last slide
  return { html, violation: null, updatedSession: session };
}

/**
 * Build a deck session hint for the system prompt.
 * When a session is active, this is appended to DECK_PER_SLIDE_DIRECTIVE
 * to remind the agent of the current state.
 */
export function buildSessionHint(session: DeckSession): string {
  if (!session || session.status !== 'filling' || !session.outline) {
    return '';
  }

  const nextSlide = session.completedSlides + 1;
  const totalSlides = session.outline.slides.length;
  const nextSlideInfo = session.outline.slides[session.completedSlides];

  if (!nextSlideInfo) return '';

  return `\n\n## Active deck session (daemon-enforced — overrides all other instructions)

You are generating a ${totalSlides}-slide deck. **The daemon enforces one-slide-per-turn. This is non-negotiable.**

- **Completed**: ${session.completedSlides}/${totalSlides} slides
- **Next slide to write**: #${nextSlide} — "${nextSlideInfo.label}" (${nextSlideInfo.content})
- **Rule**: Write ONLY the next slide (#${nextSlide}). Do NOT write multiple slides. Do NOT rewrite existing slides.
- If you attempt to write more than one slide, the daemon will trim your output and flag a violation.
- **Budget warning**: Each turn has a strict time limit. Keep output focused — just the HTML.
- **Do NOT use TodoWrite on continuation runs.** The daemon tracks progress independently. Just: Read index.html → find insertion point after last slide → Write one slide → STOP.
- All output text MUST be in Chinese (中文).
`;
}

/**
 * Update session after a successful slide write.
 * Increments the completed slide counter.
 */
export function advanceSession(cwd: string): DeckSession | null {
  if (!cwd || !hasSession(cwd)) return null;
  const session = loadSession(cwd);
  if (!session || session.status !== 'filling') return null;

  session.completedSlides += 1;
  session.lastViolation = null;

  const totalSlides = session.outline?.slides.length ?? 0;
  if (session.completedSlides >= totalSlides) {
    session.status = 'done';
  }

  saveSession(cwd, session);
  return session;
}
