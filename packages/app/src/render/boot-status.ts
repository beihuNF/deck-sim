// Boot loading progress state and listeners
export interface BootState {
  progress: number; // 0 ~ 100
  title: string;
  detail: string;
  gpuInfo: string;
}

export const bootState: BootState = {
  progress: 0,
  title: 'Loading…',
  detail: '',
  gpuInfo: '',
};

type BootListener = (state: BootState) => void;
const listeners = new Set<BootListener>();

export function updateBootProgress(patch: Partial<BootState>) {
  Object.assign(bootState, patch);
  for (const l of listeners) l(bootState);
}

export function subscribeBootProgress(l: BootListener): () => void {
  listeners.add(l);
  l(bootState);
  return () => {
    listeners.delete(l);
  };
}
