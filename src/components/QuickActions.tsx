import React, { useState } from 'react';

interface QuickActionsProps {
  onLocateMe: () => void;
  onCapture: () => void;
  onShowLayers: () => void;
  onShowFieldLog: () => void;
  onShowProtocols: () => void;
  onExport: () => void;
  activePanel?: string;
}

const QuickActions: React.FC<QuickActionsProps> = ({
  onLocateMe,
  onCapture,
  onShowLayers,
  onShowFieldLog,
  onShowProtocols,
  onExport,
  activePanel
}) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`quick-actions ${expanded ? 'expanded' : ''}`}>
      {/* Main Capture Button */}
      <button 
        className="main-action-btn capture"
        onClick={onCapture}
        title="Record Observation"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
        </svg>
      </button>

      {/* Quick Actions Ring */}
      <div className="actions-ring">
        <button 
          className={`ring-action ${activePanel === 'layers' ? 'active' : ''}`}
          onClick={onShowLayers}
          title="Data Layers"
          style={{ '--angle': '0deg' } as React.CSSProperties}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/>
          </svg>
        </button>

        <button 
          className="ring-action"
          onClick={onLocateMe}
          title="My Location"
          style={{ '--angle': '60deg' } as React.CSSProperties}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
        </button>

        <button 
          className={`ring-action ${activePanel === 'fieldlog' ? 'active' : ''}`}
          onClick={onShowFieldLog}
          title="Field Log"
          style={{ '--angle': '120deg' } as React.CSSProperties}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
        </button>

        <button 
          className={`ring-action ${activePanel === 'protocols' ? 'active' : ''}`}
          onClick={onShowProtocols}
          title="Field Protocols"
          style={{ '--angle': '180deg' } as React.CSSProperties}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
          </svg>
        </button>

        <button 
          className="ring-action"
          onClick={onExport}
          title="Export Data"
          style={{ '--angle': '240deg' } as React.CSSProperties}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </button>
      </div>

      {/* Toggle Expand */}
      <button 
        className="expand-toggle"
        onClick={() => setExpanded(!expanded)}
        title={expanded ? 'Collapse' : 'Expand'}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d={expanded 
            ? "M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"
            : "M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"
          }/>
        </svg>
      </button>
    </div>
  );
};

export default QuickActions;
