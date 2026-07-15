export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CambodiaBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface PlaceCoordinates {
  latitude: number;
  longitude: number;
}

export const NEARBY_RADIUS_STEPS_METERS = [5_000, 15_000, 25_000] as const;
export const NEARBY_TARGET_RESULT_COUNT = 8;

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_DEGREE_LATITUDE = 111_320;
const NEARBY_REQUEST_PATTERN =
  /\b(?:nearby|near me|near us|around me|around us|close to me|close to us|current location|my location)\b|ក្បែរខ្ញុំ|នៅជិតខ្ញុំ|ទីតាំងបច្ចុប្បន្ន/iu;
const TRAVEL_REQUEST_PATTERN =
  /\b(?:places?|tours?|trips?|itinerar(?:y|ies)|visits?|attractions?|restaurants?|cafes?|food|hotels?|temples?|museums?|things to do|where to go|routes?)\b|កន្លែង|ដំណើរ|កម្សាន្ត|ម្ហូប|ភោជនីយដ្ឋាន|កាហ្វេ|សណ្ឋាគារ|ប្រាសាទ|សារមន្ទីរ/iu;

export function isLocationAwareNearbyRequest(
  message: string,
  location: Coordinates | null | undefined,
  bounds: CambodiaBounds,
): boolean {
  return Boolean(
    location &&
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.lat >= bounds.south &&
    location.lat <= bounds.north &&
    location.lng >= bounds.west &&
    location.lng <= bounds.east &&
    NEARBY_REQUEST_PATTERN.test(message) &&
    TRAVEL_REQUEST_PATTERN.test(message),
  );
}

export function buildNearbyLocationRestriction(
  location: Coordinates,
  bounds: CambodiaBounds,
  radiusMeters = NEARBY_RADIUS_STEPS_METERS.at(-1)!,
) {
  const latitudeDelta = radiusMeters / METERS_PER_DEGREE_LATITUDE;
  const longitudeScale = Math.max(
    Math.cos((location.lat * Math.PI) / 180),
    0.01,
  );
  const longitudeDelta =
    radiusMeters / (METERS_PER_DEGREE_LATITUDE * longitudeScale);

  return {
    rectangle: {
      low: {
        latitude: Math.max(bounds.south, location.lat - latitudeDelta),
        longitude: Math.max(bounds.west, location.lng - longitudeDelta),
      },
      high: {
        latitude: Math.min(bounds.north, location.lat + latitudeDelta),
        longitude: Math.min(bounds.east, location.lng + longitudeDelta),
      },
    },
  };
}

export function distanceBetweenMeters(
  from: Coordinates,
  to: Coordinates,
): number {
  const latitudeDelta = to.lat - from.lat;
  const longitudeDelta = to.lng - from.lng;
  const latitudeDeltaRadians = (latitudeDelta * Math.PI) / 180;
  const longitudeDeltaRadians = (longitudeDelta * Math.PI) / 180;
  const fromLatitudeRadians = (from.lat * Math.PI) / 180;
  const toLatitudeRadians = (to.lat * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDeltaRadians / 2) ** 2 +
    Math.cos(fromLatitudeRadians) *
      Math.cos(toLatitudeRadians) *
      Math.sin(longitudeDeltaRadians / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function selectNearbyPlaces<T extends PlaceCoordinates>(
  places: T[],
  location: Coordinates,
  targetCount = NEARBY_TARGET_RESULT_COUNT,
): Array<T & { distanceMeters: number }> {
  const maximumRadius = NEARBY_RADIUS_STEPS_METERS.at(-1)!;
  const ranked = places
    .map((place) => ({
      ...place,
      distanceMeters: Math.round(
        distanceBetweenMeters(location, {
          lat: place.latitude,
          lng: place.longitude,
        }),
      ),
    }))
    .filter((place) => place.distanceMeters <= maximumRadius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const selectedRadius =
    NEARBY_RADIUS_STEPS_METERS.find(
      (radius) =>
        ranked.filter((place) => place.distanceMeters <= radius).length >=
        targetCount,
    ) ?? maximumRadius;

  return ranked.filter((place) => place.distanceMeters <= selectedRadius);
}

export function cleanNearbySearchQuery(
  classifiedQuery: string,
  originalMessage: string,
): string {
  const clean = (value: string) =>
    value
      .replace(
        /\b(?:in|within|around)\s+(?:cambodia|kampuchea)\b|(?:នៅ|ក្នុង)\s*កម្ពុជា|ប្រទេសកម្ពុជា/giu,
        " ",
      )
      .replace(
        /\b(?:nearby|near me|near us|around me|around us|close to me|close to us|current location|my location)\b|ក្បែរខ្ញុំ|នៅជិតខ្ញុំ|ទីតាំងបច្ចុប្បន្ន/giu,
        " ",
      )
      .replace(/\b(?:cambodia|kampuchea)\b|កម្ពុជា/giu, " ")
      .replace(/\s+/g, " ")
      .replace(/\s+([,?.!])/g, "$1")
      .replace(/^[,?.!\s]+|[,?.!\s]+$/g, "")
      .replace(/\b(?:near|around|within)\s*$/iu, "")
      .trim();

  return (
    clean(classifiedQuery) ||
    clean(originalMessage) ||
    "tourist attractions and local places"
  );
}

export function buildNearbyTextSearchBody(
  classifiedQuery: string,
  originalMessage: string,
  location: Coordinates,
  bounds: CambodiaBounds,
  languageCode: "en" | "km",
) {
  return {
    textQuery: cleanNearbySearchQuery(classifiedQuery, originalMessage),
    pageSize: 20,
    languageCode,
    locationRestriction: buildNearbyLocationRestriction(location, bounds),
    rankPreference: "DISTANCE" as const,
  };
}
