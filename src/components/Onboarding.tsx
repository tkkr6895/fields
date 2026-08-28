import { useState } from 'react';
import { completeFirstLaunch, getUserName, setUserAffiliation, setUserName } from '../services/DeviceService';

interface OnboardingProps {
  onDone: () => void;
}

const SLIDES = [
  {
    title: 'Maps for anywhere, kept on the phone',
    body: 'The install stays small. Pan the planet while you have signal — streets and Sentinel-2 stay on the device. Tap Save maps before a hike. Sharp aerial (Esri) needs coverage.',
  },
  {
    title: 'Mark what you see',
    body: 'The camera button drops a photo, a tag, or a one-line note at your location. Do that to ground-truth a map class, name a tree, or just remember a fork in the trail.',
  },
  {
    title: 'Share when you are back',
    body: 'Journal → Share pack. One zip: tracks.gpx (Gaia / Earth), field.geojson (QGIS), tracks.csv + observations.csv (spreadsheet), and photos. Maps are optional colouring, never a requirement.',
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onDone }) => {
  const [slide, setSlide] = useState(0);
  const [name, setName] = useState(getUserName() || '');
  const [affiliation, setAffiliation] = useState('');

  const finish = () => {
    if (name.trim()) setUserName(name.trim());
    if (affiliation.trim()) setUserAffiliation(affiliation.trim());
    completeFirstLaunch();
    onDone();
  };

  const last = slide === SLIDES.length;

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="onboard-card">
        {!last ? (
          <>
            <p className="onboard-kicker">Fields</p>
            <h1>{SLIDES[slide].title}</h1>
            <p className="onboard-body">{SLIDES[slide].body}</p>
            <div className="onboard-dots" aria-hidden="true">
              {SLIDES.map((_, i) => (
                <span key={i} className={i === slide ? 'on' : ''} />
              ))}
            </div>
            <div className="onboard-actions">
              <button className="btn" onClick={finish}>Skip</button>
              <button className="btn btn--primary" onClick={() => setSlide(s => s + 1)}>Next</button>
            </div>
          </>
        ) : (
          <>
            <p className="onboard-kicker">Almost ready</p>
            <h1>What should we call you?</h1>
            <p className="onboard-body">Optional. Stored only on this device, written onto each note so you know which records are yours.</p>
            <label className="vc-field-label">Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name or nickname" />
            </label>
            <label className="vc-field-label">Group (optional)
              <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} placeholder="Team, village, university…" />
            </label>
            <div className="onboard-actions">
              <button className="btn" onClick={() => setSlide(SLIDES.length - 1)}>Back</button>
              <button className="btn btn--primary" onClick={finish}>Start walking</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
