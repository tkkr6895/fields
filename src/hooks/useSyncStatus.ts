/**
 * useSyncStatus hook (Task 1.4.7)
 *
 * Provides reactive access to SyncEngine status for UI components.
 */

import { useState, useEffect } from 'react';
import { syncEngine, SyncEngineStatus } from '../services/SyncEngine';

export function useSyncStatus(): SyncEngineStatus {
  const [status, setStatus] = useState<SyncEngineStatus>(syncEngine.getStatus());

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}
