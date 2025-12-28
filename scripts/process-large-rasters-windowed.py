#!/usr/bin/env python3
"""
Generate Web-Ready Images for Large Rasters using windowed reading.

This script handles the large Western Ghats-wide rasters (plantations, forest typology, etc.)
by using rasterio's windowed reading to avoid memory issues.
"""

import os
import subprocess
import sys
import json
from pathlib import Path

# Install dependencies if needed
try:
    import rasterio
    from rasterio.warp import calculate_default_transform, reproject, Resampling
    from rasterio.windows import Window
    from rasterio.crs import CRS
    from PIL import Image
    import numpy as np
except ImportError:
    print("Installing required packages...")
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'rasterio', 'pillow', 'numpy'], capture_output=True)
    import rasterio
    from rasterio.warp import calculate_default_transform, reproject, Resampling
    from rasterio.windows import Window
    from rasterio.crs import CRS
    from PIL import Image
    import numpy as np

WORKSPACE = Path(r"c:\Users\trkumar\OneDrive - Deloitte (O365D)\Documents\Research\Western Ghats")
OUTPUT_DIR = WORKSPACE / "field-validator-app" / "public" / "tiles" / "images"

# Large raster layers that need special handling
LARGE_LAYERS = [
    {
        'id': 'plantations',
        'title': 'Plantations (All)',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "plantations_all_20251214_121720.tif",
        'category': 'forest',
        'description': 'All identified plantation areas across Western Ghats',
        'color': (154, 205, 50, 180)  # Yellow-green RGBA
    },
    {
        'id': 'natural_forest_80',
        'title': 'Natural Forest (80% confidence)',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "natural_forest_high_conf_80pct_20251214_121720.tif",
        'category': 'forest',
        'description': 'Natural forest with 80%+ confidence',
        'color': (0, 100, 0, 180)  # Dark green
    },
    {
        'id': 'natural_forest_52',
        'title': 'Natural Forest (52% threshold)',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "natural_forest_threshold_52pct_20251214_121720.tif",
        'category': 'forest',
        'description': 'Natural forest at 52% threshold',
        'color': (34, 139, 34, 180)  # Forest green
    },
    {
        'id': 'old_growth',
        'title': 'Old Growth Forest',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "old_growth_natural_forest_20251214_121720.tif",
        'category': 'forest',
        'description': 'Identified old growth natural forest',
        'color': (0, 77, 0, 180)  # Very dark green
    },
    {
        'id': 'forest_typology',
        'title': 'Forest Typology Composite',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "forest_typology_composite_20251214_121720.tif",
        'category': 'forest',
        'description': 'Composite forest classification: 1=Natural High, 2=Natural Low, 3=Plantation, 4=Other',
        'colors': {
            1: (0, 100, 0, 180),    # Natural forest high conf - dark green
            2: (34, 139, 34, 180),   # Natural forest low conf - forest green
            3: (154, 205, 50, 180),  # Plantation - yellow-green
            4: (144, 238, 144, 180)  # Other forest - light green
        }
    },
]


def process_large_raster(layer, output_dir, target_size=4096):
    """Process a large raster using downsampling and chunked processing"""
    source = layer['source']
    output = output_dir / f"{layer['id']}.png"
    
    print(f"\nProcessing: {layer['title']}")
    print(f"  Source: {source}")
    
    if not source.exists():
        print(f"  [X] Source file not found")
        return None
    
    try:
        with rasterio.open(source) as src:
            # Get source info
            src_width = src.width
            src_height = src.height
            print(f"  Original size: {src_width} x {src_height}")
            print(f"  CRS: {src.crs}")
            
            # Calculate output size (maintain aspect ratio, max dimension = target_size)
            aspect = src_width / src_height
            if src_width > src_height:
                out_width = target_size
                out_height = int(target_size / aspect)
            else:
                out_height = target_size
                out_width = int(target_size * aspect)
            
            print(f"  Output size: {out_width} x {out_height}")
            
            # Calculate decimation factors
            dec_x = src_width / out_width
            dec_y = src_height / out_height
            
            # Read the data with downsampling (using out_shape for efficient reading)
            print("  Reading with downsampling...")
            data = src.read(
                1,
                out_shape=(out_height, out_width),
                resampling=Resampling.nearest
            )
            
            print(f"  Data shape: {data.shape}")
            print(f"  Unique values: {np.unique(data)[:10]}...")
            
            # Create RGBA image
            rgba = np.zeros((out_height, out_width, 4), dtype=np.uint8)
            
            # Apply colors
            if 'colors' in layer:
                # Multi-class
                for value, color in layer['colors'].items():
                    mask = data == value
                    rgba[mask] = color
            else:
                # Binary mask
                color = layer['color']
                mask = data == 1
                rgba[mask] = color
            
            # Create PIL image
            img = Image.fromarray(rgba, 'RGBA')
            img.save(output, 'PNG', optimize=True)
            
            # Get bounds in WGS84
            bounds = src.bounds
            if src.crs != CRS.from_epsg(4326):
                bounds = rasterio.warp.transform_bounds(src.crs, CRS.from_epsg(4326), *bounds)
            
            print(f"  [OK] Created: {output.name}")
            
            return {
                'id': layer['id'],
                'title': layer['title'],
                'category': layer['category'],
                'year': layer.get('year'),
                'description': layer['description'],
                'image_path': f'/tiles/images/{layer["id"]}.png',
                'bounds': {
                    'west': bounds[0],
                    'south': bounds[1],
                    'east': bounds[2],
                    'north': bounds[3]
                }
            }
            
    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    print("=" * 60)
    print("Large Raster Processing (Windowed)")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    results = []
    for layer in LARGE_LAYERS:
        result = process_large_raster(layer, OUTPUT_DIR)
        if result:
            results.append(result)
    
    print(f"\n[OK] Processed {len(results)} / {len(LARGE_LAYERS)} layers")
    
    # Update manifest with new layers
    manifest_path = OUTPUT_DIR / 'image-manifest.json'
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        manifest = {'version': '1.0', 'layers': []}
    
    # Add new layers (avoiding duplicates)
    existing_ids = {l['id'] for l in manifest['layers']}
    for result in results:
        if result['id'] not in existing_ids:
            manifest['layers'].append(result)
        else:
            # Update existing
            for i, l in enumerate(manifest['layers']):
                if l['id'] == result['id']:
                    manifest['layers'][i] = result
                    break
    
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    print(f"\nManifest updated: {manifest_path}")
    print(f"Total layers in manifest: {len(manifest['layers'])}")


if __name__ == '__main__':
    main()
