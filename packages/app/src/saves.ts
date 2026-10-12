import { G, $ } from './game';
import { appText, loc } from './i18n';
import { ui, invalidate } from './store';
import { confirmPopup } from './ui/modal';
import { reportEvent, flushAnalytics } from './analytics';
import { triggerAutoCloudBackup } from './cloud-save';

/** Save metadata without replacing the run's room-entry checkpoint. */
export function saveMetadata() {
  if ($.vfs.restored) return;
  const sm = G.SaveManager.Instance;
  for (const save of ['SaveSettings', 'SavePrefsFile', 'SaveProgressFile', 'SaveProfile']) sm[save]();
  triggerAutoCloudBackup();
}
const notice = (key: string) => { ui.toast = appText(key); invalidate(); };
let busy = false;
async function downloadBackup() {
  // A full/broken browser store must not prevent downloading the last readable checkpoint.
  try { await G.SaveManager.Instance.CurrentRunSaveTask; saveMetadata(); } catch (e) { console.warn('Exporting previous saves', e); }
  try { await $.vfs.flush(); } catch (e) { console.warn('Exporting previous saves', e); }
  const files = $.vfs.list('user://').filter((p: string) => !p.endsWith('.tmp')).sort().map((p: string) => [p, $.vfs.read(p)!] as [string, string]);
  const text = await G.encodeBackup(files);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `sts2-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
export async function exportSaves() {
  if (busy) return;
  busy = true;
  try { await downloadBackup(); notice('backupExported'); reportEvent('save_export'); }
  catch (e) { console.error(e); notice('backupFailed'); }
  finally { busy = false; }
}
export function importSaves() {
  if (busy) return;
  if ($.vfs.backend !== 'indexeddb' || !navigator.locks) { notice('restoreUnavailable'); return; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file || busy) return;
    busy = true;
    try {
      const files = await G.decodeBackup(await file.text());
      // Download the current state before the destructive confirmation, then require explicit acknowledgement.
      await downloadBackup();
      const yes = await confirmPopup({ header: appText('restoreSaves'), body: appText('restoreBody'), yes: appText('restoreButton'), no: loc('main_menu_ui', 'GENERIC_POPUP.cancel') });
      if (!yes) return;
      await $.vfs.restore(files);
      reportEvent('save_import');
      await flushAnalytics();
      location.reload();
    } catch (e) { console.error(e); notice('backupFailed'); }
    finally { busy = false; }
  };
  input.click();
}
export async function protectStorage() {
  try {
    const granted = await navigator.storage?.persist?.();
    await confirmPopup({ header: appText('protectStorage'), body: appText(granted ? 'storageProtected' : 'storageNotProtected'), yes: loc('main_menu_ui', 'GENERIC_POPUP.confirm') });
  } catch { notice('storageNotProtected'); }
}

const TAB_ID = Math.random().toString(36).slice(2);
const LOCK_NAME = 'sts2-save-writer';
const lockChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sts2-tab-lock') : null;

let releaseHeldLock: (() => void) | null = null;
let lockSuspended = false;

// 监听跨标签页协作广播
if (lockChannel) {
  lockChannel.onmessage = (e) => {
    const data = e.data;
    if (!data || data.from === TAB_ID) return;
    if (data.type === 'REQUEST_RELEASE') {
      // 若当前页面处于后台挂起状态，主动让出锁给前台活跃标签页
      if (typeof document !== 'undefined' && document.hidden && releaseHeldLock) {
        releaseHeldLock();
        releaseHeldLock = null;
      }
    } else if (data.type === 'FORCE_TAKEOVER') {
      // 其他页面被强制接管，释放锁并暂停本地写盘以防冲突
      if (releaseHeldLock) {
        releaseHeldLock();
        releaseHeldLock = null;
      }
      lockSuspended = true;
      $.setStorageErrorHandler((path: string, err: unknown) => {
        console.warn('Save writing suspended due to tab takeover:', path, err);
      });
      ui.toast = appText('tabTakenOver');
      invalidate();
    }
  };
}

/** 单次尝试获取锁 */
function tryAcquireLockOnce(): Promise<boolean> {
  if (!navigator.locks) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    navigator.locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (lock) {
        resolved = true;
        resolve(true);
        return new Promise<void>((rel) => {
          releaseHeldLock = rel;
        });
      } else {
        resolved = true;
        resolve(false);
        return undefined;
      }
    }).catch(() => {
      if (!resolved) resolve(false);
    });
  });
}

/**
 * 尝试获取存档独占锁。
 * 包含退避重试（避免刷新页面时旧进程锁尚未解绑的微秒冲突），以及跨标签页自动协商。
 */
export async function acquireSaveLock(retries = 3, intervalMs = 280): Promise<boolean> {
  if (!navigator.locks) return true;

  if (await tryAcquireLockOnce()) return true;

  // 首次未成功，向其他标签页发出让出请求（若有在后台闲置的页面，它会自动释放）
  try { lockChannel?.postMessage({ type: 'REQUEST_RELEASE', from: TAB_ID }); } catch {}

  // 渐进重试等待旧页面卸载解绑
  for (let i = 0; i < retries; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (await tryAcquireLockOnce()) return true;
  }

  return false;
}

/**
 * 强制在此页面启动并接管控制权。
 * 向其他标签页广播接管通知，使其暂停写盘；并在后台尝试接续申请系统锁。
 */
export function forceAcquireSaveLock() {
  try { lockChannel?.postMessage({ type: 'FORCE_TAKEOVER', from: TAB_ID }); } catch {}
  if (navigator.locks) {
    setTimeout(() => {
      navigator.locks.request(LOCK_NAME, (lock) => {
        if (!lock) return;
        return new Promise<void>((rel) => {
          releaseHeldLock = rel;
        });
      }).catch(() => {});
    }, 400);
  }
}
