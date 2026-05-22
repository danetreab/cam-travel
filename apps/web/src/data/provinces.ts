// Cambodia's 24 provinces + Phnom Penh (capital municipality).
// Center coordinates are roughly the provincial seat; zoom is tuned so the
// whole province (or city, for Phnom Penh / Kep) fits the viewport.
export interface ProvinceEntry {
  name: string
  lat: number
  lng: number
  zoom: number
}

export const PROVINCES: ProvinceEntry[] = [
  { name: "Banteay Meanchey", lat: 13.5938, lng: 102.9879, zoom: 10 },
  { name: "Battambang", lat: 13.1023, lng: 103.1995, zoom: 10 },
  { name: "Kampong Cham", lat: 11.9931, lng: 105.4566, zoom: 10 },
  { name: "Kampong Chhnang", lat: 12.2502, lng: 104.6669, zoom: 10 },
  { name: "Kampong Speu", lat: 11.453, lng: 104.5209, zoom: 10 },
  { name: "Kampong Thom", lat: 12.7113, lng: 104.8888, zoom: 10 },
  { name: "Kampot", lat: 10.6104, lng: 104.181, zoom: 11 },
  { name: "Kandal", lat: 11.4622, lng: 105.0386, zoom: 10 },
  { name: "Kep", lat: 10.483, lng: 104.3163, zoom: 12 },
  { name: "Koh Kong", lat: 11.6153, lng: 102.9836, zoom: 9 },
  { name: "Kratie", lat: 12.4881, lng: 106.0252, zoom: 10 },
  { name: "Mondulkiri", lat: 12.7879, lng: 107.1014, zoom: 9 },
  { name: "Oddar Meanchey", lat: 14.181, lng: 103.5117, zoom: 10 },
  { name: "Pailin", lat: 12.8485, lng: 102.6097, zoom: 11 },
  { name: "Phnom Penh", lat: 11.5564, lng: 104.9282, zoom: 12 },
  { name: "Preah Sihanouk", lat: 10.6273, lng: 103.5226, zoom: 11 },
  { name: "Preah Vihear", lat: 13.8074, lng: 104.9805, zoom: 9 },
  { name: "Prey Veng", lat: 11.4866, lng: 105.3253, zoom: 10 },
  { name: "Pursat", lat: 12.5388, lng: 103.9182, zoom: 9 },
  { name: "Ratanakiri", lat: 13.7395, lng: 106.9874, zoom: 9 },
  { name: "Siem Reap", lat: 13.3633, lng: 103.8564, zoom: 10 },
  { name: "Stung Treng", lat: 13.5259, lng: 105.9683, zoom: 9 },
  { name: "Svay Rieng", lat: 11.0879, lng: 105.7993, zoom: 10 },
  { name: "Takeo", lat: 10.9908, lng: 104.7843, zoom: 10 },
  { name: "Tboung Khmum", lat: 11.8881, lng: 105.69, zoom: 10 },
]

export function findProvince(name: string | null | undefined): ProvinceEntry | undefined {
  if (!name) return undefined
  const lower = name.toLowerCase()
  return PROVINCES.find((p) => p.name.toLowerCase() === lower)
}
