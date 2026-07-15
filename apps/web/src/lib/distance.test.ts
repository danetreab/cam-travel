import { describe, expect, it } from "vitest"

import { formatDistanceValue } from "./distance"

describe("formatDistanceValue", () => {
  it("formats short distances in metres", () => {
    expect(formatDistanceValue(849.6)).toBe("850 m")
  })

  it("formats nearby distances in kilometres", () => {
    expect(formatDistanceValue(4_180)).toBe("4.2 km")
    expect(formatDistanceValue(12_600)).toBe("13 km")
  })

  it("omits unavailable distances", () => {
    expect(formatDistanceValue(null)).toBeNull()
    expect(formatDistanceValue(Number.NaN)).toBeNull()
  })
})
