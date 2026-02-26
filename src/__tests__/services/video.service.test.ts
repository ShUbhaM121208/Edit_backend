import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ──────────────────────────────────────
// buildVolumeExpression — pure function, no mocks needed
// ──────────────────────────────────────

// We need to import the function. Since it uses ffmpeg internally for other
// functions, we mock ffmpeg and related modules at the module level.
vi.mock("fluent-ffmpeg", () => ({
  default: vi.fn(),
}));

vi.mock("../storage.service.js", () => ({
  getSignedDownloadUrl: vi.fn(),
  uploadFromBuffer: vi.fn(),
}));

import { buildVolumeExpression } from "../../services/video.service.js";

interface TestSegment {
  start: number;
  end: number;
  track: "ORIGINAL" | "SONG";
  volume: number;
  order: number;
}

describe("buildVolumeExpression", () => {
  it("should return default volume when no segments provided", () => {
    const result = buildVolumeExpression([], 30, 1.0);
    expect(result).toBe("1");
  });

  it("should return '0' default when no segments and default is 0", () => {
    const result = buildVolumeExpression([], 30, 0.0);
    expect(result).toBe("0");
  });

  it("should build expression for a single segment", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 5, track: "ORIGINAL", volume: 80, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    // Should contain between(), the volume value, and the default
    expect(result).toContain("between(t");
    expect(result).toContain("0.80");
    expect(result).toContain("1");
  });

  it("should build nested expression for multiple segments", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 5, track: "ORIGINAL", volume: 80, order: 0 },
      { start: 5, end: 10, track: "ORIGINAL", volume: 50, order: 1 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    // Should have two "between" calls
    const matches = result.match(/between/g);
    expect(matches).toHaveLength(2);

    // Both volume values should be present
    expect(result).toContain("0.80");
    expect(result).toContain("0.50");
  });

  it("should handle zero volume (mute) segment", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 10, track: "ORIGINAL", volume: 0, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    expect(result).toContain("0.00");
  });

  it("should handle full volume (100) segment", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 10, track: "ORIGINAL", volume: 100, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    expect(result).toContain("1.00");
  });

  it("should properly format start/end times to 3 decimal places", () => {
    const segments: TestSegment[] = [
      { start: 1.5, end: 7.25, track: "ORIGINAL", volume: 60, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    expect(result).toContain("1.500");
    expect(result).toContain("7.250");
  });

  it("should escape commas in the expression (for ffmpeg filter)", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 5, track: "ORIGINAL", volume: 80, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    // Commas should be escaped with backslash for ffmpeg
    expect(result).toContain("\\,");
    // There should be NO unescaped commas (all commas should be preceded by \)
    const unescapedCommas = result.replace(/\\,/g, "").match(/,/g);
    expect(unescapedCommas).toBeNull();
  });

  it("should handle many segments creating deep nesting", () => {
    const segments: TestSegment[] = Array.from({ length: 10 }, (_, i) => ({
      start: i * 3,
      end: (i + 1) * 3,
      track: "ORIGINAL" as const,
      volume: (i + 1) * 10,
      order: i,
    }));

    const result = buildVolumeExpression(segments, 30, 0.0);

    // Should have 10 between() calls
    const matches = result.match(/between/g);
    expect(matches).toHaveLength(10);

    // Should end with the default value
    expect(result).toContain("0)");
  });

  it("should handle segments not starting at 0 (gap at beginning)", () => {
    const segments: TestSegment[] = [
      { start: 5, end: 10, track: "ORIGINAL", volume: 80, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    // Time 0-5 should use default volume (1.0), time 5-10 should use 0.80
    expect(result).toContain("5.000");
    expect(result).toContain("10.000");
  });

  it("should handle overlapping segments (both get separate if() calls)", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 10, track: "ORIGINAL", volume: 80, order: 0 },
      { start: 5, end: 15, track: "ORIGINAL", volume: 60, order: 1 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    // Both segments should have their own between() expression
    const matches = result.match(/between/g);
    expect(matches).toHaveLength(2);
  });

  it("should produce the correct nesting order (first segment outermost)", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 5, track: "ORIGINAL", volume: 80, order: 0 },
      { start: 5, end: 10, track: "ORIGINAL", volume: 60, order: 1 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    // The first segment's between() should appear first in the string
    const firstIdx = result.indexOf("0.000");
    const secondIdx = result.indexOf("5.000\\,10.000");
    expect(firstIdx).toBeLessThan(secondIdx);
  });

  it("should handle fractional volumes correctly", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 5, track: "ORIGINAL", volume: 33, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 1.0);

    expect(result).toContain("0.33");
  });

  it("should handle a single segment covering the entire duration", () => {
    const segments: TestSegment[] = [
      { start: 0, end: 30, track: "ORIGINAL", volume: 75, order: 0 },
    ];
    const result = buildVolumeExpression(segments, 30, 0.0);

    expect(result).toContain("0.000");
    expect(result).toContain("30.000");
    expect(result).toContain("0.75");
  });

  // ── Tests that verify render-matching-preview behavior ──

  it("should mute original audio in gaps when default is 0 (matches preview)", () => {
    // User scenario: original audio 0-10s, song 10-15s, original 15-30s
    // The original audio segments are 0-10 and 15-30.
    // With default 0, the gap at 10-15 should be silent (0 volume).
    const segments: TestSegment[] = [
      { start: 0, end: 10, track: "ORIGINAL", volume: 100, order: 0 },
      { start: 15, end: 30, track: "ORIGINAL", volume: 100, order: 2 },
    ];
    const result = buildVolumeExpression(segments, 30, 0.0);

    // The default (fallback) for gaps should be 0
    // The expression ends with nested closing: ...\,0))
    expect(result).toMatch(/\\,0\)+$/);
    // Both segments should be present
    const matches = result.match(/between/g);
    expect(matches).toHaveLength(2);
  });

  it("should play song audio only in its segment range when default is 0", () => {
    // Song plays at 10-15s only, silent everywhere else
    const segments: TestSegment[] = [
      { start: 10, end: 15, track: "SONG", volume: 80, order: 1 },
    ];
    const result = buildVolumeExpression(segments, 30, 0.0);

    expect(result).toContain("10.000");
    expect(result).toContain("15.000");
    expect(result).toContain("0.80");
    // Default outside the segment is 0
    expect(result).toMatch(/\\,0\)$/);
  });
});

// ──────────────────────────────────────
// renderFinalVideo — requires mocking ffmpeg, fetch, fs
// We test the orchestration logic
// ──────────────────────────────────────

describe("renderFinalVideo — orchestration", () => {
  // Since renderFinalVideo does heavy I/O (download, ffmpeg, upload),
  // and the mocking would be very complex with fluent-ffmpeg's chaining API,
  // these tests are better suited as integration tests.
  // Here we verify the exported interface exists.

  it("should export renderFinalVideo function", async () => {
    const { renderFinalVideo } = await import("../../services/video.service.js");
    expect(typeof renderFinalVideo).toBe("function");
  });

  it("should export buildVolumeExpression function", async () => {
    const { buildVolumeExpression } = await import("../../services/video.service.js");
    expect(typeof buildVolumeExpression).toBe("function");
  });

  it("should export extractDuration function", async () => {
    const { extractDuration } = await import("../../services/video.service.js");
    expect(typeof extractDuration).toBe("function");
  });

  it("should export generateThumbnail function", async () => {
    const { generateThumbnail } = await import("../../services/video.service.js");
    expect(typeof generateThumbnail).toBe("function");
  });
});
