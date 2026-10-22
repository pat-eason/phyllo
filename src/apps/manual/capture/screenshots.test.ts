import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCREENSHOT_DIR } from "./harness";

// Keeps the pages and the generated screenshots in step: every image a page shows exists, every captured image is
// shown somewhere, and every image has alt text.

const DOCS = path.resolve(SCREENSHOT_DIR, "../..");
const IMAGE = /!\[([^\]]*)\]\(\/screenshots\/([^)\s]+\.png)\)/g;

function pages(dir: string = DOCS): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || entry.name === "public") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return pages(full);
    return entry.name.endsWith(".md") ? [full] : [];
  });
}

function references(): { page: string; alt: string; file: string }[] {
  return pages().flatMap((page) =>
    [...readFileSync(page, "utf8").matchAll(IMAGE)].map((match) => ({
      page: path.relative(DOCS, page),
      alt: match[1] ?? "",
      file: match[2] ?? "",
    })),
  );
}

const captured = () => readdirSync(SCREENSHOT_DIR).filter((name) => name.endsWith(".png"));

describe("manual screenshots", () => {
  it("should have a captured file for every screenshot a page shows", () => {
    // Arrange
    const files = new Set(captured());

    // Act
    const missing = references()
      .filter((ref) => !files.has(ref.file))
      .map((ref) => `${ref.page} → ${ref.file}`);

    // Assert
    expect(missing).toEqual([]);
  });

  it("should show every captured screenshot on some page", () => {
    // Arrange
    const shown = new Set(references().map((ref) => ref.file));

    // Act
    const unused = captured().filter((file) => !shown.has(file));

    // Assert
    expect(unused).toEqual([]);
  });

  it("should leave a blank line after every closing wrapper div so the next block still renders as markdown", () => {
    // Arrange
    const sources = pages().map((page) => ({ page: path.relative(DOCS, page), text: readFileSync(page, "utf8") }));

    // Act
    const glued = sources
      .filter(({ text }) => /^<\/div>\n(?!\n|$)/m.test(text) || /<p class=/.test(text))
      .map(({ page }) => page);

    // Assert
    expect(glued).toEqual([]);
  });

  it("should give every screenshot alt text", () => {
    // Arrange
    const refs = references();

    // Act
    const bare = refs.filter((ref) => ref.alt.trim() === "").map((ref) => `${ref.page} → ${ref.file}`);

    // Assert
    expect(bare).toEqual([]);
  });
});
