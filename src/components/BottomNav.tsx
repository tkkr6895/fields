import React from 'react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCaptureClick: () => void;
  recording?: boolean;
  pendingSync?: number;
}

const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  onCaptureClick,
  recording = false,
  pendingSync = 0,
}) => {
  return (
    <nav className="bottom-nav" aria-label="Main">
      <button
        className={`nav-item ${activeTab === 'log' ? 'active' : ''}`}
        onClick={() => onTabChange('log')}
      >
        <div className="nav-item-badge-container">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          {pendingSync > 0 && <span className="nav-badge">{pendingSync}</span>}
        </div>
        <span>Journal</span>
      </button>

      <button
        className="nav-capture-btn"
        onClick={onCaptureClick}
        title={recording ? 'Mark this spot on the track' : 'Photograph or tag this spot'}
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2"/>
          <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"/>
        </svg>
      </button>

      <button
        className={`nav-item ${activeTab === 'layers' ? 'active' : ''}`}
        onClick={() => onTabChange('layers')}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
          <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
        </svg>
        <span>Maps</span>
      </button>
    </nav>
  );
};

export default BottomNav;
