/**
 * Dataset Preparation Script
 * 
 * This script copies and prepares datasets from the workspace for the PWA.
 * Run with: node scripts/prepare-datasets.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace root (parent of field-validator-app)
const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const APP_DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');

// Dataset sources from workspace
const DATASET_SOURCES = {
  // Boundaries
  boundaries: [
    {
      src: 'outputs/western_ghats_boundary_20250928_203521.geojson',
      dest: 'boundaries/western_ghats_boundary.geojson'
    },
    {
      src: 'outputs/dakshina_kannada_fieldpack/dakshina_kannada_boundary.geojson',
      dest: 'boundaries/dakshina_kannada_boundary.geojson'
    }
  ],
  
  // LULC Data
  lulc: [
    {
      src: 'outputs/dakshina_kannada_fieldpack/tables/dakshina_kannada_lulc_glc_composition.csv',
      dest: 'lulc/dakshina_kannada_lulc_glc_composition.csv'
    },
    {
      src: 'outputs/dakshina_kannada_fieldpack/tables/dakshina_kannada_tree_cover_glc.csv',
      dest: 'lulc/dakshina_kannada_tree_cover_glc.csv'
    },
    {
      src: 'outputs/dakshina_kannada_fieldpack/tables/dakshina_kannada_built_glc.csv',
      dest: 'lulc/dakshina_kannada_built_glc.csv'
    },
    {
      src: 'outputs/dakshina_kannada_fieldpack/tables/dakshina_kannada_built_dynamic_world.csv',
      dest: 'lulc/dakshina_kannada_built_dynamic_world.csv'
    }
  ],
  
  // Dynamic World Data (regional time series)
  dynamicworld: [
    {
      src: 'outputs/dynamic_world_lulc_january_2018_2025_20251026_153424.csv',
      dest: 'dynamicworld/wg_dynamic_world_2018_2025.csv'
    }
  ],
  
  // Tree Cover Data (complete historical)
  treecover: [
    {
      src: 'outputs/complete_lulc_1987_2025_20251026_162457.csv',
      dest: 'treecover/wg_lulc_complete_1987_2025.csv'
    }
  ],
  
  // Forest Data
  forest: [
    {
      src: 'outputs/dakshina_kannada_fieldpack/tables/dakshina_kannada_forest_typology.csv',
      dest: 'forest/dakshina_kannada_forest_typology.csv'
    },
    {
      src: 'outputs/forest_typology_corrected/regional_forest_comparison.csv',
      dest: 'forest/regional_forest_comparison.csv'
    },
    {
      src: 'outputs/forest_typology/statistics/district_forest_typology_20251214_113455.csv',
      dest: 'forest/district_forest_typology.csv'
    }
  ],
  
  // CoreStack Data
  corestack: [
    {
      src: 'outputs/dakshina_kannada_fieldpack/tables/dakshina_kannada_corestack_blocks.csv',
      dest: 'corestack/dakshina_kannada_corestack_blocks.csv'
    },
    {
      src: 'outputs/forest_agriculture_analysis/cropping_intensity_analysis.csv',
      dest: 'corestack/cropping_intensity_analysis.csv'
    },
    {
      src: 'outputs/forest_agriculture_analysis/water_balance_summary.csv',
      dest: 'corestack/water_balance_summary.csv'
    }
  ],
  
  // Coverage Data
  coverage: [
    {
      src: 'outputs/corestack_coverage/wg_district_coverage.csv',
      dest: 'coverage/wg_district_coverage.csv'
    }
  ],
  
  // Analysis Data
  analysis: [
    {
      src: 'outputs/district_analysis/district_urbanization_analysis.csv',
      dest: 'analysis/district_urbanization_analysis.csv'
    },
    {
      src: 'outputs/district_analysis/top3_hotspots.json',
      dest: 'analysis/top3_hotspots.json'
    }
  ]
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

function copyFile(src, dest) {
  const srcPath = path.join(WORKSPACE_ROOT, src);
  const destPath = path.join(APP_DATA_DIR, dest);
  
  if (!fs.existsSync(srcPath)) {
    console.warn(`⚠️  Source not found: ${src}`);
    return false;
  }
  
  ensureDir(path.dirname(destPath));
  fs.copyFileSync(srcPath, destPath);
  console.log(`✅ Copied: ${src} → ${dest}`);
  return true;
}

function generateManifest() {
  const manifest = {
    region: 'Western Ghats',
    generated: new Date().toISOString(),
    version: '1.0.0',
    layers: [],
    basemaps: [
      {
        id: 'dark',
        type: 'vector',
        title: 'Dark Map',
        offline: false,
        source: 'carto-dark'
      },
      {
        id: 'satellite',
        type: 'raster',
        title: 'Satellite',
        offline: false,
        source: 'esri-satellite'
      }
    ]
  };

  // Add layers for each category
  const layerDefs = [
    {
      id: 'western_ghats_boundary',
      title: 'Western Ghats Boundary',
      type: 'vector',
      source: { format: 'geojson', path: '/data/boundaries/western_ghats_boundary.geojson' },
      style: { kind: 'polygon', colors: { default: '#4a9eff33' } },
      query: { mode: 'feature_at_point', fields: ['REC_NUM'] },
      category: 'boundary',
      enabled: true
    },
    {
      id: 'dakshina_kannada_boundary',
      title: 'Dakshina Kannada District',
      type: 'vector',
      source: { format: 'geojson', path: '/data/boundaries/dakshina_kannada_boundary.geojson' },
      style: { kind: 'polygon', colors: { default: '#ff9800aa' } },
      query: { mode: 'feature_at_point', fields: [] },
      category: 'boundary',
      enabled: true
    },
    {
      id: 'lulc_glc_composition',
      title: 'LULC Composition (GLC 1987-2010)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_lulc_glc_composition.csv' },
      style: { kind: 'categorical', field: 'class_name' },
      query: { mode: 'summary', fields: ['year', 'class_name', 'area_km2', 'percent'] },
      category: 'lulc',
      enabled: true
    },
    {
      id: 'tree_cover_glc',
      title: 'Tree Cover (GLC)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_tree_cover_glc.csv' },
      style: { kind: 'choropleth', field: 'tree_cover_pct' },
      query: { mode: 'summary', fields: ['year', 'tree_cover_km2'] },
      category: 'lulc',
      enabled: true
    },
    {
      id: 'built_area_glc',
      title: 'Built Area (GLC)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_built_glc.csv' },
      style: { kind: 'choropleth', field: 'built_pct' },
      query: { mode: 'summary', fields: ['year', 'built_km2'] },
      category: 'lulc',
      enabled: true
    },
    {
      id: 'built_area_dw',
      title: 'Built Area (Dynamic World 2018-2025)',
      type: 'csv',
      source: { format: 'csv', path: '/data/lulc/dakshina_kannada_built_dynamic_world.csv' },
      style: { kind: 'choropleth', field: 'built_pct' },
      query: { mode: 'summary', fields: ['year', 'built_km2'] },
      category: 'lulc',
      enabled: true
    },
    {
      id: 'dynamic_world_regional',
      title: 'Dynamic World Regional (2018-2025)',
      type: 'csv',
      source: { format: 'csv', path: '/data/dynamicworld/wg_dynamic_world_2018_2025.csv' },
      style: { kind: 'categorical', field: 'landcover' },
      query: { mode: 'summary', fields: ['year', 'Trees', 'Built', 'Crops', 'Shrub and Scrub'] },
      category: 'dynamicworld',
      enabled: true
    },
    {
      id: 'lulc_complete_historical',
      title: 'Complete LULC Historical (1987-2025)',
      type: 'csv',
      source: { format: 'csv', path: '/data/treecover/wg_lulc_complete_1987_2025.csv' },
      style: { kind: 'choropleth', field: 'tree_cover' },
      query: { mode: 'summary', fields: ['year', 'tree_cover', 'built_area', 'cropland'] },
      category: 'lulc',
      enabled: true
    },
    {
      id: 'forest_typology',
      title: 'Forest Typology',
      type: 'csv',
      source: { format: 'csv', path: '/data/forest/dakshina_kannada_forest_typology.csv' },
      style: { kind: 'categorical', field: 'forest_type' },
      query: { mode: 'summary', fields: ['forest_type', 'area_km2'] },
      category: 'forest',
      enabled: true
    },
    {
      id: 'district_forest_typology',
      title: 'District Forest Typology',
      type: 'csv',
      source: { format: 'csv', path: '/data/forest/district_forest_typology.csv' },
      style: { kind: 'categorical', field: 'forest_type' },
      query: { mode: 'summary', fields: ['district', 'forest_type', 'area_km2'] },
      category: 'forest',
      enabled: true
    },
    {
      id: 'corestack_blocks',
      title: 'CoreStack Blocks (Dakshina Kannada)',
      type: 'csv',
      source: { format: 'csv', path: '/data/corestack/dakshina_kannada_corestack_blocks.csv' },
      style: { kind: 'categorical', field: 'block_type' },
      query: { mode: 'summary', fields: ['block_name', 'block_type', 'area_ha'] },
      category: 'corestack',
      enabled: true
    },
    {
      id: 'cropping_intensity',
      title: 'Cropping Intensity Analysis',
      type: 'csv',
      source: { format: 'csv', path: '/data/corestack/cropping_intensity_analysis.csv' },
      style: { kind: 'choropleth', field: 'cropping_intensity' },
      query: { mode: 'summary', fields: ['district', 'cropping_intensity', 'irrigated_pct'] },
      category: 'corestack',
      enabled: true
    },
    {
      id: 'water_balance',
      title: 'Water Balance Summary',
      type: 'csv',
      source: { format: 'csv', path: '/data/corestack/water_balance_summary.csv' },
      style: { kind: 'choropleth', field: 'water_balance' },
      query: { mode: 'summary', fields: ['district', 'rainfall_mm', 'runoff_mm', 'et_mm'] },
      category: 'corestack',
      enabled: true
    },
    {
      id: 'urbanization_analysis',
      title: 'District Urbanization Analysis',
      type: 'csv',
      source: { format: 'csv', path: '/data/analysis/district_urbanization_analysis.csv' },
      style: { kind: 'choropleth', field: 'urbanization_rate' },
      query: { mode: 'summary', fields: ['district', 'built_area_km2', 'growth_rate'] },
      category: 'analysis',
      enabled: true
    },
    {
      id: 'district_coverage',
      title: 'WG District Coverage (CoreStack)',
      type: 'csv',
      source: { format: 'csv', path: '/data/coverage/wg_district_coverage.csv' },
      style: { kind: 'categorical', field: 'corestack_covered' },
      query: { mode: 'summary', fields: ['state', 'district', 'corestack_covered'] },
      category: 'corestack',
      enabled: true
    }
  ];

  manifest.layers = layerDefs;

  const manifestPath = path.join(APP_DATA_DIR, 'dataset-manifest.json');
  ensureDir(APP_DATA_DIR);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`📋 Generated manifest: ${manifestPath}`);
}

function main() {
  console.log('🚀 Preparing datasets for WG Field Validator PWA\n');
  console.log(`📂 Workspace: ${WORKSPACE_ROOT}`);
  console.log(`📂 App Data: ${APP_DATA_DIR}\n`);

  let copied = 0;
  let failed = 0;

  for (const [category, files] of Object.entries(DATASET_SOURCES)) {
    console.log(`\n📦 Category: ${category}`);
    for (const file of files) {
      if (copyFile(file.src, file.dest)) {
        copied++;
      } else {
        failed++;
      }
    }
  }

  console.log('\n📋 Generating manifest...');
  generateManifest();

  console.log('\n✨ Dataset preparation complete!');
  console.log(`   ✅ Copied: ${copied} files`);
  if (failed > 0) {
    console.log(`   ⚠️  Failed: ${failed} files`);
  }
}

main();
