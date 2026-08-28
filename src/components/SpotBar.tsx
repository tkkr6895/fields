import { tesseraTileForPoint } from '../services/TesseraService';
import type { LocationData } from '../types';

interface SpotBarProps {
  focusLocation: LocationData | null;
  placeLabel?: string | null;
  pendingEnrichment?: number;
  indiaSatClass?: { name: string; color: string; classId: number } | null;
  showTessera?: boolean;
  recording?: boolean;
}

const SpotBar: React.FC<SpotBarProps> = ({
  focusLocation,
  placeLabel,
  pendingEnrichment = 0,
  indiaSatClass,
  showTessera = false,
  recording = false,
}) => {
  if (recording) return null;
  if (!focusLocation) {
    return (
      <div className="prediction-card prediction-card--empty">
        <div className="prediction-card__lede">
          <strong>You are here</strong>
          <span>Tap the crosshair for GPS, or tap the map. Start a track to log the walk. The camera marks a tree or a point of interest.</span>
        </div>
      </div>
    );
  }
  const acc = Math.round(focusLocation.accuracy || 0);
  const tile = showTessera ? tesseraTileForPoint(focusLocation.lat, focusLocation.lon) : null;
  return (
    <div className="prediction-card prediction-card--collapsed">
      <div className="prediction-card__header">
        <div className="prediction-card__loc">
          <strong>{placeLabel || 'This spot'}</strong>
          <span>
            {focusLocation.lat.toFixed(5)}, {focusLocation.lon.toFixed(5)} · ±{acc} m
            {tile ? ` · Tessera ${tile.tileId}` : ''}
            {pendingEnrichment > 0 ? ` · ${pendingEnrichment} filling in` : ''}
          </span>
          {indiaSatClass && (
            <span className="spot-class">
              <span className="legend-swatch" style={{ background: indiaSatClass.color }} />
              IndiaSAT: {indiaSatClass.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpotBar;
