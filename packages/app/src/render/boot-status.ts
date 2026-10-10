// 启动加载状态与监听器
export interface BootState {
  progress: number; // 0 ~ 100
  title: string;
  detail: string;
  gpuInfo: string;
  ready: boolean;
  logoDone: boolean;
}

export const bootState: BootState = {
  progress: 0,
  title: 'Loading…',
  detail: '',
  gpuInfo: '',
  ready: false,
  logoDone: false,
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

let resolveLogoDone: (() => void) | null = null;
export const logoDonePromise = new Promise<void>((resolve) => {
  resolveLogoDone = resolve;
});

export function finishLogo() {
  updateBootProgress({ logoDone: true });
  if (resolveLogoDone) {
    resolveLogoDone();
    resolveLogoDone = null;
  }
}

