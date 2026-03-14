/**
 * VectorFeatureInspector — Displays vector feature properties with context
 * and enables ground-truth validation of individual features.
 *
 * Addresses mentor feedback:
 * - "Know what the properties mean so relevant ones can be shown and rendered appropriately"
 * - Waterbody drying, drainage channel presence, farm pond location validation
 */

import React, { useState, useMemo } from 'react';
import type { VectorFeatureContext, VectorPropertySchema, ValidationStatus, ObservationType } from '../types';
import { getPropertyLabel, formatPropertyValue, filterMeaningfulProperties } from '../config/westernGhatsLayers';

export interface VectorFeatureInspectorProps {
  features: VectorFeatureForInspection[];
  location: { lat: number; lon: number };
  onValidateFeature?: (context: VectorFeatureContext, validation: ValidationStatus, observationType: ObservationType) => void;
  onClose: () => void;
}

export interface VectorFeatureForInspection {
  layerId: string;
  layerTitle: string;
  source: 'corestack' | 'dataset' | 'custom';
  geometryType: string;
  properties: Record<string, unknown>;
  propertySchema?: VectorPropertySchema[];
  validatable?: boolean;
  validationPrompt?: string;
}

/** Infer a validation question from the feature's layer type */
function inferValidationPrompt(feature: VectorFeatureForInspection): string {
  const title = feature.layerTitle.toLowerCase();
  if (/drainage|stream|channel/i.test(title)) {
    return 'Is this drainage channel / stream present on the ground?';
  }
  if (/farm.?pond/i.test(title)) {
    return 'Is this farm pond present at the reported location?';
  }
  if (/water.?body|waterbody|tank|reservoir/i.test(title)) {
    return 'What is the current status of this waterbody?';
  }
  if (/well/i.test(title)) {
    return 'Is this well present and functional?';
  }
  if (/check.?dam|dam/i.test(title)) {
    return 'Is this check dam / structure present and intact?';
  }
  if (/settlement|village/i.test(title)) {
    return 'Does this settlement/boundary match ground reality?';
  }
  if (/crop|kharif|rabi/i.test(title)) {
    return 'Does the reported cropping pattern match current field conditions?';
  }
  if (/forest|plantation|scrub/i.test(title)) {
    return 'Does the vegetation type match what you observe?';
  }
  if (/road/i.test(title)) {
    return 'Is this road present and in the reported condition?';
  }
  if (/nrega|asset|structure/i.test(title)) {
    return 'Is this NREGA asset present and functional?';
  }
  if (/lulc|land.?cover|land.?use/i.test(title)) {
    return 'Does the reported land cover class match the ground reality?';
  }
  if (/boundary/i.test(title)) {
    return 'Does this boundary match the actual boundary on the ground?';
  }
  return 'Does this feature match the ground reality?';
}

/** Infer observation type from the feature for auto-classification */
function inferObservationType(feature: VectorFeatureForInspection): ObservationType {
  const title = feature.layerTitle.toLowerCase();
  if (/drainage|stream|channel|water|pond|tank|reservoir|well/i.test(title)) return 'waterbody_validation';
  if (/farm.?pond/i.test(title)) return 'farm_pond_validation';
  if (/lulc|land.?cover|crop|forest|vegetation|built/i.test(title)) return 'land_cover';
  if (/nrega|check.?dam|road|settlement|village/i.test(title)) return 'infrastructure_validation';
  return 'general';
}

