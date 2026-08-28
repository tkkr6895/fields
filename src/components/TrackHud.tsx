import { useEffect, useState } from 'react';
import { formatDistance, formatDuration } from '../services/TrackExport';
import type { FieldTrack, LocationData } from '../types';

interface TrackHudProps {
  track: FieldTrack | null;
  location: LocationData | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const TrackHud: React.FC<TrackHudProps> = ({ track, location, onStart, onPause, onResume, onStop }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!track || track.status === 'finished') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [track]);
  const elapsed = track ? now - new Date(track.startedAt).getTime() : 0;
  const accuracy = location?.accuracy;
  const recording = track?.status === 'recording';

  if (!track) {
    return (
      <div className="track-hud track-hud--idle">
        <button type="button" className="track-hud__start" onClick={onStart}>
          Start track
        </button>
        <p>GPS trail on this phone. Notes and photos drop onto it.</p>
      </div>
    );
  }

  return (
    <div className={`track-hud ${recording ? 'track-hud--live' : 'track-hud--paused'}`} role="status">
      <div className="track-hud__pulse" aria-hidden="true" />
      <div className="track-hud__stats">
        <strong>{recording ? 'Recording' : 'Paused'}</strong>
        <span>
          {formatDistance(track.distanceM)} · {formatDuration(elapsed)} · {track.points.length} fixes
          {accuracy != null ? ` · ±${Math.round(accuracy)} m` : ''}
        </span>
      </div>
      <div className="track-hud__actions">
        {recording ? (
          <button type="button" className="track-hud__btn" onClick={onPause}>Pause</button>
        ) : (
          <button type="button" className="track-hud__btn" onClick={onResume}>Resume</button>
        )}
        <button type="button" className="track-hud__btn track-hud__btn--stop" onClick={onStop}>Save</button>
      </div>
    </div>
  );
};

export default TrackHud;
