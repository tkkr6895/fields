#!/usr/bin/env python3
"""Pack Tessera RGB fingerprints for the Sulya trial AOI.

Downloads embedding bands 30/60/90 (not the 128-d tensor), stretches them to
PNG, and writes public/data/tessera/ so the phone can overlay one 0.1° tile.
"""
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "tessera"
PREVIEWS = OUT / "previews"
CACHE = Path("/tmp/geotessera-cache")
DOWNLOAD = Path("/tmp/tessera-sulya")
YEAR = 2024
# Sulya trial landscape (public/data/sample-sulya-aoi.geojson)
BBOX = "75.32,12.52,75.48,12.62"
BANDS = "30,60,90"


def tile_center(coord: float) -> float:
    return math.floor(coord * 10) / 10 + 0.05


def main() -> int:
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    for old in PREVIEWS.glob("*"):
        old.unlink()
    CACHE.mkdir(parents=True, exist_ok=True)
    DOWNLOAD.mkdir(parents=True, exist_ok=True)

    geotessera = str(Path(sys.executable).parent / "geotessera")
    cmd = [
        geotessera, "download",
        "--bbox", BBOX,
        "--year", str(YEAR),
        "--bands", BANDS,
        "--cache-dir", str(CACHE),
        "-o", str(DOWNLOAD),
        "-v",
    ]
    existing = list((DOWNLOAD / "global_0.1_degree_representation").rglob("*_2024.tiff"))
    if existing:
        print("using existing GeoTIFFs in", DOWNLOAD)
    else:
        print(" ".join(cmd), flush=True)
        subprocess.check_call(cmd)

    try:
        import numpy as np
        from PIL import Image
        import rasterio
    except ImportError as exc:
        print("Need numpy, pillow, rasterio in this Python:", exc)
        return 1

    tiles = []
    tiffs = list((DOWNLOAD / "global_0.1_degree_representation").rglob("*_2024.tiff"))
    if not tiffs:
        print("No embedding GeoTIFFs downloaded", file=sys.stderr)
        return 1

    for tiff in tiffs:
        name = tiff.name  # grid_75.35_12.55_2024.tiff
        parts = name.replace(".tiff", "").split("_")
        if len(parts) < 4:
            continue
        lon, lat = float(parts[1]), float(parts[2])
        tile_id = f"grid_{lon:.2f}_{lat:.2f}"
        with rasterio.open(tiff) as src:
            if src.count < 3 or src.width < 64:
                continue
            from rasterio.warp import transform_bounds
            west, south, east, north = transform_bounds(src.crs, "EPSG:4326", *src.bounds, densify_pts=21)
            data = src.read(indexes=[1, 2, 3])
        rgb = np.transpose(data[:3], (1, 2, 0)).astype("float64")
        # Downsample to a phone-safe fingerprint (~512 px)
        max_side = 512
        step = max(1, int(math.ceil(max(rgb.shape[0], rgb.shape[1]) / max_side)))
        rgb = rgb[::step, ::step]
        out = np.zeros((*rgb.shape[:2], 3), dtype="uint8")
        for i in range(min(3, rgb.shape[2])):
            band = rgb[:, :, i]
            lo, hi = np.nanpercentile(band, 2), np.nanpercentile(band, 98)
            span = (hi - lo) or 1.0
            out[:, :, i] = np.clip((band - lo) / span * 255.0, 0, 255).astype("uint8")
        path = PREVIEWS / f"{tile_id}_{YEAR}.jpg"
        Image.fromarray(out, mode="RGB").save(path, format="JPEG", quality=78, optimize=True)
        tiles.append({
            "tileId": tile_id,
            "year": YEAR,
            "bounds": {
                "west": west,
                "east": east,
                "south": south,
                "north": north,
            },
            "path": f"/data/tessera/previews/{path.name}",
        })
        print("wrote", path, path.stat().st_size, "bytes", "wgs84", round(west, 4), round(south, 4), round(east, 4), round(north, 4))

    manifest = {
        "year": YEAR,
        "representation": "embedding_bands_30_60_90_rgb",
        "note": "Similar colour ≈ similar landscape. Not a land-cover legend. One 0.1° Tessera tile at a time.",
        "region": "Sulya, Dakshina Kannada, Karnataka",
        "bbox": BBOX,
        "tiles": tiles,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("manifest", len(tiles), "tiles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
