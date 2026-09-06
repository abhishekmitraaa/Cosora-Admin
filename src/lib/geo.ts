/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLACING VENDORS ON A MAP WITHOUT A GEOCODER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `vendor_profiles` stores `city` and `state` as free text and carries no
 * latitude, longitude, PIN-code centroid or district code. There is no
 * geocoding service wired into this project and adding one is a schema and
 * billing decision, not a UI one. So the map resolves a vendor's text address
 * against the static gazetteer below.
 *
 * THE ENTRIES BELOW ARE REAL COORDINATES FOR REAL PLACES. They are reference
 * data, in the same category as a currency symbol or a state list, and are the
 * one kind of constant this pass allows itself. Nothing here is a fabricated
 * business figure: a point exists only because a vendor row named that city,
 * and its weight is a count of those rows.
 *
 * RESOLUTION IS THREE-TIERED AND THE TIER IS REPORTED:
 *
 *   city   - the city name matched the gazetteer. The point is where the city
 *            actually is, to about a kilometre.
 *   state  - the city did not match but the state did, so the vendor is placed
 *            on the STATE CENTROID. This is a real approximation and the UI
 *            says so, because a cluster sitting in empty scrub in the middle of
 *            Rajasthan is an artefact of this fallback, not a finding.
 *   none   - neither matched. The vendor is NOT placed. It is counted and
 *            listed separately, never quietly dropped, because an unplaced
 *            vendor is the difference between "no vendors there" and "we could
 *            not read the address".
 *
 * The city list covers India's textile and apparel clusters plus the major
 * metros, which is what this marketplace's vendor base looks like. A city that
 * is missing shows up in the unplaced list, which is the signal to add it.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export type Precision = "city" | "state" | "none";

