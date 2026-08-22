import React from 'react';
import { NetworkStatus, getNetworkQuality } from '../hooks/useNetworkStatus';

interface NetworkIndicatorProps {
  status: NetworkStatus;
  pendingSync?: number;
}

const NetworkIndicator: React.FC<NetworkIndicatorProps> = ({ status, pendingSync = 0 }) => {
  const quality = getNetworkQuality(status);

  const getIcon = () => {
    switch (quality) {
      case 'excellent':
        return '📶';
      case 'good':
        return '📶';
      case 'fair':
        return '📱';
      case 'poor':
        return '📵';
      case 'offline':
        return '📴';
    }
  };

  const getLabel = () => {
    if (!status.isOnline) return 'Offline';
    if (status.effectiveType) {
      return status.effectiveType.toUpperCase();
    }
    return 'Online';
  };

  return (
    <div className={`network-indicator ${quality}`} title={`${getLabel()} - ${pendingSync} pending`}>
      <span className="network-icon">{getIcon()}</span>
      {pendingSync > 0 && (
        <span className="sync-badge">{pendingSync}</span>
      )}
    </div>
  );
};

export default NetworkIndicator;
