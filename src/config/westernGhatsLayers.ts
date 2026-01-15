/**
 * Western Ghats Layer Configuration
 * 
 * Synthesized list of layers critical for Western Ghats field validation.
 * These are the layers that return valid, meaningful data from CoreStack APIs.
 */

/**
 * Critical layer types for Western Ghats field work.
 * These represent the core thematic areas for biodiversity hotspot monitoring.
 */
export const WESTERN_GHATS_CRITICAL_LAYERS = [
  // Hydrology - Critical for watershed health
  'Drainage',
  'SOGE',           // Slope/geology/elevation
  'MWS',            // Micro-watershed boundaries
  'Waterbody',
  'Streams',
  
  // Land Use - Essential for LULC validation
  'Cropping Intensity',
  'Cropping Pattern',
  'Kharif Crops',
  'Rabi Crops',
  'Single Cropped',
  'Double Cropped',
  
  // Settlements & Infrastructure
  'Settlement',
  'Village Boundary',
  'Roads',
  
  // Conservation Critical
  'Forest',
  'Plantation',
  'Scrub',
  'Grassland',
  
  // Water Resources
  'Wells',
  'Tanks',
  'Check Dams',
  'Farm Ponds',
  'NREGA Assets',
] as const;

/**
 * Layer name patterns that should be retained (case-insensitive matching)
 */
export const LAYER_NAME_PATTERNS = [
  /drainage/i,
  /soge/i,
  /mws/i,
  /water/i,
  /stream/i,
  /cropping/i,
  /crop/i,
  /kharif/i,
  /rabi/i,
  /settlement/i,
  /village/i,
  /forest/i,
  /plantation/i,
  /scrub/i,
  /grass/i,
  /well/i,
  /tank/i,
  /dam/i,
  /pond/i,
  /nrega/i,
  /aquifer/i,
  /slope/i,
  /elevation/i,
  /soil/i,
  /rainfall/i,
  /runoff/i,
  /et/i,              // Evapotranspiration
  /lulc/i,
  /land.*use/i,
  /land.*cover/i,
];

/**
 * Properties that are meaningful and should be displayed on feature click.
 * Properties not in this list (or matching patterns) will be filtered out.
 */
export const MEANINGFUL_PROPERTY_PATTERNS = [
  // Identifiers
  /^uid$/i,
  /^mws_?id$/i,
  /^mws_?uid$/i,
  /^name$/i,
  /^village/i,
  /^tehsil/i,
  /^block/i,
  /^district/i,
  /^state/i,
  
  // Area/Size
  /area/i,
  /hectare/i,
  /ha$/i,
  /sq_?m/i,
  /sq_?km/i,
  /size/i,
  
  // Water/Hydrology
  /water/i,
  /drainage/i,
  /stream/i,
  /order/i,
  /catchment/i,
  /runoff/i,
  /precipitation/i,
  /rainfall/i,
  /storage/i,
  
  // Cropping
  /crop/i,
  /kharif/i,
  /rabi/i,
  /intensity/i,
  /single.*crop/i,
  /double.*crop/i,
  /triple.*crop/i,
  /cropped/i,
  
  // Geology/Terrain
  /slope/i,
  /elevation/i,
  /aquifer/i,
  /soil/i,
  /geology/i,
  /terrain/i,
  
  // Classification
  /class$/i,
  /category/i,
  /type$/i,
  /^type_/i,
  /status/i,
  
  // Conservation
  /forest/i,
  /vegetation/i,
  /ndvi/i,
  /green/i,
  
  // Assets
  /nrega/i,
  /asset/i,
  /structure/i,
  /count$/i,
  /total/i,
];

/**
 * Properties that should always be excluded (noise/internal fields)
 */
export const EXCLUDED_PROPERTY_PATTERNS = [
  /^fid$/i,
  /^objectid/i,
  /^shape/i,
  /^geometry/i,
  /^gml/i,
  /^ogc/i,
  /^layer$/i,
  /^source$/i,
  /^created/i,
  /^modified/i,
  /^timestamp$/i,
  /^version$/i,
  /^index$/i,
  /^id$/i,
  /^_/,           // Internal fields starting with underscore
  /unique_id/i,   // Often null/unhelpful
  /census_id/i,   // Often null
];

/**
 * Check if a layer name is critical for Western Ghats work
 */
export function isWesternGhatsCriticalLayer(layerName: string): boolean {
  const name = layerName.toLowerCase().trim();
  return LAYER_NAME_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Check if a property is meaningful for display
 */
export function isMeaningfulProperty(propertyName: string, value: unknown): boolean {
  // Exclude null, undefined, empty strings, or just dashes
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && (value.trim() === '' || value.trim() === '-' || value.trim() === 'NA')) return false;
  if (typeof value === 'number' && Number.isNaN(value)) return false;
  
  // Exclude internal/noise fields
  if (EXCLUDED_PROPERTY_PATTERNS.some(pattern => pattern.test(propertyName))) {
    return false;
  }
  
  // Include if matches meaningful patterns
  return MEANINGFUL_PROPERTY_PATTERNS.some(pattern => pattern.test(propertyName));
}

/**
 * Filter properties to only include meaningful ones
 */
export function filterMeaningfulProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(properties)) {
    if (isMeaningfulProperty(key, value)) {
      filtered[key] = value;
    }
  }
  
  return filtered;
}

/**
 * Format a property value for display
 */
export function formatPropertyValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-';
  
  if (typeof value === 'number') {
    // Check if it's a percentage-like field
    if (/percent|intensity|ratio/i.test(key)) {
      return `${value.toFixed(1)}%`;
    }
    // Check if it's an area field
    if (/area|ha|hectare/i.test(key)) {
      return `${value.toFixed(2)} ha`;
    }
    // Check if it's a count
    if (/count|total|number/i.test(key)) {
      return value.toLocaleString();
    }
    // General number formatting
    if (Number.isInteger(value)) {
      return value.toLocaleString();
    }
    return value.toFixed(2);
  }
  
  if (typeof value === 'string') {
    // Truncate long strings
    if (value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return value;
  }
  
  if (typeof value === 'object') {
    // Don't display complex objects inline
    return '[Object]';
  }
  
  return String(value);
}

/**
 * Get a human-readable label for a property key
 */
export function getPropertyLabel(key: string): string {
  // Convert snake_case and camelCase to Title Case
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}
