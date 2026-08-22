/**
 * DeviceService — Lightweight user identity (Tasks 1.9.1, 1.9.2, 1.9.3)
 *
 * Generates and persists a unique deviceId (UUID) in localStorage on first launch.
 * Also stores an optional display name and affiliation for the observer.
 */

import { v4 as uuidv4 } from 'uuid';

const DEVICE_ID_KEY = 'fields_device_id';
const USER_NAME_KEY = 'fields_user_name';
const USER_AFFILIATION_KEY = 'fields_user_affiliation';
const FIRST_LAUNCH_KEY = 'fields_first_launch_completed';

/** Get (or generate) a persistent device UUID */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(DEVICE_ID_KEY, id);
    console.log('[DeviceService] Generated new deviceId:', id);
  }
  return id;
}

/** Get display name (if set) */
export function getUserName(): string | null {
  return localStorage.getItem(USER_NAME_KEY);
}

/** Set display name */
export function setUserName(name: string): void {
  localStorage.setItem(USER_NAME_KEY, name);
}

/** Get affiliation (if set) */
export function getUserAffiliation(): string | null {
  return localStorage.getItem(USER_AFFILIATION_KEY);
}

/** Set affiliation */
export function setUserAffiliation(affiliation: string): void {
  localStorage.setItem(USER_AFFILIATION_KEY, affiliation);
}

/** Check if first-launch prompt has been completed */
export function isFirstLaunchCompleted(): boolean {
  return localStorage.getItem(FIRST_LAUNCH_KEY) === 'true';
}

/** Mark first-launch prompt as completed */
export function completeFirstLaunch(): void {
  localStorage.setItem(FIRST_LAUNCH_KEY, 'true');
}
