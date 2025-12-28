import React from 'react';

interface HeaderProps {
  isOnline: boolean;
  syncStatus?: { pending: number; lastSync?: Date };
  onSettingsClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ isOnline, syncStatus, onSettingsClick }) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-logo">
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 2L4 10v12l12 8 12-8V10L16 2z" fill="url(#logoGrad)" opacity="0.9"/>
            <path d="M16 6l-8 5v8l8 5 8-5v-8l-8-5z" fill="#0f0f1a"/>
            <path d="M16 8l-6 4v6l6 4 6-4v-6l-6-4z" fill="url(#logoGrad2)"/>
            <circle cx="16" cy="15" r="3" fill="#0f0f1a"/>
            <path d="M14 14h4v3h-4z" fill="#4caf50"/>
            <defs>
              <linearGradient id="logoGrad" x1="4" y1="4" x2="28" y2="28">
                <stop offset="0%" stopColor="#4caf50"/>
                <stop offset="100%" stopColor="#2e7d32"/>
              </linearGradient>
              <linearGradient id="logoGrad2" x1="10" y1="8" x2="22" y2="22">
                <stop offset="0%" stopColor="#81c784"/>
                <stop offset="100%" stopColor="#4caf50"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="header-title">
          <span className="title-main">WG Field Validator</span>
          <span className="title-sub">Western Ghats Eco-Monitor</span>
        </div>
      </div>
      
      <div className="header-status">
        <div className={`connection-indicator ${isOnline ? 'online' : 'offline'}`}>
          <span className="indicator-dot"></span>
          <span className="indicator-text">{isOnline ? 'Online' : 'Offline'}</span>
        </div>
        
        {syncStatus && syncStatus.pending > 0 && (
          <div className="sync-badge">
            <span className="sync-icon">↻</span>
            <span className="sync-count">{syncStatus.pending}</span>
          </div>
        )}
        
        <button className="header-settings" onClick={onSettingsClick} title="Settings">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    </header>
  );
};

export default Header;
