# Western Ghats Field Observation Data

This directory contains field observation data collected during land cover classification validation in the Western Ghats, Karnataka, India.

## Data Collection Period
- **Dates**: December 29-30, 2025
- **Region**: Western Ghats, Karnataka (Dakshina Kannada / Chikkamagaluru districts)
- **Purpose**: Validation of satellite-derived land cover classifications

## Files

### Public (committed to GitHub)
| File | Description |
|------|-------------|
| `observations_public.json` | Sanitized JSON with coordinates and validation notes |
| `observations.geojson` | GeoJSON format for GIS software (QGIS, ArcGIS) |
| `observations.csv` | CSV format for spreadsheet analysis |

### Private (local only, gitignored)
| File | Description |
|------|-------------|
| `raw_export.json` | Original export with device metadata |
| `observations_clean.json` | Intermediate processed file |
| `../recovered-photos/` | Original field photos |

## Summary Statistics
- **Total Observations**: 8
- **Validations Match**: 6 (75%)
- **Validations Mismatch**: 2 (25%)
- **Average GPS Accuracy**: 2.17 meters

## Observation Locations

| # | Date | Latitude | Longitude | Validation | Notes |
|---|------|----------|-----------|------------|-------|
| 1 | 2025-12-29 | 12.9824976 | 75.5724675 | match | - |
| 2 | 2025-12-30 | 13.1508333 | 75.4255233 | mismatch | Plantation classified as forest |
| 3 | 2025-12-29 | 12.9780622 | 75.5684250 | match | - |
| 4 | 2025-12-30 | 13.1382720 | 75.4095324 | match | Forest at edge of plantation |
| 5 | 2025-12-29 | 13.0834217 | 75.6002867 | match | Plantation |
| 6 | 2025-12-30 | 13.1406159 | 75.4096739 | match | - |
| 7 | 2025-12-29 | 12.9800524 | 75.5653473 | match | - |
| 8 | 2025-12-29 | 13.1612519 | 75.4465582 | mismatch | Plantation classified as forest |

## Usage

### Import to QGIS
1. Layer → Add Layer → Add Vector Layer
2. Select `observations.geojson`

### Import to Google Earth
1. Open Google Earth Pro
2. File → Import → Select `observations.csv`
3. Map latitude/longitude columns

## License
This field data is provided for research purposes under the same license as the parent repository.