/** Fold case, strip punctuation and collapse whitespace before any lookup. */
function normalise(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/[.,'’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * States and union territories, at their approximate geographic centre.
 * Used only as the second-tier fallback described above.
 */
const STATES: Record<string, LatLng> = {
  "andhra pradesh": { lat: 15.91, lng: 79.74 },
  "arunachal pradesh": { lat: 28.22, lng: 94.73 },
  assam: { lat: 26.2, lng: 92.94 },
  bihar: { lat: 25.1, lng: 85.31 },
  chhattisgarh: { lat: 21.28, lng: 81.87 },
  goa: { lat: 15.3, lng: 74.12 },
  gujarat: { lat: 22.26, lng: 71.19 },
  haryana: { lat: 29.06, lng: 76.09 },
  "himachal pradesh": { lat: 31.1, lng: 77.17 },
  jharkhand: { lat: 23.61, lng: 85.28 },
  karnataka: { lat: 15.32, lng: 75.71 },
  kerala: { lat: 10.85, lng: 76.27 },
  "madhya pradesh": { lat: 22.97, lng: 78.66 },
  maharashtra: { lat: 19.75, lng: 75.71 },
  manipur: { lat: 24.66, lng: 93.91 },
  meghalaya: { lat: 25.47, lng: 91.37 },
  mizoram: { lat: 23.16, lng: 92.94 },
  nagaland: { lat: 26.16, lng: 94.56 },
  odisha: { lat: 20.95, lng: 85.1 },
  orissa: { lat: 20.95, lng: 85.1 },
  punjab: { lat: 31.15, lng: 75.34 },
  rajasthan: { lat: 27.02, lng: 74.22 },
  sikkim: { lat: 27.53, lng: 88.51 },
  "tamil nadu": { lat: 11.13, lng: 78.66 },
  telangana: { lat: 18.11, lng: 79.02 },
  tripura: { lat: 23.94, lng: 91.99 },
  "uttar pradesh": { lat: 26.85, lng: 80.95 },
  uttarakhand: { lat: 30.07, lng: 79.02 },
  "west bengal": { lat: 22.99, lng: 87.85 },
  delhi: { lat: 28.7, lng: 77.1 },
  "new delhi": { lat: 28.7, lng: 77.1 },
  "nct of delhi": { lat: 28.7, lng: 77.1 },
  "jammu and kashmir": { lat: 33.78, lng: 76.58 },
  ladakh: { lat: 34.15, lng: 77.58 },
  puducherry: { lat: 11.94, lng: 79.81 },
  pondicherry: { lat: 11.94, lng: 79.81 },
  chandigarh: { lat: 30.73, lng: 76.78 },
  "andaman and nicobar islands": { lat: 11.74, lng: 92.66 },
  "dadra and nagar haveli and daman and diu": { lat: 20.4, lng: 72.83 },
  lakshadweep: { lat: 10.57, lng: 72.64 },
};

/**
 * Cities and towns. Weighted towards India's textile and apparel clusters,
 * because that is who lists on Cosora: the Tiruppur knitwear belt, the Surat
 * synthetics cluster, the Ludhiana hosiery cluster, the Panipat home-textiles
 * cluster, the Bhilwara suiting cluster and the Bhadohi carpet belt, plus every
 * metro and state capital.
 *
 * Common alternate names are separate keys pointing at the same coordinate, so
 * "Bangalore" and "Bengaluru" both resolve rather than one of them landing in
 * the unplaced list.
 */
const CITIES: Record<string, LatLng> = {
  // Metros and their historical names
  mumbai: { lat: 19.076, lng: 72.877 },
  bombay: { lat: 19.076, lng: 72.877 },
  delhi: { lat: 28.614, lng: 77.209 },
  "new delhi": { lat: 28.614, lng: 77.209 },
  bengaluru: { lat: 12.972, lng: 77.594 },
  bangalore: { lat: 12.972, lng: 77.594 },
  hyderabad: { lat: 17.385, lng: 78.487 },
  chennai: { lat: 13.083, lng: 80.27 },
  madras: { lat: 13.083, lng: 80.27 },
  kolkata: { lat: 22.573, lng: 88.364 },
  calcutta: { lat: 22.573, lng: 88.364 },
  pune: { lat: 18.52, lng: 73.857 },
  poona: { lat: 18.52, lng: 73.857 },

  // Gujarat
  ahmedabad: { lat: 23.023, lng: 72.571 },
  surat: { lat: 21.17, lng: 72.831 },
  vadodara: { lat: 22.307, lng: 73.181 },
  baroda: { lat: 22.307, lng: 73.181 },
  rajkot: { lat: 22.303, lng: 70.802 },
  bhavnagar: { lat: 21.764, lng: 72.152 },
  jamnagar: { lat: 22.47, lng: 70.057 },
  gandhinagar: { lat: 23.216, lng: 72.636 },
  bhuj: { lat: 23.242, lng: 69.667 },
  jetpur: { lat: 21.755, lng: 70.622 },
  morbi: { lat: 22.812, lng: 70.837 },
  anand: { lat: 22.556, lng: 72.955 },
  nadiad: { lat: 22.694, lng: 72.861 },

  // Maharashtra
  "navi mumbai": { lat: 19.033, lng: 73.03 },
  thane: { lat: 19.218, lng: 72.978 },
  bhiwandi: { lat: 19.297, lng: 73.063 },
  nashik: { lat: 19.997, lng: 73.79 },
  nasik: { lat: 19.997, lng: 73.79 },
  nagpur: { lat: 21.146, lng: 79.088 },
  aurangabad: { lat: 19.876, lng: 75.343 },
  solapur: { lat: 17.659, lng: 75.906 },
  ichalkaranji: { lat: 16.691, lng: 74.46 },
  kolhapur: { lat: 16.705, lng: 74.243 },
  malegaon: { lat: 20.554, lng: 74.525 },

  // Tamil Nadu
  tiruppur: { lat: 11.108, lng: 77.341 },
  tirupur: { lat: 11.108, lng: 77.341 },
  coimbatore: { lat: 11.017, lng: 76.956 },
  erode: { lat: 11.341, lng: 77.717 },
  salem: { lat: 11.664, lng: 78.146 },
  madurai: { lat: 9.925, lng: 78.119 },
  karur: { lat: 10.958, lng: 78.081 },
  kanchipuram: { lat: 12.837, lng: 79.704 },
  dindigul: { lat: 10.365, lng: 77.98 },
  namakkal: { lat: 11.219, lng: 78.167 },
  ambur: { lat: 12.791, lng: 78.716 },
  vellore: { lat: 12.916, lng: 79.132 },
  ranipet: { lat: 12.93, lng: 79.333 },

  // Rajasthan
  jaipur: { lat: 26.912, lng: 75.787 },
  bhilwara: { lat: 25.347, lng: 74.641 },
  jodhpur: { lat: 26.238, lng: 73.024 },
  udaipur: { lat: 24.586, lng: 73.712 },
  kota: { lat: 25.213, lng: 75.865 },
  sanganer: { lat: 26.816, lng: 75.789 },
  bagru: { lat: 26.816, lng: 75.545 },

  // Punjab, Haryana, NCR
  ludhiana: { lat: 30.901, lng: 75.857 },
  amritsar: { lat: 31.634, lng: 74.872 },
  jalandhar: { lat: 31.326, lng: 75.576 },
  panipat: { lat: 29.391, lng: 76.977 },
  sonipat: { lat: 28.995, lng: 77.023 },
  faridabad: { lat: 28.408, lng: 77.317 },
  gurugram: { lat: 28.459, lng: 77.027 },
  gurgaon: { lat: 28.459, lng: 77.027 },
  noida: { lat: 28.535, lng: 77.391 },
  ghaziabad: { lat: 28.669, lng: 77.454 },
  chandigarh: { lat: 30.733, lng: 76.779 },

  // Uttar Pradesh and Uttarakhand
  lucknow: { lat: 26.847, lng: 80.947 },
  kanpur: { lat: 26.45, lng: 80.332 },
  meerut: { lat: 28.984, lng: 77.706 },
  varanasi: { lat: 25.317, lng: 82.973 },
  bhadohi: { lat: 25.395, lng: 82.57 },
  agra: { lat: 27.177, lng: 78.008 },
  aligarh: { lat: 27.897, lng: 78.088 },
  mau: { lat: 25.941, lng: 83.561 },
  gorakhpur: { lat: 26.76, lng: 83.374 },
  dehradun: { lat: 30.317, lng: 78.032 },

  // Madhya Pradesh and Chhattisgarh
  indore: { lat: 22.72, lng: 75.858 },
  bhopal: { lat: 23.26, lng: 77.413 },
  jabalpur: { lat: 23.181, lng: 79.986 },
  gwalior: { lat: 26.218, lng: 78.183 },
  raipur: { lat: 21.251, lng: 81.629 },

  // Karnataka
  mysuru: { lat: 12.295, lng: 76.639 },
  mysore: { lat: 12.295, lng: 76.639 },
  hubli: { lat: 15.364, lng: 75.124 },
  belgaum: { lat: 15.85, lng: 74.498 },
  davangere: { lat: 14.464, lng: 75.921 },

  // Kerala
  kochi: { lat: 9.931, lng: 76.267 },
  cochin: { lat: 9.931, lng: 76.267 },
  thiruvananthapuram: { lat: 8.524, lng: 76.936 },
  trivandrum: { lat: 8.524, lng: 76.936 },
  kozhikode: { lat: 11.259, lng: 75.78 },
  calicut: { lat: 11.259, lng: 75.78 },
  thrissur: { lat: 10.527, lng: 76.214 },
  kannur: { lat: 11.874, lng: 75.37 },

  // Andhra Pradesh and Telangana
  visakhapatnam: { lat: 17.687, lng: 83.219 },
  vijayawada: { lat: 16.507, lng: 80.648 },
  guntur: { lat: 16.307, lng: 80.437 },
  warangal: { lat: 17.978, lng: 79.594 },
  sircilla: { lat: 18.39, lng: 78.812 },
  pochampally: { lat: 17.348, lng: 78.827 },

  // West Bengal and the east
  howrah: { lat: 22.59, lng: 88.31 },
  siliguri: { lat: 26.727, lng: 88.395 },
  durgapur: { lat: 23.52, lng: 87.311 },
  asansol: { lat: 23.685, lng: 86.974 },
  santipur: { lat: 23.253, lng: 88.437 },
  shantipur: { lat: 23.253, lng: 88.437 },
  murshidabad: { lat: 24.181, lng: 88.269 },
  bardhaman: { lat: 23.255, lng: 87.856 },
  bhubaneswar: { lat: 20.296, lng: 85.825 },
  cuttack: { lat: 20.463, lng: 85.883 },
  patna: { lat: 25.594, lng: 85.137 },
  ranchi: { lat: 23.344, lng: 85.31 },
  guwahati: { lat: 26.144, lng: 91.736 },

  // North and west, remainder
  srinagar: { lat: 34.084, lng: 74.797 },
  jammu: { lat: 32.727, lng: 74.857 },
  shimla: { lat: 31.104, lng: 77.173 },
  panaji: { lat: 15.491, lng: 73.827 },
  puducherry: { lat: 11.934, lng: 79.83 },
  pondicherry: { lat: 11.934, lng: 79.83 },
};

export interface Resolved {
  point: LatLng | null;
  precision: Precision;
}

/**
 * Resolve one vendor's free-text city and state.
 *
 * City first, then state centroid, then nothing. The caller must render the
 * three outcomes differently; collapsing "state centroid" into "city" would put
 * a confident dot on a spot no vendor is actually at.
 */
export function resolve(city: string | null, state: string | null): Resolved {
  const c = normalise(city);
  if (c && CITIES[c]) return { point: CITIES[c], precision: "city" };

  const s = normalise(state);
  if (s && STATES[s]) return { point: STATES[s], precision: "state" };

  // A vendor may have typed the state into the city field, or the other way
  // round. Both crossovers are worth one more try before giving up.
  if (c && STATES[c]) return { point: STATES[c], precision: "state" };
  if (s && CITIES[s]) return { point: CITIES[s], precision: "city" };

  return { point: null, precision: "none" };
}

/** How many places the gazetteer knows, for the "why is this missing" note. */
export const GAZETTEER_SIZE = {
  cities: new Set(Object.values(CITIES).map((p) => `${p.lat},${p.lng}`)).size,
  states: new Set(Object.values(STATES).map((p) => `${p.lat},${p.lng}`)).size,
};

export interface VendorPoint {
  key: string;
  label: string;
  state: string | null;
  lat: number;
  lng: number;
  count: number;
  precision: Exclude<Precision, "none">;
  /** Vendor ids at this point, so the panel can list who is there. */
  vendorIds: string[];
}

export interface Unplaced {
  city: string | null;
  state: string | null;
  count: number;
}

export interface Aggregation {
  points: VendorPoint[];
  unplaced: Unplaced[];
  unplacedCount: number;
  placedCount: number;
  /** The heaviest single point, used to normalise the heatmap weight. */
  maxCount: number;
}

/**
 * Fold vendor rows into weighted points.
 *
 * Vendors in the same city collapse to one point whose `count` is the weight
 * the heatmap uses. Points are keyed by resolved coordinate rather than by the
 * raw string, so "Tirupur" and "Tiruppur" land on the same dot instead of two
 * dots one pixel apart, each reading half the real density.
 */
export function aggregate(
  vendors: { id: string; city: string | null; state: string | null }[],
): Aggregation {
  const points = new Map<string, VendorPoint>();
  const missing = new Map<string, Unplaced>();

  for (const v of vendors) {
    const { point, precision } = resolve(v.city, v.state);
    if (!point || precision === "none") {
      const key = `${normalise(v.city)}|${normalise(v.state)}`;
      const row = missing.get(key);
      if (row) row.count += 1;
      else missing.set(key, { city: v.city, state: v.state, count: 1 });
      continue;
    }

    const key = `${point.lat},${point.lng}`;
    const existing = points.get(key);
    if (existing) {
      existing.count += 1;
      existing.vendorIds.push(v.id);
      // A city-precision hit upgrades a point first created by a state
      // fallback: the better label wins, and the marker stops apologising.
      if (precision === "city" && existing.precision === "state") {
        existing.precision = "city";
        existing.label = v.city ?? existing.label;
      }
    } else {
      points.set(key, {
        key,
        label: (precision === "city" ? v.city : v.state) ?? "Unknown",
        state: v.state,
        lat: point.lat,
        lng: point.lng,
        count: 1,
        precision,
        vendorIds: [v.id],
      });
    }
  }

  const list = [...points.values()].sort((a, b) => b.count - a.count);
  const unplaced = [...missing.values()].sort((a, b) => b.count - a.count);
  return {
    points: list,
    unplaced,
    unplacedCount: unplaced.reduce((s, u) => s + u.count, 0),
    placedCount: list.reduce((s, p) => s + p.count, 0),
    maxCount: list.length > 0 ? list[0].count : 0,
  };
}

/** GeoJSON for the MapLibre heatmap source. `count` is the weight property. */
export function toFeatureCollection(points: VendorPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      properties: {
        count: p.count,
        label: p.label,
        precision: p.precision,
      },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
}

/** India, comfortably framed. [west, south, east, north]. */
export const INDIA_BOUNDS: [number, number, number, number] = [67.5, 6.0, 98.5, 36.5];
