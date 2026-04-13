/**
 * Docker Dashboard Service
 * Uses Tauri invoke to manage Docker containers, volumes, and images via Rust backend (bollard).
 */

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  created: number;
}

export interface DockerStats {
  running: number;
  stopped: number;
  total: number;
}

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  labels: string;
}

export interface ImageInfo {
  id: string;
  repo_tags: string[];
  size: number;
  created: number;
  containers: number;
}

let _isTauri: boolean | null = null;

export function isTauriEnvironment(): boolean {
  if (_isTauri === null) {
    _isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
  return _isTauri;
}

async function getTauriInvoke(): Promise<typeof import('@tauri-apps/api/core').invoke | null> {
  try {
    const mod = await import('@tauri-apps/api/core');
    return mod.invoke;
  } catch {
    return null;
  }
}

// ── Containers ──────────────────────────────────────

export async function dockerList(): Promise<[ContainerInfo[], DockerStats]> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<[ContainerInfo[], DockerStats]>('docker_list');
}

export async function dockerStart(containerId: string): Promise<void> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<void>('docker_start', { containerId });
}

export async function dockerStop(containerId: string): Promise<void> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<void>('docker_stop', { containerId });
}

export async function dockerRestart(containerId: string): Promise<void> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<void>('docker_restart', { containerId });
}

export async function dockerRemove(containerId: string, force: boolean = false): Promise<void> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<void>('docker_remove', { containerId, force });
}

export async function dockerLogs(containerId: string, lines: number = 100): Promise<string[]> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<string[]>('docker_logs', { containerId, lines });
}

// ── Volumes ─────────────────────────────────────────

export async function dockerVolumeList(): Promise<VolumeInfo[]> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<VolumeInfo[]>('docker_volume_list');
}

export async function dockerVolumeRemove(name: string, force: boolean = false): Promise<void> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<void>('docker_volume_remove', { name, force });
}

// ── Images ──────────────────────────────────────────

export async function dockerImageList(): Promise<ImageInfo[]> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<ImageInfo[]>('docker_image_list');
}

export async function dockerImageRemove(imageId: string, force: boolean = false): Promise<void> {
  const invoke = await getTauriInvoke();
  if (!invoke) throw new Error('Docker Dashboard requires the desktop app');

  return invoke<void>('docker_image_remove', { imageId, force });
}

// ── Helpers ─────────────────────────────────────────

export function getStateColor(state: string): string {
  switch (state.toLowerCase()) {
    case 'running': return 'running';
    case 'exited': return 'exited';
    case 'paused': return 'paused';
    case 'restarting': return 'restarting';
    default: return 'unknown';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
