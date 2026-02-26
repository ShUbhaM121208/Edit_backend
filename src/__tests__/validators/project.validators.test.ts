import { describe, it, expect } from "vitest";
import {
  renderProjectSchema,
  syncSegmentsSchema,
} from "../../validators/project.validators.js";

// ──────────────────────────────────────
// renderProjectSchema
// ──────────────────────────────────────

describe("renderProjectSchema", () => {
  it("should accept empty body (all defaults)", () => {
    const result = renderProjectSchema.parse({});
    expect(result.quality).toBeUndefined();
  });

  it("should accept quality=1080p", () => {
    const result = renderProjectSchema.parse({ quality: "1080p" });
    expect(result.quality).toBe("1080p");
  });

  it("should accept quality=720p", () => {
    const result = renderProjectSchema.parse({ quality: "720p" });
    expect(result.quality).toBe("720p");
  });

  it("should reject invalid quality value", () => {
    expect(() => renderProjectSchema.parse({ quality: "480p" })).toThrow();
  });

  it("should reject quality=4k", () => {
    expect(() => renderProjectSchema.parse({ quality: "4k" })).toThrow();
  });

  it("should reject numeric quality", () => {
    expect(() => renderProjectSchema.parse({ quality: 1080 })).toThrow();
  });

  it("should reject empty string quality", () => {
    expect(() => renderProjectSchema.parse({ quality: "" })).toThrow();
  });

  it("should reject undefined body (controller guards with || {})", () => {
    // The raw schema rejects undefined — the controller handles this
    // by passing `req.body || {}` which coerces undefined to {}
    expect(() => renderProjectSchema.parse(undefined)).toThrow();
  });

  it("should strip unknown fields", () => {
    const result = renderProjectSchema.parse({ quality: "720p", extraField: "hello" });
    expect(result.quality).toBe("720p");
    expect((result as any).extraField).toBeUndefined();
  });
});

// ──────────────────────────────────────
// syncSegmentsSchema — segment-level edge cases
// ──────────────────────────────────────

describe("syncSegmentsSchema — edge cases for render inputs", () => {
  it("should accept empty segments array", () => {
    const result = syncSegmentsSchema.parse({ segments: [] });
    expect(result.segments).toEqual([]);
  });

  it("should accept a valid ORIGINAL segment", () => {
    const result = syncSegmentsSchema.parse({
      segments: [{ start: 0, end: 5, track: "ORIGINAL", volume: 80, order: 0 }],
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].track).toBe("ORIGINAL");
  });

  it("should accept a valid SONG segment", () => {
    const result = syncSegmentsSchema.parse({
      segments: [{ start: 0, end: 10, track: "SONG", volume: 60, order: 0 }],
    });
    expect(result.segments[0].track).toBe("SONG");
  });

  it("should default volume to 100 when not provided", () => {
    const result = syncSegmentsSchema.parse({
      segments: [{ start: 0, end: 5, track: "ORIGINAL", order: 0 }],
    });
    expect(result.segments[0].volume).toBe(100);
  });

  it("should reject volume > 100", () => {
    expect(() =>
      syncSegmentsSchema.parse({
        segments: [{ start: 0, end: 5, track: "ORIGINAL", volume: 150, order: 0 }],
      })
    ).toThrow();
  });

  it("should reject volume < 0", () => {
    expect(() =>
      syncSegmentsSchema.parse({
        segments: [{ start: 0, end: 5, track: "ORIGINAL", volume: -10, order: 0 }],
      })
    ).toThrow();
  });

  it("should reject negative start time", () => {
    expect(() =>
      syncSegmentsSchema.parse({
        segments: [{ start: -1, end: 5, track: "ORIGINAL", volume: 50, order: 0 }],
      })
    ).toThrow();
  });

  it("should reject invalid track value", () => {
    expect(() =>
      syncSegmentsSchema.parse({
        segments: [{ start: 0, end: 5, track: "EFFECTS", volume: 50, order: 0 }],
      })
    ).toThrow();
  });

  it("should reject more than 50 segments", () => {
    const segments = Array.from({ length: 51 }, (_, i) => ({
      start: i,
      end: i + 1,
      track: "ORIGINAL" as const,
      volume: 50,
      order: i,
    }));
    expect(() => syncSegmentsSchema.parse({ segments })).toThrow();
  });

  it("should accept exactly 50 segments", () => {
    const segments = Array.from({ length: 50 }, (_, i) => ({
      start: i,
      end: i + 1,
      track: "ORIGINAL" as const,
      volume: 50,
      order: i,
    }));
    const result = syncSegmentsSchema.parse({ segments });
    expect(result.segments).toHaveLength(50);
  });

  it("should accept overlapping segments (no validation for overlaps)", () => {
    const result = syncSegmentsSchema.parse({
      segments: [
        { start: 0, end: 10, track: "ORIGINAL", volume: 100, order: 0 },
        { start: 5, end: 15, track: "SONG", volume: 80, order: 1 },
      ],
    });
    expect(result.segments).toHaveLength(2);
  });

  it("should reject non-integer volume", () => {
    expect(() =>
      syncSegmentsSchema.parse({
        segments: [{ start: 0, end: 5, track: "ORIGINAL", volume: 50.5, order: 0 }],
      })
    ).toThrow();
  });

  it("should accept volume of 0 (mute)", () => {
    const result = syncSegmentsSchema.parse({
      segments: [{ start: 0, end: 5, track: "ORIGINAL", volume: 0, order: 0 }],
    });
    expect(result.segments[0].volume).toBe(0);
  });

  it("should reject missing segments field", () => {
    expect(() => syncSegmentsSchema.parse({})).toThrow();
  });

  it("should allow start === end (zero-length segment)", () => {
    const result = syncSegmentsSchema.parse({
      segments: [{ start: 5, end: 5, track: "ORIGINAL", volume: 100, order: 0 }],
    });
    expect(result.segments[0].start).toBe(5);
    expect(result.segments[0].end).toBe(5);
  });

  it("should allow end < start (no cross-field validation in schema)", () => {
    // Schema only validates individual fields, not that end > start
    const result = syncSegmentsSchema.parse({
      segments: [{ start: 10, end: 5, track: "ORIGINAL", volume: 100, order: 0 }],
    });
    expect(result.segments[0].start).toBe(10);
    expect(result.segments[0].end).toBe(5);
  });
});
