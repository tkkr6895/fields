#!/usr/bin/env python3
"""
Generate offline Dynamic World grid data for the Field Validator app.

This script queries Google Earth Engine to create a grid of land cover
classifications that can be bundled with the app for offline use.

Prerequisites:
1. Install earthengine-api: pip install earthengine-api
2. Authenticate: earthengine authenticate
3. Have a GEE project configured

Usage:
    python generate-dw-grid.py --bounds 8.0,72.5,21.5,78.5 --resolution 100 --output ../public/data/dynamicworld/

The bounds are: south,west,north,east (latitude/longitude)
Resolution is in meters (100m = ~3MB for Western Ghats, 500m = ~100KB)
"""

import argparse
import json
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Tuple

try:
    import ee
except ImportError:
    print("ERROR: earthengine-api not installed. Run: pip install earthengine-api")
    exit(1)

# Dynamic World class names (matching the app's DW_CLASSES)
DW_CLASS_NAMES = [
    'Water',
    'Trees', 
    'Grass',
    'Flooded Vegetation',
    'Crops',
    'Shrub and Scrub',
    'Built',
    'Bare',
    'Snow and Ice'
]


def initialize_ee(project: str = None):
    """Initialize Earth Engine with authentication."""
    try:
        if project:
            ee.Initialize(project=project)
        else:
            ee.Initialize()
        print("[OK] Earth Engine initialized")
    except Exception as e:
        print(f"ERROR: Failed to initialize Earth Engine: {e}")
        print("Run 'earthengine authenticate' first")
        exit(1)