/** Categorize properties by importance for structured display */
function categorizeProperties(
  properties: Record<string, unknown>,
  schema?: VectorPropertySchema[]
): { primary: [string, unknown][]; secondary: [string, unknown][]; metadata: [string, unknown][] } {
  const primary: [string, unknown][] = [];
  const secondary: [string, unknown][] = [];
  const metadata: [string, unknown][] = [];

  if (schema && schema.length > 0) {
    // Use schema to categorize
    const schemaMap = new Map(schema.map(s => [s.key, s]));
    for (const [key, value] of Object.entries(properties)) {
      const s = schemaMap.get(key);
      if (!s || !s.display) continue;
      if (s.importance === 'high') primary.push([key, value]);
      else if (s.importance === 'medium') secondary.push([key, value]);
      else metadata.push([key, value]);
    }
    // Add any remaining meaningful properties not in schema
    const filtered = filterMeaningfulProperties(properties);
    for (const [key, value] of Object.entries(filtered)) {
      if (!schemaMap.has(key)) secondary.push([key, value]);
    }
  } else {
    // No schema — use heuristic filtering
    const filtered = filterMeaningfulProperties(properties);
    const entries = Object.entries(filtered);
    // First 5 are primary, next 10 secondary, rest metadata
    entries.forEach(([k, v], i) => {
      if (i < 5) primary.push([k, v]);
      else if (i < 15) secondary.push([k, v]);
      else metadata.push([k, v]);
    });
  }

  return { primary, secondary, metadata };
}

/** Format a property using schema if available */
function formatWithSchema(key: string, value: unknown, schema?: VectorPropertySchema[]): string {
  const s = schema?.find(s => s.key === key);
  if (s) {
    if (value === null || value === undefined) return '-';
    const v = typeof value === 'number' ? value : Number(value);
    if (s.format === 'percentage' && !isNaN(v)) return `${v.toFixed(1)}%`;
    if (s.format === 'area_ha' && !isNaN(v)) return `${v.toFixed(2)} ha`;
    if (s.format === 'area_km2' && !isNaN(v)) return `${v.toFixed(2)} km²`;
    if (s.format === 'count' && !isNaN(v)) return v.toLocaleString();
    if (s.format === 'year' && !isNaN(v)) return String(Math.round(v));
    if (s.unit) return `${value} ${s.unit}`;
  }
  return formatPropertyValue(key, value);
}

/** Get display label from schema or fallback */
function getLabelWithSchema(key: string, schema?: VectorPropertySchema[]): string {
  const s = schema?.find(s => s.key === key);
  return s?.label || getPropertyLabel(key);
}

