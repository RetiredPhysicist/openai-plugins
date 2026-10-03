import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeThingsDate,
  decodeThingsTime,
  encodeThingsDate,
} from "./things-db.js";

test("decodes a packed Things date", () => {
  // 2026-10-03 packed as year << 16 | month << 12 | day << 7.
  const packed = (2026 << 16) | (10 << 12) | (3 << 7);
  assert.equal(decodeThingsDate(packed), "2026-10-03");
});

test("round-trips ISO dates through the packed format", () => {
  for (const iso of ["1999-01-01", "2024-02-29", "2026-12-31"]) {
    assert.equal(decodeThingsDate(encodeThingsDate(iso)), iso);
  }
});

test("decodes a packed Things time", () => {
  const packed = (14 << 26) | (30 << 20);
  assert.equal(decodeThingsTime(packed), "14:30");
});

test("null and zero dates decode to null instead of a bogus date", () => {
  assert.equal(decodeThingsDate(null), null);
  assert.equal(decodeThingsDate(0), null);
  assert.equal(decodeThingsTime(null), null);
  assert.equal(decodeThingsTime(0), null);
});

test("rejects malformed dates when encoding", () => {
  assert.throws(() => encodeThingsDate("2026-1-1"), /Invalid date/);
  assert.throws(() => encodeThingsDate("not-a-date"), /Invalid date/);
});

test("rejects an out-of-range packed month", () => {
  // Month 13 is not a real month.
  const packed = (2026 << 16) | (13 << 12) | (3 << 7);
  assert.equal(decodeThingsDate(packed), null);
});