def get_recent_dw_composite(bounds: ee.Geometry, days_back: int = 90) -> ee.Image:
    """
    Get a recent Dynamic World composite for the given bounds.
    Uses mode (most common class) over the time period for stability.
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    
    dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1') \
        .filterBounds(bounds) \
        .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')) \
        .select('label')
    
    # Get mode (most frequent class) for stability
    composite = dw.mode().rename('label')
    
    # Also get mean probabilities for confidence
    prob_bands = ['water', 'trees', 'grass', 'flooded_vegetation', 'crops', 
                  'shrub_and_scrub', 'built', 'bare', 'snow_and_ice']
    
    dw_probs = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1') \
        .filterBounds(bounds) \
        .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d')) \
        .select(prob_bands)
    
    mean_probs = dw_probs.mean()
    
    return composite.addBands(mean_probs)


def generate_grid_points(bounds: Tuple[float, float, float, float], 
                         resolution_m: float) -> List[Tuple[float, float]]:
    """
    Generate a grid of points within the bounds at the specified resolution.
    
    Args:
        bounds: (south, west, north, east) in degrees
        resolution_m: Grid spacing in meters
        
    Returns:
        List of (lat, lon) tuples
    """
    south, west, north, east = bounds
    
    # Convert meters to approximate degrees (at mid-latitude)
    mid_lat = (south + north) / 2
    meters_per_degree_lat = 111320  # roughly constant
    meters_per_degree_lon = 111320 * abs(cos_deg(mid_lat))
    
    lat_step = resolution_m / meters_per_degree_lat
    lon_step = resolution_m / meters_per_degree_lon
    
    points = []
    lat = south
    while lat <= north:
        lon = west
        while lon <= east:
            points.append((lat, lon))
            lon += lon_step
        lat += lat_step
    
    return points


def cos_deg(degrees: float) -> float:
    """Cosine of angle in degrees."""
    import math
    return math.cos(math.radians(degrees))


def sample_dw_at_points(dw_image: ee.Image, points: List[Tuple[float, float]], 
                        batch_size: int = 500, scale: int = 100) -> List[Dict[str, Any]]:
    """
    Sample Dynamic World data at the given points.
    Uses batching to avoid GEE limits.
    
    Args:
        dw_image: EE image with label + probability bands
        points: List of (lat, lon) tuples
        batch_size: Points per GEE request (500 works well)
        scale: Sampling scale in meters (use grid resolution or 100m min)
    """
    results = []
    total_batches = (len(points) - 1) // batch_size + 1
    failed_batches = 0
    
    for i in range(0, len(points), batch_size):
        batch = points[i:i + batch_size]
        batch_num = i // batch_size + 1
        print(f"  Processing batch {batch_num}/{total_batches} ({len(batch)} points)...", end='', flush=True)
        
        # Create feature collection from points
        features = [ee.Feature(ee.Geometry.Point([lon, lat])) for lat, lon in batch]
        fc = ee.FeatureCollection(features)
        
        # Sample the image at all points
        # Use grid-appropriate scale (not native 10m) to avoid memory issues
        sampled = dw_image.sampleRegions(
            collection=fc,
            scale=scale,
            geometries=True
        )
        
        # Get the results with retry
        max_retries = 3
        for attempt in range(max_retries):
            try:
                batch_results = sampled.getInfo()
                
                batch_count = 0
                for feature in batch_results['features']:
                    props = feature['properties']
                    coords = feature['geometry']['coordinates']
                    
                    if props.get('label') is not None:
                        class_id = int(props['label'])
                        
                        # Get probabilities
                        probs = [
                            props.get('water', 0),
                            props.get('trees', 0),
                            props.get('grass', 0),
                            props.get('flooded_vegetation', 0),
                            props.get('crops', 0),
                            props.get('shrub_and_scrub', 0),
                            props.get('built', 0),
                            props.get('bare', 0),
                            props.get('snow_and_ice', 0)
                        ]
                        
                        # Confidence is the probability of the dominant class
                        confidence = max(probs) if probs else 0.5
                        
                        results.append({
                            'lat': round(coords[1], 6),
                            'lon': round(coords[0], 6),
                            'classId': class_id,
                            'confidence': round(confidence, 3),
                            'probs': [round(p, 3) for p in probs]
                        })
                        batch_count += 1
                
                print(f" OK {batch_count} samples")
                break  # Success, exit retry loop
                
            except Exception as e:
                if attempt < max_retries - 1:
                    import time
                    wait = 2 ** (attempt + 1)
                    print(f" retry ({attempt+1})...", end='', flush=True)
                    time.sleep(wait)
                else:
                    print(f" FAIL: {e}")
                    failed_batches += 1
    
    if failed_batches > 0:
        print(f"  Warning: {failed_batches}/{total_batches} batches failed")
    
    return results


def main():
    parser = argparse.ArgumentParser(
        description='Generate offline Dynamic World grid data for Field Validator app'
    )
    parser.add_argument(
        '--bounds', 
        type=str, 
        default='8.0,72.5,21.5,78.5',
        help='Bounds as south,west,north,east (default: Western Ghats)'
    )
    parser.add_argument(
        '--resolution', 
        type=int, 
        default=500,
        help='Grid resolution in meters (default: 500m, use 100m for higher detail)'
    )
    parser.add_argument(
        '--output', 
        type=str, 
        default='../public/data/dynamicworld/',
        help='Output directory'
    )
    parser.add_argument(
        '--project',
        type=str,
        default=None,
        help='GEE project ID (optional)'
    )
    parser.add_argument(
        '--days',
        type=int,
        default=90,
        help='Days back for composite (default: 90)'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=500,
        help='Points per GEE batch request (default: 500)'
    )
    
    args = parser.parse_args()
    
    # Parse bounds
    bounds = tuple(map(float, args.bounds.split(',')))
    if len(bounds) != 4:
        print("ERROR: Bounds must be 4 values: south,west,north,east")
        exit(1)
    
    south, west, north, east = bounds
    print(f"\n=== Dynamic World Grid Generator ===")
    print(f"Bounds: {south}N to {north}N, {west}E to {east}E")
    print(f"Resolution: {args.resolution}m")
    print(f"Output: {args.output}")
    
    # Initialize Earth Engine
    initialize_ee(args.project)
    
    # Create bounds geometry
    ee_bounds = ee.Geometry.Rectangle([west, south, east, north])
    
    # Generate grid points
    print(f"\n=> Generating grid points...")
    points = generate_grid_points(bounds, args.resolution)
    print(f"  Generated {len(points)} points")
    
    # Get DW composite
    print(f"\n=> Fetching Dynamic World composite (last {args.days} days)...")
    dw_image = get_recent_dw_composite(ee_bounds, args.days)
    
    # Sample at points
    print(f"\n=> Sampling land cover at grid points...")
    # Use resolution-appropriate scale (min 100m for efficiency, max grid resolution)
    sample_scale = max(100, min(args.resolution, 1000))
    print(f"  Sampling scale: {sample_scale}m, batch size: {args.batch_size}")
    grid_data = sample_dw_at_points(dw_image, points, batch_size=args.batch_size, scale=sample_scale)
    print(f"  Got {len(grid_data)} valid samples")
    
    # Create output directory
    os.makedirs(args.output, exist_ok=True)
    
    # Write manifest
    manifest = {
        'version': '1.0.0',
        'timestamp': datetime.now().isoformat() + 'Z',
        'bounds': {
            'north': north,
            'south': south,
            'east': east,
            'west': west
        },
        'resolution': args.resolution,
        'cellCount': len(grid_data),
        'year': datetime.now().year,
        'compositeDays': args.days
    }
    
    manifest_path = os.path.join(args.output, 'grid-manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"\n[OK] Wrote manifest: {manifest_path}")
    
    # Write grid data (compact format to save space)
    data_path = os.path.join(args.output, 'grid-data.json')
    with open(data_path, 'w') as f:
        json.dump(grid_data, f, separators=(',', ':'))
    
    # Calculate file size
    size_kb = os.path.getsize(data_path) / 1024
    print(f"[OK] Wrote grid data: {data_path} ({size_kb:.1f} KB)")
    
    # Summary stats
    print(f"\n=== Summary ===")
    print(f"Total points: {len(grid_data)}")
    
    # Class distribution
    class_counts = {}
    for cell in grid_data:
        class_name = DW_CLASS_NAMES[cell['classId']] if cell['classId'] < len(DW_CLASS_NAMES) else 'Unknown'
        class_counts[class_name] = class_counts.get(class_name, 0) + 1
    
    print(f"\nClass distribution:")
    for class_name, count in sorted(class_counts.items(), key=lambda x: -x[1]):
        pct = 100 * count / len(grid_data)
        print(f"  {class_name}: {count} ({pct:.1f}%)")
    
    print(f"\n[OK] Done! Grid data ready for offline use.")


if __name__ == '__main__':
    main()
