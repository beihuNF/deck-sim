// Steam 云存档同步与备份模块（方案 A：仅为登录 Steam 的用户提供云存档漫游）
import { G, $ } from './game';
import { appText, loc } from './i18n';
import { ui, invalidate } from './store';
import { confirmPopup } from './ui/modal';
import { steam } from './steam';
import { saveMetadata } from './saves';

export interface CloudSaveMeta {
  exists: boolean;
  updatedAt?: number;
  fileCount?: number;
  playtime?: number;
  byteLength?: number;
}

export const cloudSave = {
  meta: null as CloudSaveMeta | null,
  loading: false,
  uploading: false,
  restoring: false,
  lastError: null as string | null,
};

const toast = (text: string) => { ui.toast = text; invalidate(); };

/** 格式化日期时间（YYYY-MM-DD HH:mm） */
export function formatCloudSaveTime(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${y}-${m}-${day} ${h}:${min}`;
}

const syncKey = (steamId: string) => `sts2_cloud_synced_${steamId}`;
const modKey = (steamId: string) => `sts2_save_mtime_${steamId}`;

export function markLocalSaveModified() {
  if (!steam.profile?.steamId) return;
  try { localStorage.setItem(modKey(steam.profile.steamId), String(Date.now())); } catch {}
}

export function getLocalSaveModified(steamId: string): number {
  try { return Number(localStorage.getItem(modKey(steamId))) || 0; } catch { return 0; }
}

export function getLastCloudSyncedAt(steamId: string): number {
  try { return Number(localStorage.getItem(syncKey(steamId))) || 0; } catch { return 0; }
}

export function setLastCloudSyncedAt(steamId: string, ts: number) {
  try {
    localStorage.setItem(syncKey(steamId), String(ts));
    localStorage.setItem(modKey(steamId), String(ts));
  } catch {}
}

/** 打包本地当前的所有 user:// 存档并计算校验和与游玩时长 */
export async function packLocalSave(): Promise<{ backup: string; playtime: number; fileCount: number }> {
  try { await G.SaveManager.Instance?.CurrentRunSaveTask; saveMetadata(); } catch (e) { console.warn('Flush before pack', e); }
  try { await $.vfs.flush(); } catch (e) { console.warn('Vfs flush before pack', e); }

  const files = $.vfs.list('user://').filter((p: string) => !p.endsWith('.tmp')).sort().map((p: string) => [p, $.vfs.read(p)!] as [string, string]);
  const backup = await G.encodeBackup(files);
  let playtime = 0;
  try { playtime = Number(G.SaveManager.Instance?.Progress?.TotalPlaytime) || 0; } catch {}
  return { backup, playtime, fileCount: files.length };
}

/** 获取云端存档元数据（轻量请求，不下载庞大存档体） */
export async function fetchCloudSaveMeta(): Promise<CloudSaveMeta | null> {
  if (!steam.profile?.steamId) return null;
  cloudSave.loading = true;
  try {
    const res = await fetch('/api/auth/cloud-save?meta=1', { cache: 'no-store' });
    if (!res.ok) {
      cloudSave.meta = null;
      return null;
    }
    const data = (await res.json()) as CloudSaveMeta;
    cloudSave.meta = data;
    invalidate();
    return data;
  } catch (e) {
    console.warn('Fetch cloud save meta failed:', e);
    return null;
  } finally {
    cloudSave.loading = false;
    invalidate();
  }
}

/** 上传本地存档至 Steam 云端 */
export async function uploadCloudSave(interactive = false): Promise<boolean> {
  const profile = steam.profile;
  if (!profile?.steamId || cloudSave.uploading) return false;

  cloudSave.uploading = true;
  if (interactive) toast(appText('cloudSaveUploading'));

  try {
    const { backup, playtime, fileCount } = await packLocalSave();
    const res = await fetch('/api/auth/cloud-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup, playtime }),
    });

    if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
    const result = (await res.json()) as any;
    const updatedAt = Number(result?.updatedAt) || Date.now();

    setLastCloudSyncedAt(profile.steamId, updatedAt);
    cloudSave.meta = {
      exists: true,
      updatedAt,
      fileCount,
      playtime,
      byteLength: backup.length,
    };

    if (interactive) toast(appText('cloudSaveUploaded'));
    invalidate();
    return true;
  } catch (err: any) {
    console.error('Upload cloud save failed:', err);
    if (interactive) toast(appText('backupFailed'));
    return false;
  } finally {
    cloudSave.uploading = false;
    invalidate();
  }
}

/** 从 Steam 云端恢复存档至当前设备 */
export async function restoreCloudSaveFromCloud(interactive = false): Promise<boolean> {
  const profile = steam.profile;
  if (!profile?.steamId || cloudSave.restoring) return false;

  cloudSave.restoring = true;
  if (interactive) toast(appText('cloudSaveRestoring'));

  try {
    const res = await fetch('/api/auth/cloud-save', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
    const data = (await res.json()) as any;
    if (!data || !data.exists || !data.backup) {
      toast(appText('cloudSaveNone'));
      return false;
    }

    const files = await G.decodeBackup(data.backup);
    await $.vfs.restore(files);

    if (data.updatedAt) {
      setLastCloudSyncedAt(profile.steamId, Number(data.updatedAt));
    }

    toast(appText('cloudSaveRestored'));
    setTimeout(() => location.reload(), 500);
    return true;
  } catch (err: any) {
    console.error('Restore cloud save failed:', err);
    toast(appText('backupFailed'));
    return false;
  } finally {
    cloudSave.restoring = false;
    invalidate();
  }
}

let syncInProgress = false;

/** 登录 Steam 或游戏启动时执行智能同步检测 */
export async function checkCloudSaveSync(options: { interactive?: boolean } = {}) {
  const profile = steam.profile;
  if (!profile?.steamId || syncInProgress) return;
  syncInProgress = true;

  try {
    const meta = await fetchCloudSaveMeta();
    if (!meta) return;

    const steamId = profile.steamId;
    const lastSynced = getLastCloudSyncedAt(steamId);
    const localModified = getLocalSaveModified(steamId);

    // 判断本地是否属于近乎空白的全新环境（例如无痕浏览、新设备或清除数据后）
    let isLocalBlank = false;
    try {
      const pt = Number(G.SaveManager.Instance?.Progress?.TotalPlaytime) || 0;
      const userFiles = $.vfs.list('user://');
      isLocalBlank = pt === 0 && userFiles.length <= 3;
    } catch {
      isLocalBlank = false;
    }

    if (meta.exists && meta.updatedAt) {
      // 场景 1：本地是新设备/空数据，而云端已有存档
      if (isLocalBlank) {
        const timeStr = formatCloudSaveTime(meta.updatedAt);
        const yes = await confirmPopup({
          header: appText('cloudSaveTitle'),
          body: appText('cloudSaveConflictBody').replace('{Time}', timeStr),
          yes: appText('cloudSaveRestoreNow'),
          no: appText('cloudSaveKeepLocal'),
        });
        if (yes) {
          await restoreCloudSaveFromCloud(true);
        }
        return;
      }

      // 场景 2：云端时间显著晚于本地记录的上次同步时间（在其他设备游玩过并备份了）
      const cloudNewer = meta.updatedAt > (lastSynced || 0) + 15_000;
      const localHasNewerChanges = localModified > (lastSynced || 0) + 15_000;

      if (cloudNewer) {
        if (!localHasNewerChanges) {
          // 本地无新进度，云端有更新进度：提示一键同步
          const timeStr = formatCloudSaveTime(meta.updatedAt);
          const yes = await confirmPopup({
            header: appText('cloudSaveTitle'),
            body: appText('cloudSaveConflictBody').replace('{Time}', timeStr),
            yes: appText('cloudSaveRestoreNow'),
            no: appText('cloudSaveKeepLocal'),
          });
          if (yes) {
            await restoreCloudSaveFromCloud(true);
          }
        } else {
          // 双端都有新改动（冲突）：提示玩家选择
          const timeStr = formatCloudSaveTime(meta.updatedAt);
          const yes = await confirmPopup({
            header: appText('cloudSaveSyncConflict'),
            body: appText('cloudSaveConflictBody').replace('{Time}', timeStr),
            yes: appText('cloudSaveRestoreNow'),
            no: appText('cloudSaveKeepLocal'),
          });
          if (yes) {
            await restoreCloudSaveFromCloud(true);
          }
        }
      } else if (localHasNewerChanges || !lastSynced) {
        // 本地比云端新：静默上传备份
        void uploadCloudSave(false);
      }
    } else {
      // 云端尚无备份：若本地有存档，自动将当前存档备份到云端
      if (!isLocalBlank) {
        void uploadCloudSave(false);
      }
    }
  } catch (e) {
    console.warn('Auto cloud save sync check error:', e);
  } finally {
    syncInProgress = false;
  }
}

let autoBackupTimer: any = null;

/** 本地保存后的防抖自动静默备份（30 秒防抖） */
export function triggerAutoCloudBackup() {
  if (!steam.profile?.steamId) return;
  markLocalSaveModified();
  if (autoBackupTimer) clearTimeout(autoBackupTimer);
  autoBackupTimer = setTimeout(() => {
    autoBackupTimer = null;
    void uploadCloudSave(false);
  }, 20_000);
}
