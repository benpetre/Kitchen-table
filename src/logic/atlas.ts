import countriesJson from '../data/countries.json';

export interface Country {
  code: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  path: string;
}

export const COUNTRIES = countriesJson as Country[];
export const countryByCode = (code: string) => COUNTRIES.find((c) => c.code === code);

export const ATLAS_GUESSES = 6;
const RAD = Math.PI / 180;
const EARTH_KM = 6371;
const HALF_WORLD_KM = 20015;

export function distanceKm(a: Country, b: Country): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ARROWS = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/** Which way to travel from `from` to reach `to` (initial great-circle bearing, to the nearest of 8 directions). */
export function direction(from: Country, to: Country): { arrow: string; word: string } {
  const y = Math.sin((to.lon - from.lon) * RAD) * Math.cos(to.lat * RAD);
  const x = Math.cos(from.lat * RAD) * Math.sin(to.lat * RAD) - Math.sin(from.lat * RAD) * Math.cos(to.lat * RAD) * Math.cos((to.lon - from.lon) * RAD);
  const bearing = (Math.atan2(y, x) / RAD + 360) % 360;
  const i = Math.round(bearing / 45) % 8;
  return { arrow: ARROWS[i], word: COMPASS[i] };
}

/** 100 = the country itself, 0 = the far side of the world. */
export function proximity(km: number): number {
  return Math.max(0, Math.round((1 - km / HALF_WORLD_KM) * 100));
}

export const miles = (km: number) => Math.round(km * 0.621371);

const BY_GUESS = [100, 85, 70, 56, 42, 30];

export function atlasPoints(solvedIn: number | null, bestProximity: number): number {
  return solvedIn == null ? Math.round(bestProximity * 0.2) : BY_GUESS[solvedIn - 1];
}

export function searchCountries(text: string, exclude: string[]): Country[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const open = COUNTRIES.filter((c) => !exclude.includes(c.code));
  const starts = open.filter((c) => c.name.toLowerCase().startsWith(q));
  const inside = open.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
  return [...starts, ...inside].slice(0, 6);
}
