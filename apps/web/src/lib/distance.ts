export function formatDistanceValue(
  distanceMeters: number | null
): string | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters)) return null

  const safeMeters = Math.max(0, distanceMeters)
  if (safeMeters < 1_000) return `${Math.round(safeMeters)} m`

  const kilometers = safeMeters / 1_000
  return `${kilometers >= 10 ? Math.round(kilometers) : kilometers.toFixed(1)} km`
}
