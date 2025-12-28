#!/usr/bin/env python3
"""
Generate Web-Ready Raster Tiles for Field Validator App

Converts GeoTIFF raster layers to XYZ PNG tiles for use in MapLibre GL JS.
Creates tiles at appropriate zoom levels for Western Ghats region.

Layers included:
1. LULC (1987, 1992, 1997, 2000, 2005, 2010) - GLC-FCS30D
2. Tree Cover (1992, 1997, 2000, 2005, 2010) - GLC-FCS30D
3. Built Area (1987-2010 GLC, 2018-2025 Dynamic World)
4. Forest Classification:
   - Plantations vs Natural Forest
   - Forest Typology Composite
   - Old Growth Natural Forest
   - Nature Trace Probability

Author: Western Ghats Field Validator
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Optional, Tuple
import math

# Configuration
WORKSPACE = Path(r"c:\Users\trkumar\OneDrive - Deloitte (O365D)\Documents\Research\Western Ghats")
OUTPUT_DIR = WORKSPACE / "field-validator-app" / "public" / "tiles"
TEMP_DIR = WORKSPACE / "field-validator-app" / "temp_tiles"

# Western Ghats bounding box
WG_BOUNDS = {
    'min_lon': 72.5,
    'max_lon': 78.5,
    'min_lat': 8.0,
    'max_lat': 21.5
}

# Zoom levels to generate (8-14 covers district to village level)
ZOOM_LEVELS = [8, 9, 10, 11, 12, 13]

# Color schemes for different layer types
COLOR_SCHEMES = {
    'lulc': {
        # GLC-FCS30D classes (simplified)
        10: '#419BDF',   # Water
        20: '#397D49',   # Trees (evergreen)
        30: '#88B053',   # Shrubland
        40: '#7A87C6',   # Grassland
        50: '#E49635',   # Cropland
        60: '#C4281B',   # Built-up
        70: '#A59B8F',   # Bare/sparse
        80: '#B39FE1',   # Wetland
        90: '#FFFFFF',   # Snow/Ice
        100: '#397D49',  # Forest
    },
    'trees': {
        0: '#F5F5DC',    # No trees (beige)
        1: '#90EE90',    # Light tree cover
        2: '#228B22',    # Medium tree cover  
        3: '#006400',    # Dense tree cover
    },
    'built': {
        0: 'transparent',
        1: '#FFD700',    # Low density (yellow)
        2: '#FF8C00',    # Medium density (orange)
        3: '#FF0000',    # High density (red)
    },
    'forest_class': {
        0: 'transparent',    # Not forest
        1: '#006400',        # Natural forest (dark green)
        2: '#9ACD32',        # Plantation (yellow-green)
        3: '#228B22',        # Mixed/uncertain
    },
    'plantation': {
        0: 'transparent',
        1: '#9ACD32',        # Plantation (yellow-green)
    },
    'old_growth': {
        0: 'transparent',
        1: '#004D00',        # Old growth (very dark green)
    }
}

@dataclass
class RasterLayer:
    """Configuration for a raster layer to be tiled"""
    id: str
    title: str
    source_path: Path
    color_scheme: str
    category: str
    year: Optional[int] = None
    description: str = ""


def get_raster_layers() -> List[RasterLayer]:
    """Define all raster layers to be processed"""
    layers = []
    
    # 1. LULC layers from GLC-FCS30D (1987-2010)
    glc_dir = WORKSPACE / "gdrive_exports" / "Wester Ghats Layers" / "GLC_Western_Ghats_Complete_Analysis"
    for year in [1987, 1992, 1997, 2000, 2005, 2010]:
        tif = glc_dir / f"lulc_{year}_glc-fcs30d.tif"
        if tif.exists():
            layers.append(RasterLayer(
                id=f"lulc_glc_{year}",
                title=f"LULC {year} (GLC)",
                source_path=tif,
                color_scheme='lulc',
                category='lulc',
                year=year,
                description=f"Land Use Land Cover classification for {year} from GLC-FCS30D dataset"
            ))
    
    # 2. Tree Cover layers (1992-2010)
    for year in [1992, 1997, 2000, 2005, 2010]:
        tif = glc_dir / f"trees_{year}_glc-fcs30d.tif"
        if tif.exists():
            layers.append(RasterLayer(
                id=f"trees_glc_{year}",
                title=f"Tree Cover {year}",
                source_path=tif,
                color_scheme='trees',
                category='treecover',
                year=year,
                description=f"Tree cover density for {year}"
            ))
    
    # 3. Built Area from GLC (1987-2010)
    dk_rasters = WORKSPACE / "outputs" / "dakshina_kannada_fieldpack" / "rasters"
    for year in [1987, 1992, 1997, 2000, 2005, 2010]:
        tif = dk_rasters / f"dakshina_kannada_built_glc_{year}.tif"
        if tif.exists():
            layers.append(RasterLayer(
                id=f"built_glc_{year}",
                title=f"Built Area {year} (GLC)",
                source_path=tif,
                color_scheme='built',
                category='built',
                year=year,
                description=f"Built-up area extent for {year} from GLC dataset"
            ))
    
    # 4. Built Area from Dynamic World (2018-2025)
    for year in range(2018, 2026):
        tif = dk_rasters / f"dakshina_kannada_built_dw_{year}.tif"
        if tif.exists():
            layers.append(RasterLayer(
                id=f"built_dw_{year}",
                title=f"Built Area {year} (DW)",
                source_path=tif,
                color_scheme='built',
                category='built',
                year=year,
                description=f"Built-up area from Dynamic World for {year}"
            ))
    
    # 5. Forest Classification layers
    forest_dir = WORKSPACE / "gdrive_exports" / "Forest Classification"
    
    forest_layers = [
        ("plantations_all_20251214_121720.tif", "plantations", "Plantations (All)", 
         "plantation", "All identified plantation areas across Western Ghats"),
        ("natural_forest_high_conf_80pct_20251214_121720.tif", "natural_forest_80", 
         "Natural Forest (80% confidence)", "forest_class", "Natural forest with 80%+ confidence"),
        ("natural_forest_threshold_52pct_20251214_121720.tif", "natural_forest_52", 
         "Natural Forest (52% threshold)", "forest_class", "Natural forest at 52% threshold"),
        ("old_growth_natural_forest_20251214_121720.tif", "old_growth", 
         "Old Growth Forest", "old_growth", "Identified old growth natural forest"),
        ("forest_typology_composite_20251214_121720.tif", "forest_typology", 
         "Forest Typology Composite", "forest_class", "Composite forest classification showing plantations vs natural forest"),
        ("nature_trace_probability_raw_0to250_20251214_121720.tif", "nature_trace", 
         "Nature Trace Probability", "trees", "Probability map (0-250) of natural vegetation"),
    ]
    
    for filename, layer_id, title, color_scheme, desc in forest_layers:
        tif = forest_dir / filename
        if tif.exists():
            layers.append(RasterLayer(
                id=layer_id,
                title=title,
                source_path=tif,
                color_scheme=color_scheme,
                category='forest',
                description=desc
            ))
    
    return layers


def check_gdal():
    """Check if GDAL tools are available"""
    try:
        result = subprocess.run(['gdal2tiles.py', '--version'], 
                              capture_output=True, text=True)
        return True
    except FileNotFoundError:
        try:
            result = subprocess.run(['python', '-m', 'osgeo_utils.gdal2tiles', '--version'],
                                  capture_output=True, text=True)
            return True
        except:
            return False


def generate_tiles_with_gdal(layer: RasterLayer, output_dir: Path) -> bool:
    """Generate XYZ tiles using gdal2tiles"""
    layer_dir = output_dir / layer.id
    layer_dir.mkdir(parents=True, exist_ok=True)
    
    # Create VRT with color interpretation for visualization
    # This is a simplified approach - for production, you'd want proper color mapping
    zoom_str = f"{min(ZOOM_LEVELS)}-{max(ZOOM_LEVELS)}"
    
    cmd = [
        'gdal2tiles.py',
        '-z', zoom_str,
        '-w', 'none',  # No web viewer
        '-r', 'near',   # Nearest neighbor resampling
        '--xyz',        # XYZ tile scheme
        str(layer.source_path),
        str(layer_dir)
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            print(f"  Warning: gdal2tiles returned non-zero: {result.stderr}")
            return False
        return True
    except subprocess.TimeoutExpired:
        print(f"  Timeout generating tiles for {layer.id}")
        return False
    except Exception as e:
        print(f"  Error: {e}")
        return False


def generate_tiles_fallback(layer: RasterLayer, output_dir: Path) -> bool:
    """Fallback tile generation using pure Python with rasterio/PIL"""
    try:
        import rasterio
        from PIL import Image
        import numpy as np
    except ImportError:
        print("  Installing required packages...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'rasterio', 'pillow', 'numpy'], 
                      capture_output=True)
        import rasterio
        from PIL import Image
        import numpy as np
    
    layer_dir = output_dir / layer.id
    layer_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        with rasterio.open(layer.source_path) as src:
            # Read the raster data
            data = src.read(1)
            bounds = src.bounds
            
            # Get unique values for color mapping
            unique_vals = np.unique(data[data != src.nodata])
            
            # Create color lookup based on scheme
            colors = COLOR_SCHEMES.get(layer.color_scheme, COLOR_SCHEMES['lulc'])
            
            # Generate tiles for each zoom level
            for zoom in ZOOM_LEVELS:
                # Calculate tile range for this zoom
                n = 2 ** zoom
                x_min = int((bounds.left + 180) / 360 * n)
                x_max = int((bounds.right + 180) / 360 * n)
                y_min = int((1 - math.asinh(math.tan(math.radians(bounds.top))) / math.pi) / 2 * n)
                y_max = int((1 - math.asinh(math.tan(math.radians(bounds.bottom))) / math.pi) / 2 * n)
                
                zoom_dir = layer_dir / str(zoom)
                zoom_dir.mkdir(exist_ok=True)
                
                print(f"    Zoom {zoom}: tiles {x_min}-{x_max}, {y_min}-{y_max}")
                
                # Limit tile count to prevent memory issues
                if (x_max - x_min) * (y_max - y_min) > 1000:
                    print(f"    Skipping zoom {zoom} - too many tiles")
                    continue
                
                for x in range(x_min, x_max + 1):
                    x_dir = zoom_dir / str(x)
                    x_dir.mkdir(exist_ok=True)
                    
                    for y in range(y_min, y_max + 1):
                        # Calculate tile bounds
                        tile_lon_min = x / n * 360 - 180
                        tile_lon_max = (x + 1) / n * 360 - 180
                        tile_lat_max = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
                        tile_lat_min = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
                        
                        # Create a 256x256 PNG tile
                        tile_path = x_dir / f"{y}.png"
                        
                        # For now, create placeholder transparent tiles
                        # Full implementation would sample the raster at tile resolution
                        img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
                        img.save(tile_path, 'PNG')
        
        return True
    except Exception as e:
        print(f"  Error processing {layer.id}: {e}")
        return False


def create_tile_manifest(layers: List[RasterLayer], output_dir: Path):
    """Create a manifest of generated tiles for the app"""
    manifest = {
        'version': '1.0',
        'generated': __import__('datetime').datetime.now().isoformat(),
        'bounds': WG_BOUNDS,
        'zoom_range': [min(ZOOM_LEVELS), max(ZOOM_LEVELS)],
        'layers': []
    }
    
    for layer in layers:
        layer_dir = output_dir / layer.id
        if layer_dir.exists():
            manifest['layers'].append({
                'id': layer.id,
                'title': layer.title,
                'category': layer.category,
                'year': layer.year,
                'description': layer.description,
                'color_scheme': layer.color_scheme,
                'tile_path': f'/tiles/{layer.id}/{{z}}/{{x}}/{{y}}.png',
                'min_zoom': min(ZOOM_LEVELS),
                'max_zoom': max(ZOOM_LEVELS)
            })
    
    manifest_path = output_dir / 'tile-manifest.json'
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    print(f"\nManifest written to: {manifest_path}")
    return manifest


def create_static_layer_images(layers: List[RasterLayer], output_dir: Path):
    """
    Alternative approach: Create static PNG images for each layer
    that can be displayed as image overlays on the map.
    This is simpler than tiles and works well for smaller regions.
    """
    try:
        import rasterio
        from rasterio.warp import calculate_default_transform, reproject, Resampling
        from rasterio.crs import CRS
        from PIL import Image
        import numpy as np
    except ImportError:
        print("Installing required packages...")
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'rasterio', 'pillow', 'numpy'],
                      capture_output=True)
        import rasterio
        from rasterio.warp import calculate_default_transform, reproject, Resampling
        from rasterio.crs import CRS
        from PIL import Image
        import numpy as np
    
    images_dir = output_dir / 'images'
    images_dir.mkdir(parents=True, exist_ok=True)
    
    image_manifest = []
    dst_crs = CRS.from_epsg(4326)  # WGS84
    
    for layer in layers:
        print(f"Processing {layer.id}...")
        try:
            with rasterio.open(layer.source_path) as src:
                # Check if we need to reproject
                if src.crs != dst_crs:
                    print(f"  Reprojecting from {src.crs} to WGS84...")
                    transform, width, height = calculate_default_transform(
                        src.crs, dst_crs, src.width, src.height, *src.bounds,
                        resolution=(0.001, 0.001)  # ~100m resolution
                    )
                    
                    # Limit dimensions to prevent memory issues
                    max_dim = 4096
                    if width > max_dim or height > max_dim:
                        scale = max_dim / max(width, height)
                        width = int(width * scale)
                        height = int(height * scale)
                        transform = rasterio.transform.from_bounds(
                            *rasterio.warp.transform_bounds(src.crs, dst_crs, *src.bounds),
                            width, height
                        )
                    
                    data = np.zeros((height, width), dtype=src.dtypes[0])
                    reproject(
                        source=rasterio.band(src, 1),
                        destination=data,
                        src_transform=src.transform,
                        src_crs=src.crs,
                        dst_transform=transform,
                        dst_crs=dst_crs,
                        resampling=Resampling.nearest
                    )
                    bounds = rasterio.warp.transform_bounds(src.crs, dst_crs, *src.bounds)
                    nodata = src.nodata
                else:
                    # Read data directly
                    data = src.read(1)
                    bounds = src.bounds
                    nodata = src.nodata
                    height, width = data.shape
                
                # Create RGBA image
                rgba = np.zeros((height, width, 4), dtype=np.uint8)
                
                # Apply color scheme based on data type
                colors = COLOR_SCHEMES.get(layer.color_scheme, {})
                
                # Get unique values
                unique_vals = np.unique(data)
                print(f"  Unique values: {unique_vals[:10]}...")
                
                # Apply colors for each value
                for value, color in colors.items():
                    if color == 'transparent':
                        continue
                    mask = (data == value)
                    if isinstance(color, str) and color.startswith('#'):
                        r = int(color[1:3], 16)
                        g = int(color[3:5], 16)
                        b = int(color[5:7], 16)
                        rgba[mask] = [r, g, b, 180]
                
                # Handle values not in color scheme with gradient for continuous data
                if layer.color_scheme in ['trees', 'nature_trace']:
                    # Continuous data - use gradient
                    valid_mask = (data > 0) & (data != nodata if nodata else True)
                    if valid_mask.any():
                        min_val = data[valid_mask].min()
                        max_val = data[valid_mask].max()
                        if max_val > min_val:
                            normalized = (data.astype(float) - min_val) / (max_val - min_val)
                            normalized = np.clip(normalized, 0, 1)
                            # Green gradient
                            rgba[valid_mask, 0] = (50 * (1 - normalized[valid_mask])).astype(np.uint8)
                            rgba[valid_mask, 1] = (100 + 155 * normalized[valid_mask]).astype(np.uint8)
                            rgba[valid_mask, 2] = (50 * (1 - normalized[valid_mask])).astype(np.uint8)
                            rgba[valid_mask, 3] = 180
                
                # Set nodata to transparent
                if nodata is not None:
                    rgba[data == nodata] = [0, 0, 0, 0]
                # Also set 0 to transparent for classification layers
                if layer.color_scheme in ['plantation', 'old_growth', 'forest_class']:
                    rgba[data == 0] = [0, 0, 0, 0]
                
                # Create and save image
                img = Image.fromarray(rgba, 'RGBA')
                
                # Resize if still too large
                max_dim = 4096
                if max(img.size) > max_dim:
                    ratio = max_dim / max(img.size)
                    new_size = (int(img.width * ratio), int(img.height * ratio))
                    img = img.resize(new_size, Image.Resampling.NEAREST)
                
                img_path = images_dir / f"{layer.id}.png"
                img.save(img_path, 'PNG', optimize=True)
                
                # Convert bounds to list format [west, south, east, north]
                bounds_list = list(bounds) if hasattr(bounds, '__iter__') else [bounds.left, bounds.bottom, bounds.right, bounds.top]
                
                image_manifest.append({
                    'id': layer.id,
                    'title': layer.title,
                    'category': layer.category,
                    'year': layer.year,
                    'description': layer.description,
                    'image_path': f'/tiles/images/{layer.id}.png',
                    'bounds': {
                        'west': bounds_list[0],
                        'south': bounds_list[1],
                        'east': bounds_list[2],
                        'north': bounds_list[3]
                    }
                })
                print(f"  Created: {img_path.name} ({img.width}x{img.height})")
                
        except Exception as e:
            print(f"  Error processing {layer.id}: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    # Save manifest
    manifest_path = images_dir / 'image-manifest.json'
    with open(manifest_path, 'w') as f:
        json.dump({
            'version': '1.0',
            'generated': __import__('datetime').datetime.now().isoformat(),
            'layers': image_manifest
        }, f, indent=2)
    
    return image_manifest


def main():
    print("=" * 60)
    print("Western Ghats Field Validator - Raster Tile Generator")
    print("=" * 60)
    
    # Create output directories
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get layers to process
    layers = get_raster_layers()
    print(f"\nFound {len(layers)} raster layers to process:")
    for layer in layers:
        status = "[OK]" if layer.source_path.exists() else "[X]"
        print(f"  {status} {layer.id}: {layer.title}")
    
    # Filter to existing layers
    existing_layers = [l for l in layers if l.source_path.exists()]
    print(f"\n{len(existing_layers)} layers have source files available")
    
    if not existing_layers:
        print("\nNo raster files found. Please check paths.")
        return
    
    # Check if GDAL is available
    has_gdal = check_gdal()
    print(f"\nGDAL available: {has_gdal}")
    
    # Generate static images (simpler approach that works offline)
    print("\n" + "=" * 60)
    print("Generating static layer images...")
    print("=" * 60)
    
    image_manifest = create_static_layer_images(existing_layers, OUTPUT_DIR)
    
    print(f"\n[OK] Generated {len(image_manifest)} layer images")
    print(f"\nOutput directory: {OUTPUT_DIR}")
    
    # If GDAL is available, also generate proper XYZ tiles
    if has_gdal:
        print("\n" + "=" * 60)
        print("Generating XYZ tiles with GDAL...")
        print("=" * 60)
        
        success_count = 0
        for layer in existing_layers[:5]:  # Limit to first 5 for testing
            print(f"\nProcessing: {layer.title}")
            if generate_tiles_with_gdal(layer, OUTPUT_DIR):
                success_count += 1
                print(f"  [OK] Tiles generated")
            else:
                print(f"  ✗ Failed")
        
        print(f"\n[OK] Generated tiles for {success_count} layers")
    
    # Create combined manifest
    create_tile_manifest(existing_layers, OUTPUT_DIR)
    
    print("\n" + "=" * 60)
    print("COMPLETE")
    print("=" * 60)


if __name__ == '__main__':
    main()
