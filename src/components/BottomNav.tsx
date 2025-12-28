import React from 'react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onCaptureClick: () => void;
  pendingSync?: number;
}

const BottomNav: React.FC<BottomNavProps> = ({ 
  activeTab, 
  onTabChange, 
  onCaptureClick,
  pendingSync = 0 
}) => {
  return (
    <nav className="bottom-nav">
      <button 
        className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
        onClick={() => onTabChange('map')}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>
        </svg>
        <span>Map</span>
      </button>

      <button 
        className={`nav-item ${activeTab === 'layers' ? 'active' : ''}`}
        onClick={() => onTabChange('layers')}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
        </svg>
        <span>Layers</span>
      </button>

      {/* Central Capture Button */}
      <button 
        className="nav-capture-btn"
        onClick={onCaptureClick}
        title="Add Field Observation"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
        </svg>
      </button>

      <button 
        className={`nav-item ${activeTab === 'protocols' ? 'active' : ''}`}
        onClick={() => onTabChange('protocols')}
      >
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
        <span>Guide</span>
      </button>

      <button 
        className={`nav-item ${activeTab === 'log' ? 'active' : ''}`}
        onClick={() => onTabChange('log')}
      >
        <div className="nav-item-badge-container">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
          {pendingSync > 0 && (
            <span className="nav-badge">{pendingSync}</span>
          )}
        </div>
        <span>Log</span>
      </button>
    </nav>
  );
};

export default BottomNav;
