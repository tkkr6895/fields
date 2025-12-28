#!/usr/bin/env python3
"""
Generate Web-Ready Images for Large Rasters using GDAL

This script handles the large Western Ghats-wide rasters (plantations, forest typology, etc.)
by using GDAL's gdal_translate with proper downsampling.
"""

import os
import subprocess
import json
from pathlib import Path

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
        'color': '#9ACD32'  # Yellow-green
    },
    {
        'id': 'natural_forest_80',
        'title': 'Natural Forest (80% confidence)',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "natural_forest_high_conf_80pct_20251214_121720.tif",
        'category': 'forest',
        'description': 'Natural forest with 80%+ confidence',
        'color': '#006400'  # Dark green
    },
    {
        'id': 'natural_forest_52',
        'title': 'Natural Forest (52% threshold)',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "natural_forest_threshold_52pct_20251214_121720.tif",
        'category': 'forest',
        'description': 'Natural forest at 52% threshold',
        'color': '#228B22'  # Forest green
    },
    {
        'id': 'old_growth',
        'title': 'Old Growth Forest',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "old_growth_natural_forest_20251214_121720.tif",
        'category': 'forest',
        'description': 'Identified old growth natural forest',
        'color': '#004D00'  # Very dark green
    },
    {
        'id': 'forest_typology',
        'title': 'Forest Typology Composite',
        'source': WORKSPACE / "gdrive_exports" / "Forest Classification" / "forest_typology_composite_20251214_121720.tif",
        'category': 'forest',
        'description': 'Composite forest classification showing plantations vs natural forest',
        'colors': {1: '#006400', 2: '#9ACD32', 3: '#228B22', 4: '#90EE90'}
    },
]

def get_raster_info(filepath):
    """Get raster bounds and CRS using gdalinfo"""
    try:
        result = subprocess.run(
            ['gdalinfo', '-json', str(filepath)],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0:
            info = json.loads(result.stdout)
            return info
    except Exception as e:
        print(f"Error getting info: {e}")
    return None

def create_colored_png_with_gdal(layer, output_dir):
    """Create colored PNG using gdaldem color-relief"""
    source = layer['source']
    output = output_dir / f"{layer['id']}.png"
    temp_vrt = output_dir / f"{layer['id']}_temp.vrt"
    color_file = output_dir / f"{layer['id']}_colors.txt"
    
    print(f"\nProcessing: {layer['title']}")
    print(f"  Source: {source}")
    
    if not source.exists():
        print(f"  [X] Source file not found")
        return None
    
    # Get raster info
    info = get_raster_info(source)
    if info:
        size = info.get('size', [0, 0])
        print(f"  Size: {size[0]}x{size[1]}")
    
    # Create color file for gdaldem
    if 'colors' in layer:
        colors = layer['colors']
    else:
        # Single color for binary masks
        color = layer.get('color', '#00FF00')
        r = int(color[1:3], 16)
        g = int(color[3:5], 16)
        b = int(color[5:7], 16)
        colors = {0: 'transparent', 1: f'{r} {g} {b} 180'}
    
    with open(color_file, 'w') as f:
        for value, color in colors.items():
            if color == 'transparent':
                f.write(f"{value} 0 0 0 0\n")
            elif isinstance(color, str) and color.startswith('#'):
                r = int(color[1:3], 16)
                g = int(color[3:5], 16)
                b = int(color[5:7], 16)
                f.write(f"{value} {r} {g} {b} 180\n")
            else:
                f.write(f"{value} {color}\n")
    
    try:
        # Step 1: Create a warped VRT at reduced resolution and in WGS84
        print("  Creating warped VRT...")
        warp_cmd = [
            'gdalwarp',
            '-t_srs', 'EPSG:4326',
            '-tr', '0.002', '0.002',  # ~200m resolution
            '-r', 'near',
            '-of', 'VRT',
            str(source),
            str(temp_vrt)
        ]
        result = subprocess.run(warp_cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            print(f"  Warp error: {result.stderr}")
            return None
        
        # Step 2: Apply color table using gdaldem
        temp_colored = output_dir / f"{layer['id']}_colored.tif"
        print("  Applying colors...")
        color_cmd = [
            'gdaldem', 'color-relief',
            str(temp_vrt),
            str(color_file),
            str(temp_colored),
            '-alpha',
            '-of', 'GTiff'
        ]
        result = subprocess.run(color_cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            print(f"  Color error: {result.stderr}")
            # Try alternative: direct translate
            pass
        
        # Step 3: Convert to PNG
        print("  Converting to PNG...")
        translate_cmd = [
            'gdal_translate',
            '-of', 'PNG',
            '-outsize', '4096', '0',  # Max width 4096, preserve aspect
            str(temp_colored if temp_colored.exists() else temp_vrt),
            str(output)
        ]
        result = subprocess.run(translate_cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            print(f"  Translate error: {result.stderr}")
            return None
        
        # Get bounds from VRT
        vrt_info = get_raster_info(temp_vrt)
        bounds = None
        if vrt_info and 'cornerCoordinates' in vrt_info:
            cc = vrt_info['cornerCoordinates']
            bounds = {
                'west': cc['lowerLeft'][0],
                'south': cc['lowerLeft'][1],
                'east': cc['upperRight'][0],
                'north': cc['upperRight'][1]
            }
        
        # Cleanup temp files
        for f in [temp_vrt, color_file, temp_colored]:
            if f.exists():
                try:
                    f.unlink()
                except:
                    pass
        
        print(f"  [OK] Created: {output.name}")
        
        return {
            'id': layer['id'],
            'title': layer['title'],
            'category': layer['category'],
            'year': layer.get('year'),
            'description': layer['description'],
            'image_path': f'/tiles/images/{layer["id"]}.png',
            'bounds': bounds
        }
        
    except Exception as e:
        print(f"  Error: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    print("=" * 60)
    print("Large Raster Processing with GDAL")
    print("=" * 60)
    
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Check GDAL
    try:
        result = subprocess.run(['gdalinfo', '--version'], capture_output=True, text=True)
        print(f"GDAL Version: {result.stdout.strip()}")
    except:
        print("GDAL not found! Please install GDAL.")
        return
    
    results = []
    for layer in LARGE_LAYERS:
        result = create_colored_png_with_gdal(layer, OUTPUT_DIR)
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


if __name__ == '__main__':
    main()
