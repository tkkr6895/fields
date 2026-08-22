import { useState } from 'react';
import { completeFirstLaunch, getUserName, setUserAffiliation, setUserName } from '../services/DeviceService';

interface OnboardingProps {
  onDone: () => void;
}

const SLIDES = [
  {
    title: 'Photograph the tree',
    body: 'Tap the green +. The camera opens immediately. Name the tree if you can, say native / plantation / mixed, then save and keep walking. Nothing waits on the network.',
  },
  {
    title: 'Maps are a hint, not the truth',
    body: 'You can colour the map with IndiaSAT land cover from CoRE Stack, and every photo stores a Tessera tile id. If the map looks wrong, that is useful — record what is on the ground.',
  },
  {
    title: 'Your notes train better maps',
    body: 'Each save stores GPS, a photo, tree name if you know it, and stand type. Maps and weather attach later when you have signal. Export from the Log when you are back.',
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
            <div className="onboard-dots">
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
            <p className="onboard-body">Optional. Stored only on this device, and written onto each observation so you know which notes are yours.</p>
            <label className="vc-field-label">Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name or nickname" />
            </label>
            <label className="vc-field-label">Group (optional)
              <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} placeholder="Team, village, university…" />
            </label>
            <div className="onboard-actions">
              <button className="btn" onClick={() => setSlide(SLIDES.length - 1)}>Back</button>
              <button className="btn btn--primary" onClick={finish}>Start mapping</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
