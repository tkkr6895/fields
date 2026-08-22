#!/usr/bin/env python3
"""Optional Tessera point sampler for Fields.

Tessera tiles are ~0.1° × 128-band and are not suitable to stream onto a phone.
This small HTTP server:

  GET /health
  GET /point?lat=&lon=&year=2024

Always returns the Tessera tile id for the coordinate. If `geotessera` is
installed and embeddings are cached/downloadable, it also returns a short
embedding preview and a PCA RGB fingerprint.

Run:  python3 server/tessera-proxy.py
Port: TESSERA_PORT (default 8788)
"""
from __future__ import annotations

import json
import math
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("TESSERA_PORT", "8788"))
YEAR_DEFAULT = int(os.environ.get("TESSERA_YEAR", "2024"))


def tile_center(coord: float) -> float:
    return math.floor(coord * 10) / 10 + 0.05


def tile_for(lat: float, lon: float, year: int) -> dict:
    tlon = round(tile_center(lon), 2)
    tlat = round(tile_center(lat), 2)
    return {
        "year": year,
        "tileLon": tlon,
        "tileLat": tlat,
        "tileId": f"grid_{tlon:.2f}_{tlat:.2f}",
        "bounds": {
            "west": tlon - 0.05,
            "east": tlon + 0.05,
            "south": tlat - 0.05,
            "north": tlat + 0.05,
        },
    }


def sample_embedding(lat: float, lon: float, year: int) -> dict:
    extra: dict = {}
    try:
        from geotessera import GeoTessera  # type: ignore
        import numpy as np  # type: ignore

        gt = GeoTessera()
        embedding, _crs, _transform = gt.fetch_embedding(lon=lon, lat=lat, year=year)
        arr = np.asarray(embedding)
        extra["embeddingDim"] = int(arr.shape[-1]) if arr.ndim >= 1 else None
        flat = arr.reshape(-1, arr.shape[-1]) if arr.ndim >= 2 else arr.reshape(1, -1)
        # Centre-ish pixel: mean of finite rows as a stable fingerprint
        vec = np.nanmean(flat.astype("float64"), axis=0)
        extra["embeddingPreview"] = [float(x) for x in vec[:16].tolist()]
        rgb = vec[:3]
        if rgb.size == 3:
            mn, mx = float(np.nanmin(rgb)), float(np.nanmax(rgb))
            span = (mx - mn) or 1.0
            extra["pcaRgb"] = [int(max(0, min(255, round((float(v) - mn) / span * 255)))) for v in rgb]
        extra["coverage"] = "sampled"
        extra["note"] = "Sampled via geotessera (tile mean of first bands as RGB stand-in)."
    except Exception as exc:  # noqa: BLE001 — optional dependency
        extra["coverage"] = "tile_known"
        extra["note"] = f"Tile id only (install geotessera to sample embeddings): {exc}"
    return extra


def preview_png(lat: float, lon: float, year: int):
    """RGB fingerprint of one Tessera tile: embedding bands 30, 60, 90 stretched to PNG."""
    try:
        from geotessera import GeoTessera  # type: ignore
        import numpy as np  # type: ignore
        from PIL import Image  # type: ignore

        gt = GeoTessera()
        embedding, _crs, _transform = gt.fetch_embedding(lon=lon, lat=lat, year=year)
        arr = np.asarray(embedding)
        if arr.ndim < 3 or arr.shape[-1] < 91:
            return None
        rgb = arr[:, :, [30, 60, 90]].astype("float64")
        step = max(1, max(rgb.shape[0], rgb.shape[1]) // 640)
        rgb = rgb[::step, ::step]
        out = np.zeros((*rgb.shape[:2], 3), dtype="uint8")
        for i in range(3):
            band = rgb[:, :, i]
            lo, hi = np.nanpercentile(band, 2), np.nanpercentile(band, 98)
            span = (hi - lo) or 1.0
            out[:, :, i] = np.clip((band - lo) / span * 255.0, 0, 255).astype("uint8")
        from io import BytesIO

        buf = BytesIO()
        Image.fromarray(out, mode="RGB").save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception as exc:  # noqa: BLE001
        print("[tessera-proxy] preview failed:", exc)
        return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        print("[tessera-proxy]", fmt % args)

    def _send(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path in ("/health", "/"):
            self._send(200, {"ok": True, "service": "fields-tessera-proxy"})
            return
        if parsed.path == "/preview":
            q = parse_qs(parsed.query)
            try:
                lat = float(q["lat"][0])
                lon = float(q["lon"][0])
            except (KeyError, ValueError, IndexError):
                self._send(400, {"error": "lat and lon are required"})
                return
            year = int(q.get("year", [YEAR_DEFAULT])[0])
            png = preview_png(lat, lon, year)
            if not png:
                self._send(404, {"error": "preview unavailable"})
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("X-Tessera-Representation", "embedding_bands_30_60_90_rgb")
            self.send_header("Content-Length", str(len(png)))
            self.end_headers()
            self.wfile.write(png)
            return
        if parsed.path != "/point":
            self._send(404, {"error": "not found"})
            return
        q = parse_qs(parsed.query)
        try:
            lat = float(q["lat"][0])
            lon = float(q["lon"][0])
        except (KeyError, ValueError, IndexError):
            self._send(400, {"error": "lat and lon are required"})
            return
        year = int(q.get("year", [YEAR_DEFAULT])[0])
        payload = tile_for(lat, lon, year)
        payload.update(sample_embedding(lat, lon, year))
        self._send(200, payload)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[tessera-proxy] listening on http://0.0.0.0:{PORT}")
    server.serve_forever()
