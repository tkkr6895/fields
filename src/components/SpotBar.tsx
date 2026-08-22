import { tesseraTileForPoint } from '../services/TesseraService';
import type { LocationData } from '../types';

interface SpotBarProps {
  focusLocation: LocationData | null;
  placeLabel?: string | null;
  pendingEnrichment?: number;
  indiaSatClass?: { name: string; color: string; classId: number } | null;
}

const SpotBar: React.FC<SpotBarProps> = ({ focusLocation, placeLabel, pendingEnrichment = 0, indiaSatClass }) => {
  if (!focusLocation) {
    return (
      <div className="prediction-card prediction-card--empty">
        <div className="prediction-card__lede">
          <strong>Find your tree</strong>
          <span>Tap the crosshair to use GPS, or tap the map. Then tap the green + to photograph it.</span>
        </div>
      </div>
    );
  }
  const tile = tesseraTileForPoint(focusLocation.lat, focusLocation.lon);
  return (
    <div className="prediction-card prediction-card--collapsed">
      <div className="prediction-card__header">
        <div className="prediction-card__loc">
          <strong>{placeLabel || 'This spot'}</strong>
          <span>
            ±{Math.round(focusLocation.accuracy || 0)} m · Tessera {tile.tileId}
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
