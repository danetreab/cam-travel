import { describe, expect, it } from "vitest";
import {
  buildNearbyLocationRestriction,
  buildNearbyTextSearchBody,
  cleanNearbySearchQuery,
  distanceBetweenMeters,
  isLocationAwareNearbyRequest,
  selectNearbyPlaces,
} from "./nearby-search";

const bounds = { south: 9.9, west: 102.3, north: 14.7, east: 107.7 };
const origin = { lat: 11.5564, lng: 104.9282 };

function placeAtDistance(id: string, distanceMeters: number) {
  return {
    id,
    latitude: origin.lat + distanceMeters / 111_320,
    longitude: origin.lng,
  };
}

describe("nearby search helpers", () => {
  it("cleans broad and relative location phrases without losing the category", () => {
    expect(
      cleanNearbySearchQuery(
        "best cafes near current location in Cambodia",
        "find cafes near me",
      ),
    ).toBe("best cafes");
  });

  it("builds a distance-ranked request without an explicit Cambodia query", () => {
    const body = buildNearbyTextSearchBody(
      "cafes near me in Cambodia",
      "find cafes near me",
      origin,
      bounds,
      "en",
    );

    expect(body).toMatchObject({
      textQuery: "cafes",
      pageSize: 20,
      languageCode: "en",
      rankPreference: "DISTANCE",
    });
    expect(body).toHaveProperty("locationRestriction.rectangle");
    expect(body).not.toHaveProperty("locationBias");
  });

  it("activates nearby mode only for valid Cambodia travel requests", () => {
    expect(
      isLocationAwareNearbyRequest("find cafes near me", origin, bounds),
    ).toBe(true);
    expect(
      isLocationAwareNearbyRequest("find cafes near me", null, bounds),
    ).toBe(false);
    expect(
      isLocationAwareNearbyRequest(
        "find cafes near me",
        { lat: Number.NaN, lng: origin.lng },
        bounds,
      ),
    ).toBe(false);
    expect(
      isLocationAwareNearbyRequest(
        "find cafes near me",
        { lat: 15, lng: 104.9 },
        bounds,
      ),
    ).toBe(false);
    expect(
      isLocationAwareNearbyRequest("explain code near me", origin, bounds),
    ).toBe(false);
  });

  it("builds and clips a 25 km restriction to Cambodia bounds", () => {
    const restriction = buildNearbyLocationRestriction(
      { lat: 14.65, lng: 107.65 },
      bounds,
    );

    expect(restriction.rectangle.high).toEqual({
      latitude: bounds.north,
      longitude: bounds.east,
    });
    expect(restriction.rectangle.low.latitude).toBeLessThan(14.65);
    expect(restriction.rectangle.low.longitude).toBeLessThan(107.65);
  });

  it("calculates straight-line distance", () => {
    expect(
      distanceBetweenMeters(origin, {
        lat: origin.lat + 1 / 111.32,
        lng: origin.lng,
      }),
    ).toBeCloseTo(1_000, -1);
  });

  it("uses the smallest radius with eight results and sorts by distance", () => {
    const places = Array.from({ length: 10 }, (_, index) =>
      placeAtDistance(String(index), 1_000 + index * 500),
    ).reverse();

    const selected = selectNearbyPlaces(places, origin);

    expect(selected).toHaveLength(9);
    expect(selected.map((place) => place.id)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
    expect(selected.at(-1)!.distanceMeters).toBeLessThanOrEqual(5_000);
  });

  it("expands to 15 km and then 25 km only when needed", () => {
    const withinFifteen = [
      ...Array.from({ length: 4 }, (_, index) =>
        placeAtDistance(`close-${index}`, 1_000 + index * 500),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        placeAtDistance(`medium-${index}`, 6_000 + index * 1_000),
      ),
      placeAtDistance("far", 20_000),
    ];
    const selectedAtFifteen = selectNearbyPlaces(withinFifteen, origin);

    expect(selectedAtFifteen).toHaveLength(8);
    expect(selectedAtFifteen.some((place) => place.id === "far")).toBe(false);

    const sparse = [
      placeAtDistance("close", 1_000),
      placeAtDistance("far", 20_000),
      placeAtDistance("outside", 26_000),
    ];
    const selectedAtTwentyFive = selectNearbyPlaces(sparse, origin);

    expect(selectedAtTwentyFive.map((place) => place.id)).toEqual([
      "close",
      "far",
    ]);
  });

  it("keeps boundary results, rejects farther results, and handles empty input", () => {
    const selected = selectNearbyPlaces(
      [placeAtDistance("boundary", 25_000), placeAtDistance("outside", 25_100)],
      origin,
    );

    expect(selected.map((place) => place.id)).toEqual(["boundary"]);
    expect(selectNearbyPlaces([], origin)).toEqual([]);
  });
});
