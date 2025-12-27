/**
 * Network Status Hook
 * 
 * Provides reactive network status tracking for online/offline mode.
 */

import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

export function useNetworkStatus(): NetworkStatus {
  const getConnection = (): NetworkInformation | undefined => {
    return navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  };

  const getNetworkStatus = useCallback((): NetworkStatus => {
    const connection = getConnection();
    return {
      isOnline: navigator.onLine,
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData
    };
  }, []);

  const [status, setStatus] = useState<NetworkStatus>(getNetworkStatus);

  useEffect(() => {
    const handleOnline = () => setStatus(getNetworkStatus());
    const handleOffline = () => setStatus(getNetworkStatus());
    const handleConnectionChange = () => setStatus(getNetworkStatus());

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const connection = getConnection();
    if (connection) {
      connection.addEventListener('change', handleConnectionChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      
      if (connection) {
        connection.removeEventListener('change', handleConnectionChange);
      }
    };
  }, [getNetworkStatus]);

  return status;
}

/**
 * Get network quality description
 */
export function getNetworkQuality(status: NetworkStatus): 'excellent' | 'good' | 'fair' | 'poor' | 'offline' {
  if (!status.isOnline) return 'offline';
  
  if (!status.effectiveType) return 'good';
  
  switch (status.effectiveType) {
    case '4g':
      return 'excellent';
    case '3g':
      return 'good';
    case '2g':
      return 'fair';
    case 'slow-2g':
      return 'poor';
    default:
      return 'good';
  }
}
