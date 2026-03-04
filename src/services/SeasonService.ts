/**
 * SeasonService — Derives Indian meteorological season from a timestamp.
 *
 * Indian Meteorological Department seasons (used in ecological studies):
 *   Summer:       March – May
 *   Monsoon:      June – September
 *   Post Monsoon: October – November
 *   Winter:       December – February
 *
 * Task 1.2.3
 */

import type { Season } from '../types';

/**
 * Derive the Indian meteorological season from a date string or timestamp.
 * Falls back to 'monsoon' if the input is unparseable.
 */
export function deriveSeason(dateInput: string | number | Date): Season {
  let date: Date;

  if (dateInput instanceof Date) {
    date = dateInput;
  } else if (typeof dateInput === 'number') {
    date = new Date(dateInput);
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) {
    console.warn('deriveSeason: invalid date input, defaulting to monsoon', dateInput);
    return 'monsoon';
  }

  const month = date.getMonth(); // 0-indexed: Jan = 0

  if (month >= 2 && month <= 4) return 'summer';        // Mar–May
  if (month >= 5 && month <= 8) return 'monsoon';       // Jun–Sep
  if (month >= 9 && month <= 10) return 'post_monsoon'; // Oct–Nov
  return 'winter';                                       // Dec–Feb
}

/**
 * Human-readable label for a Season.
 */
export function seasonLabel(season: Season): string {
  const labels: Record<Season, string> = {
    summer: 'Summer (Mar–May)',
    monsoon: 'Monsoon (Jun–Sep)',
    post_monsoon: 'Post-Monsoon (Oct–Nov)',
    winter: 'Winter (Dec–Feb)',
  };
  return labels[season];
}

/**
 * Get the current season.
 */
export function currentSeason(): Season {
  return deriveSeason(new Date());
}
