/** Shape of the generated wildlife-presence summary (see scripts/build-wildlife-data.ts). */
export interface WildlifeData {
  generatedAt: string;
  turtles: {
    species: string;
    source: string;
    years: string;
    records: number;
    /** Records within 2 and 10 km of the reference site, and the nearest one (km). */
    within2km: number;
    within10km: number;
    nearestKm: number | null;
  };
  dugongs: {
    species: string;
    source: string;
    records: number;
    nearestKm: number | null;
  };
}
