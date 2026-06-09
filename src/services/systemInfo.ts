import { invoke } from '@tauri-apps/api/core';
import { SystemInfo } from '../types';

/** Detect the host hardware (CPU/GPU/RAM/OS) via the Rust backend. */
export async function getSystemInfo(): Promise<SystemInfo> {
  return await invoke<SystemInfo>('get_system_info');
}