const VectorFeatureInspector: React.FC<VectorFeatureInspectorProps> = ({
  features,
  location,
  onValidateFeature,
  onClose
}) => {
  const [selectedFeatureIdx, setSelectedFeatureIdx] = useState(0);
  const [showAllProps, setShowAllProps] = useState(false);
  const [validationState, setValidationState] = useState<ValidationStatus | null>(null);

  const feature = features[selectedFeatureIdx];
  if (!feature) return null;

  const prompt = feature.validationPrompt || inferValidationPrompt(feature);
  const obsType = inferObservationType(feature);
  const categorized = useMemo(
    () => categorizeProperties(feature.properties, feature.propertySchema),
    [feature]
  );

  const handleValidate = (status: ValidationStatus) => {
    setValidationState(status);
    if (onValidateFeature) {
      onValidateFeature(
        {
          layerId: feature.layerId,
          layerTitle: feature.layerTitle,
          featureProperties: feature.properties,
          geometryType: feature.geometryType,
          validationPrompt: prompt,
          dataSource: feature.source,
        },
        status,
        obsType
      );
    }
  };

  const geomIcon = /polygon/i.test(feature.geometryType) ? '⬛'
    : /line/i.test(feature.geometryType) ? '〰️'
    : /point/i.test(feature.geometryType) ? '📍'
    : '📐';

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, maxHeight: '70vh',
      background: 'var(--bg-primary)', borderRadius: '16px 16px 0 0',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.3)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {geomIcon} {feature.layerTitle}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {feature.geometryType} · {feature.source === 'corestack' ? 'CoreStack API' : 'Local Dataset'}
            {' · '}{location.lat.toFixed(5)}°N, {location.lon.toFixed(5)}°E
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', fontSize: '20px',
          color: 'var(--text-muted)', cursor: 'pointer', padding: '4px',
        }}>✕</button>
      </div>

      {/* Feature tabs if multiple features */}
      {features.length > 1 && (
        <div style={{
          display: 'flex', gap: '4px', padding: '8px 16px',
          overflowX: 'auto', borderBottom: '1px solid var(--border)',
        }}>
          {features.map((f, i) => (
            <button key={i} onClick={() => { setSelectedFeatureIdx(i); setValidationState(null); }}
              style={{
                padding: '4px 10px', fontSize: '11px', borderRadius: '12px', whiteSpace: 'nowrap',
                border: i === selectedFeatureIdx ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: i === selectedFeatureIdx ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: i === selectedFeatureIdx ? 'white' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}>
              {f.layerTitle}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px' }}>
        {/* Validation prompt */}
        <div style={{
          padding: '10px 14px', background: 'var(--bg-tertiary)', borderRadius: '10px',
          marginBottom: '12px', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)', marginBottom: '4px' }}>
            🔍 Ground-Truth Question
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{prompt}</div>
        </div>

        {/* Primary properties */}
        {categorized.primary.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Key Properties
            </div>
            {categorized.primary.map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', flex: '0 0 45%' }}>
                  {getLabelWithSchema(k, feature.propertySchema)}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>
                  {formatWithSchema(k, v, feature.propertySchema)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Secondary properties */}
        {categorized.secondary.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Additional Details
            </div>
            {categorized.secondary.map(([k, v]) => (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', padding: '4px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', flex: '0 0 45%' }}>
                  {getLabelWithSchema(k, feature.propertySchema)}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                  {formatWithSchema(k, v, feature.propertySchema)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Show all toggle */}
        {categorized.metadata.length > 0 && (
          <button onClick={() => setShowAllProps(!showAllProps)} style={{
            background: 'none', border: 'none', color: 'var(--accent)',
            fontSize: '12px', cursor: 'pointer', padding: '6px 0', marginBottom: '8px',
          }}>
            {showAllProps ? '▼ Hide' : '▶ Show'} {categorized.metadata.length} more properties
          </button>
        )}
        {showAllProps && categorized.metadata.map(([k, v]) => (
          <div key={k} style={{
            display: 'flex', justifyContent: 'space-between', padding: '3px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', flex: '0 0 45%' }}>
              {getLabelWithSchema(k, feature.propertySchema)}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right' }}>
              {formatWithSchema(k, v, feature.propertySchema)}
            </span>
          </div>
        ))}

        {/* Schema descriptions tooltip */}
        {feature.propertySchema && feature.propertySchema.some(s => s.description) && (
          <details style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <summary style={{ cursor: 'pointer' }}>ℹ️ About these properties</summary>
            <div style={{ padding: '8px 0' }}>
              {feature.propertySchema.filter(s => s.description && s.display).map(s => (
                <div key={s.key} style={{ marginBottom: '4px' }}>
                  <strong>{s.label}:</strong> {s.description}
                  {s.unit && ` (${s.unit})`}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Validation buttons */}
      {(feature.validatable !== false) && (
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>
            Validate this feature
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([
              ['match', '✅', 'Present / Matches', '#4CAF50'],
              ['mismatch', '⚠️', 'Absent / Wrong', '#FF5722'],
              ['unclear', '❓', 'Unclear', '#FF9800'],
            ] as const).map(([val, icon, label, color]) => (
              <button key={val} onClick={() => handleValidate(val)}
                style={{
                  flex: 1, padding: '10px 8px', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 600,
                  border: validationState === val ? `2px solid ${color}` : '1px solid var(--border)',
                  background: validationState === val ? `${color}22` : 'var(--bg-tertiary)',
                  color: validationState === val ? color : 'var(--text-primary)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                }}>
                <span style={{ fontSize: '18px' }}>{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VectorFeatureInspector;
