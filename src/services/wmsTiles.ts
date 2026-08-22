/** Convert MapLibre XYZ tile requests into WMS GetMap URLs (EPSG:3857 bbox). */

const ORIGIN = 20037508.342789244;

export function xyzToEpsg3857Bbox(x: number, y: number, z: number): string {
  const n = 2 ** z;
  const tile = (ORIGIN * 2) / n;
  const minX = -ORIGIN + x * tile;
  const maxX = minX + tile;
  const maxY = ORIGIN - y * tile;
  const minY = maxY - tile;
  return `${minX},${minY},${maxX},${maxY}`;
}

const DUMMY_HOST = 'fields-wms.invalid';

/** MapLibre raster tile URL that transformRequest turns into a WMS GetMap. */
export function maplibreWmsTileUrl(wmsTemplateWithBbox: string): string {
  return `https://${DUMMY_HOST}/{z}/{x}/{y}?t=${encodeURIComponent(wmsTemplateWithBbox)}`;
}

export function isWmsBboxTemplate(path: string): boolean {
  return path.includes('{bbox-epsg-3857}') || path.includes(DUMMY_HOST);
}

export function resolveWmsTileUrl(requestUrl: string): string | null {
  if (!requestUrl.includes(DUMMY_HOST) && !requestUrl.includes('{bbox-epsg-3857}')) return null;
  try {
    const u = new URL(requestUrl);
    const parts = u.pathname.replace(/^\//, '').split('/');
    const z = Number(parts[0]);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const template = u.searchParams.get('t') || '';
    if (!template || !Number.isFinite(z)) return null;
    return template.replace('{bbox-epsg-3857}', xyzToEpsg3857Bbox(x, y, z));
  } catch {
    return null;
  }
}
