/**
 * CustomLayerStyleEditor — Fill/stroke colour pickers, opacity slider, label field dropdown
 * Task 1.8.10
 */

import React, { useState } from 'react';
import type { CustomLayer, CustomLayerStyle } from '../../types';

interface CustomLayerStyleEditorProps {
  layer: CustomLayer;
  onSave: (style: CustomLayerStyle) => void;
  onCancel: () => void;
}

const CustomLayerStyleEditor: React.FC<CustomLayerStyleEditorProps> = ({ layer, onSave, onCancel }) => {
  const [style, setStyle] = useState<CustomLayerStyle>({ ...layer.style });

  const update = (patch: Partial<CustomLayerStyle>) => {
    setStyle(prev => ({ ...prev, ...patch }));
  };

  const isPoint = layer.geometryType === 'Point' || layer.geometryType === 'MultiPoint';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2100,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#13151a',
        borderRadius: 16,
        width: '100%',
        maxWidth: 400,
        padding: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: '#fff', fontSize: 16 }}>🎨 Style: {layer.title}</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Fill Color */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Fill Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={style.fillColor}
              onChange={e => update({ fillColor: e.target.value })}
              style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', background: 'none' }}
            />
            <input
              type="text"
              value={style.fillColor}
              onChange={e => update({ fillColor: e.target.value })}
              style={{
                flex: 1, padding: '6px 10px', background: '#0d0f12', border: '1px solid #444',
                borderRadius: 6, color: '#fff', fontSize: 13, fontFamily: 'monospace',
              }}
            />
          </div>
        </div>

        {/* Stroke Color */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Stroke Color</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="color"
              value={style.strokeColor}
              onChange={e => update({ strokeColor: e.target.value })}
              style={{ width: 40, height: 32, border: 'none', cursor: 'pointer', background: 'none' }}
            />
            <input
              type="text"
              value={style.strokeColor}
              onChange={e => update({ strokeColor: e.target.value })}
              style={{
                flex: 1, padding: '6px 10px', background: '#0d0f12', border: '1px solid #444',
                borderRadius: 6, color: '#fff', fontSize: 13, fontFamily: 'monospace',
              }}
            />
          </div>
        </div>

        {/* Stroke Width */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
            Stroke Width <span>{style.strokeWidth}px</span>
          </label>
          <input
            type="range"
            min={0}
            max={6}
            step={0.5}
            value={style.strokeWidth}
            onChange={e => update({ strokeWidth: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Opacity */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
            Opacity <span>{Math.round(style.opacity * 100)}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={style.opacity}
            onChange={e => update({ opacity: parseFloat(e.target.value) })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Symbol Size (for point layers) */}
        {isPoint && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ color: '#aaa', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
              Symbol Size <span>{style.symbolSize || 8}px</span>
            </label>
            <input
              type="range"
              min={2}
              max={24}
              step={1}
              value={style.symbolSize || 8}
              onChange={e => update({ symbolSize: parseInt(e.target.value) })}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Label Field */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>Label Field</label>
          <select
            value={style.labelField || ''}
            onChange={e => update({ labelField: e.target.value || undefined })}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#0d0f12',
              border: '1px solid #444',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
            }}
          >
            <option value="">None</option>
            {layer.properties.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {/* Preview Swatch */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          background: '#1a1d23',
          borderRadius: 8,
          marginBottom: 20,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: isPoint ? '50%' : 4,
            background: style.fillColor,
            border: `${style.strokeWidth}px solid ${style.strokeColor}`,
            opacity: style.opacity,
          }} />
          <span style={{ color: '#aaa', fontSize: 12 }}>Preview</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '10px 20px', background: 'transparent', border: '1px solid #555', borderRadius: 8,
            color: '#aaa', cursor: 'pointer', fontSize: 13,
          }}>Cancel</button>
          <button onClick={() => onSave(style)} style={{
            padding: '10px 20px', background: '#3388ff', border: 'none', borderRadius: 8,
            color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>Save Style</button>
        </div>
      </div>
    </div>
  );
};

export default CustomLayerStyleEditor;
