// Multiplayer menus and lobby using original game assets and layouts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'preact/hooks';
import { G, $, list } from '../game';
import { safe } from './comp-shared';
import {
  multiplayer as mp, mpText as tr, connectMultiplayer, selectMultiplayerCharacter,
  readyMultiplayer, configureMultiplayer, leaveMultiplayer, kickMultiplayerPlayer, multiplayerError, invitedRoomCode, parseRoomInvitation, multiplayerPlayerName, retryMultiplayer,
  buildRoomInviteUrl, renameMultiplayer,
} from '../multiplayer';
import { BackButton, ConfirmButton, UnreadyButton, GameTextureButton } from './buttons';
import { SubmenuButton, characters, epochRevealed } from './menu';
import { CharacterSelectButton, InfoPanel, AscensionPanel } from './charselect';
import { DailyRun, CustomRun } from './modes';
import { PopupButton } from './modal';
import { loc, appText } from '../i18n';
import { imageUrl, frameByName, frameStyle } from '../assets';
import { playOneShot } from '../audio';
import { tint } from '../filters';
import { charSelectBg } from '../render/scene';
import { transitionView } from './transition';
import './multiplayer.css';
import { steam, loadSteamProfile, loginSteam, logoutSteam, getGuestName, setGuestName, hasSetGuestName, effectivePlayerName } from '../steam';
import { cloudSave, uploadCloudSave, restoreCloudSaveFromCloud, fetchCloudSaveMeta, formatCloudSaveTime } from '../cloud-save';
import { confirmPopup } from './modal';

const m = (k: string) => loc('main_menu_ui', k);
function RoomDialogBackground() {
  // JoinFriendSubmenu.Panel self_modulate; keep it on the texture, not the labels and buttons.
  return <div class="mp-dialog-bg" style={{
    borderImageSource: `url(${imageUrl('images/ui/tiny_nine_patch.png')})`,
    filter: tint(0.11309999, 0.25167164, 0.29, 0.7529412),
  }} />;
}
const shake = () => {
  try {
    $.ext('MegaCrit.Sts2.Core.Nodes.NGame').Instance?.ScreenShake(
      $.ext('MegaCrit.Sts2.Core.Nodes.Vfx.Utilities.ShakeStrength').Weak,
      $.ext('MegaCrit.Sts2.Core.Nodes.Vfx.Utilities.ShakeDuration').Short,
      90
    );
  } catch {
    // 忽略异常
  }
};

export function MultiplayerLobby({ onBack }: { onBack: () => void }) {
  useEffect(() => { void loadSteamProfile(); }, []);
  const [view, setView] = useState<'menu' | 'host' | 'join' | 'guest_join'>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [guestNameInput, setGuestNameInput] = useState(() => getGuestName());
  const [editingMyName, setEditingMyName] = useState(false);
  const [nameInputVal, setNameInputVal] = useState('');
  const [mpAbandonConfirm, setMpAbandonConfirm] = useState(false);
  const [mpSaveTick, setMpSaveTick] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [, setKickGen] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [accountHover, setAccountHover] = useState(false);

  useEffect(() => {
    if (showAccountDialog && steam.profile) {
      void fetchCloudSaveMeta();
    }
  }, [showAccountDialog]);

  const charList = characters();
  const me = mp.players.find(p => p.id === mp.id);
  const currentHeroId = preview ?? (me?.character ?? 'ironclad').toUpperCase();
  const selectedCharObj = charList.find(c => c.c.Id.Entry === currentHeroId) ?? charList[0];
  const dailySetup = mp.phase === 'lobby' && mp.mode === 'daily' && mp.settings.dailyDate ? G.webDailySetup(mp.settings.dailyDate, mp.players) : null;
  useEffect(() => { if (mp.phase !== 'lobby') setPreview(null); }, [mp.phase]);

  const startConnect = async (code?: string, mode: 'standard' | 'daily' | 'custom' | 'load' = 'standard', extra?: { saveJson?: string; loadInfo?: any }) => {
    await transitionView.FadeOut(0.35);
    try {
      await connectMultiplayer(code, mode, extra);
    } finally {
      await transitionView.FadeIn(0.35);
    }
  };

  // 从 URL 参数自动加入房间（若为全新游客未设定昵称，走方案 B 迎宾弹窗）
  useEffect(() => {
    const code = invitedRoomCode();
    if (code && mp.phase === 'idle') {
      if (!hasSetGuestName() && !steam.profile) {
        setView('guest_join');
      } else {
        void startConnect(code);
      }
    }
  }, []);

  // 打开输入房间码窗口时，若剪贴板内有房间码/链接则自动填入
  useEffect(() => {
    if (view === 'join' && !joinCode) {
      void (async () => {
        try {
          const text = await navigator.clipboard?.readText();
          const code = parseRoomInvitation(text ?? '');
          if (code) setJoinCode(code);
        } catch { }
      })();
    }
  }, [view]);

  // 房间大厅角色背景同步（load 模式自动展示存盘房主立绘）
  useEffect(() => {
    if (mp.phase === 'lobby') {
      if (mp.mode === 'load') {
        const char = (mp.loadInfo?.hostCharacter || 'ironclad').toLowerCase();
        void charSelectBg(char);
      } else if (mp.mode !== 'daily' && selectedCharObj) {
        void charSelectBg(selectedCharObj.locked ? null : String(selectedCharObj.c.Id.Entry).toLowerCase());
      } else {
        void charSelectBg(null);
      }
    } else {
      void charSelectBg(null);
    }
    return () => { void charSelectBg(null); };
  }, [mp.phase, mp.mode, mp.loadInfo?.hostCharacter, selectedCharObj?.c?.Id?.Entry]);

  const copyText = (text: string, tag: string) => {
    playOneShot('event:/sfx/ui/clicks/ui_click');
    void navigator.clipboard?.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 2000);
  };

  const exit = () => {
    if (mp.phase === 'lobby' || mp.phase === 'connecting') {
      leaveMultiplayer();
      setView('menu');
    } else if (view !== 'menu') {
      setView('menu');
    } else {
      leaveMultiplayer();
      onBack();
    }
  };

  const handleSelectChar = (c: any, locked: boolean) => {
    if (me?.ready || mp.mode === 'load') return; // 已就绪或读档模式禁止切人
    const entry = c.Id.Entry;
    if (entry === currentHeroId) return;
    setPreview(entry);
    playOneShot(c.CharacterSelectSfx);
    shake();
    void charSelectBg(locked ? null : String(entry).toLowerCase());
    if (!locked) selectMultiplayerCharacter(entry);
  };

  const daily = epochRevealed(G.DailyRunEpoch);
  const custom = epochRevealed(G.CustomAndSeedsEpoch);
  const hasMpSave = safe(() => G.SaveManager.Instance.HasMultiplayerRunSave, false);

  const handleAbandonMultiplayer = async () => {
    try {
      G.SaveManager.Instance.DeleteCurrentMultiplayerRun();
      await $.vfs.flush();
    } catch (e) {
      console.warn('Failed to delete multiplayer run', e);
    }
    setMpAbandonConfirm(false);
    setMpSaveTick(t => t + 1);
  };

  const handleLoadMultiplayer = async () => {
    try {
      const res = G.SaveManager.Instance.LoadAndCanonicalizeMultiplayerRunSave(0);
      if (!res.Success || !res.SaveData) {
        console.error('Failed to load multiplayer save', res);
        return;
      }
      const save = res.SaveData;
      const saveJson = G.serializeWebRunSave(save);
      const playersList = Array.from(save.Players) as any[];
      const hostPlayer = playersList[0];
      const loadInfo = {
        hostCharacter: hostPlayer?.CharacterId?.Entry || 'ironclad',
        hostHp: hostPlayer?.CurrentHp ?? 80,
        hostMaxHp: hostPlayer?.MaxHp ?? 80,
        hostGold: hostPlayer?.Gold ?? 99,
        act: (save.CurrentActIndex ?? 0) + 1,
        floor: (save.VisitedMapCoords?.Count ?? 0) || 1,
        ascension: save.Ascension ?? 0,
        totalPlayers: playersList.length,
        players: playersList.map((p, idx) => ({
          slot: idx + 1,
          character: p.CharacterId?.Entry || 'ironclad',
          hp: p.CurrentHp,
          maxHp: p.MaxHp,
          gold: p.Gold,
        })),
      };
      await startConnect(undefined, 'load', { saveJson, loadInfo });
    } catch (e) {
      console.error('Error starting load multiplayer', e);
    }
  };

  // 房主与全员就绪判定：至少 2 人，所有玩家（包括房主自身）全部就绪且在线
  const isHost = mp.id === 1;
  const allReady = mp.players.length >= 2 && mp.players.every(p => p.ready && p.connected);

  const remotePlayers = (
    <div class="remote-player-container">
      {/* 单人等待其他玩家提示（对齐原版场景节点顺序：SoloLabel 位于 InviteButtonContainer 上方） */}
      {mp.players.length === 1 && (
        <div class="remote-solo-label">
          {loc('main_menu_ui', 'MULTIPLAYER_CHAR_SELECT.SOLO')}
        </div>
      )}

      {/* 邀请代码与复制按钮（保证域名后紧随斜杠 /，彻底防止手机聊天软件截断） */}
      <div
        class="invite-code-btn"
        onClick={() => copyText(buildRoomInviteUrl(mp.code), 'link')}
        onPointerEnter={() => playOneShot('event:/sfx/ui/clicks/ui_hover')}
        title={tr('点击复制邀请链接与房间号', 'Click to copy invite link and room code')}
      >
        <img class="icb-bg" src={imageUrl('images/ui/reward_screen/reward_item_button.png') ?? ''} />
        <span class="icb-label">
          {copied === 'link' ? tr('已复制邀请链接！', 'Link Copied!') : `${m('INVITE')} · ${mp.code}`}
        </span>
      </div>

      {/* 房间玩家列表（最多 4 人，对齐原版无框纯净悬浮铭牌） */}
      <div class="remote-player-list">
        {[1, 2, 3, 4].map(slotId => {
          const player = mp.players.find(p => p.id === slotId);
          if (!player && mp.players.length >= slotId) return null;
          const isSlotMe = slotId === mp.id;
          const isSlotHost = slotId === 1;
          const pChar = (player?.character ?? 'ironclad').toLowerCase();
          const tickFrame = frameByName('compressed', 'confirm_button_tick');

          if (!player || (mp.mode === 'daily' && isSlotMe)) return null;

          return (
            <div key={slotId} data-player-id={slotId} class={`remote-lobby-player ${isSlotMe ? 'is-me' : ''}`}>
              {/* 角色小头像 */}
              <div class="rlp-avatar-wrap">
                <img
                  class="rlp-avatar"
                  src={player.profile?.avatar || imageUrl(`images/ui/top_panel/character_icon_${pChar}.png`) || ''}
                  alt={player.character}
                />
                {/* 准备状态打勾：遵循原版，只有准备好的玩家才打勾 */}
                {player.ready && (
                  <div
                    class="rlp-ready-tick"
                    style={{
                      ...frameStyle(tickFrame, 40, 40),
                      filter: mp.mode === 'daily' ? tint(0.498, 1, 0) : 'drop-shadow(0 0 4px #7fff00) brightness(1.2)',
                    }}
                  />
                )}
                {/* 断开连接标识 */}
                {!player.connected && (
                  <img
                    class="rlp-disconnect"
                    src={imageUrl('images/ui/disconnected.png') ?? ''}
                  />
                )}
              </div>

              {/* 铭牌与角色名 */}
              <div class="rlp-nameplate">
                <div class="rlp-player-name">
                  {isSlotHost ? tr('[房主] ', '[Host] ') : ''}{multiplayerPlayerName(slotId)}
                  {isSlotMe && (
                    <span
                      class="rlp-edit-name-btn"
                      title={tr('修改昵称', 'Change Name')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNameInputVal(effectivePlayerName());
                        setEditingMyName(true);
                      }}
                    >
                      ✏️
                    </span>
                  )}
                  {isSlotMe && tr('(你)', '(You)')}
                </div>
                <div class="rlp-char-title">
                  <img
                    class="rlp-char-icon-mini"
                    src={imageUrl(`images/ui/top_panel/character_icon_${pChar}.png`) ?? ''}
                    alt=""
                  />
                  <span>{loc('characters', `${player.character}.title`)}</span>
                </div>
              </div>

              {/* 房主踢人操作 */}
              {isHost && !isSlotHost && (
                <button
                  class="rlp-kick-btn"
                  title={tr('踢出玩家', 'Kick Player')}
                  onClick={(e) => {
                    e.stopPropagation();
                    playOneShot('event:/sfx/ui/clicks/ui_click');
                    kickMultiplayerPlayer(slotId);
                    setKickGen(g => g + 1);
                  }}
                >
                  <div
                    class="rlp-kick-icon"
                    style={frameStyle(frameByName('compressed', 'back_button_x'), 20, 20)}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div class="mp-screen-container">
      {/* 多人游戏 Steam 账号 / 联机身份徽章（独立置于右上角，支持全流程随时查看与登录） */}
      {(mp.phase === 'idle' || mp.phase === 'lobby') && (
        <div
          class={'mp-steam-badge' + (accountHover ? ' hover' : '')}
          data-ctl
          role="button"
          tabIndex={0}
          onClick={() => {
            playOneShot('event:/sfx/ui/clicks/ui_click');
            setShowAccountDialog(true);
          }}
          onPointerEnter={e => {
            if (e.pointerType !== 'touch') {
              setAccountHover(true);
              playOneShot('event:/sfx/ui/clicks/ui_hover');
            }
          }}
          onPointerLeave={() => setAccountHover(false)}
        >
          <img
            class="mps-icon"
            src={steam.profile?.avatar || imageUrl('images/ui/mods/steam_logo.png') || ''}
            alt=""
            referrerPolicy="no-referrer"
          />
          <div class="mps-title">
            {steam.profile?.name || tr('游客身份', 'Guest')}
          </div>
          <div class="mps-desc">
            {steam.profile ? tr('已连接 Steam', 'Steam Connected') : tr('点击登录 Steam', 'Sign In Steam')}
            {mp.ping > 0 && (
              <span
                style={{ marginLeft: '6px', color: mp.ping > 150 ? '#f1c40f' : '#85e89d', fontWeight: 'bold' }}
                title={mp.colo ? tr(`当前接入机房: ${mp.colo}`, `Data Center: ${mp.colo}`) : undefined}
              >
                • {mp.ping}ms{mp.colo ? ` (${mp.colo})` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 方案 B：全新游客直接通过邀请链接进入时的迎宾昵称设定弹窗 */}
      {mp.phase === 'idle' && view === 'guest_join' && (
        <div class="mp-join-modal-backstop">
          <div class="mp-join-dialog">
            <RoomDialogBackground />
            <h2 class="mp-dialog-title">{tr('加入联机房间', 'Join Multiplayer Room')}</h2>
            <p class="mp-dialog-desc">
              {tr('收到房间邀请码：', 'Invited to room: ')}<span style={{ color: '#efc851', fontWeight: 'bold' }}>{invitedRoomCode()}</span>
            </p>

            <div class="mp-dialog-input-wrap">
              <div style={{ color: '#fff6e2', fontSize: '20px', marginBottom: '8px', textAlign: 'left', fontWeight: 'bold' }}>
                {tr('请设定你的玩家昵称：', 'Set Your Player Name:')}
              </div>
              <input
                type="text"
                class="mp-dialog-input"
                maxLength={20}
                autoFocus
                placeholder={getGuestName()}
                value={guestNameInput}
                onInput={e => setGuestNameInput(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setGuestName(guestNameInput.trim() || 'Byrdlett');
                    void startConnect(invitedRoomCode()!);
                  }
                }}
              />
            </div>

            {/* 游客迎宾弹窗提供 Steam 快捷登录 */}
            <div class="mp-join-identity-bar" style={{ marginTop: '-12px', marginBottom: '24px' }}>
              <span class="mp-jib-label">
                {steam.profile ? tr('已连接 Steam：', 'Steam Connected: ') : tr('或者直接使用 Steam：', 'Or use Steam: ')}
                {steam.profile && <strong style={{ color: '#efc851' }}>{steam.profile.name}</strong>}
              </span>
              <button
                type="button"
                class="mp-quick-steam-btn"
                onClick={() => setShowAccountDialog(true)}
              >
                <img src={steam.profile?.avatar || imageUrl('images/ui/mods/steam_logo.png') || ''} alt="" class="mqs-icon" />
                <span>{steam.profile ? tr('管理账号', 'Account') : tr('登录 Steam', 'Sign In Steam')}</span>
              </button>
            </div>

            <div class="mp-dialog-buttons">
              <PopupButton
                yes={false}
                text={tr('取消', 'Cancel')}
                onClick={() => {
                  const url = new URL(location.href); url.searchParams.delete('room');
                  history.replaceState(history.state, '', url.href);
                  setView('menu');
                }}
              />
              <PopupButton
                yes={true}
                text={tr('进入房间', 'Join Room')}
                onClick={() => {
                  setGuestName(guestNameInput.trim() || 'Byrdlett');
                  void startConnect(invitedRoomCode()!);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 原版放弃多人对局确认弹窗 */}
      {mpAbandonConfirm && (
        <div class="mp-join-modal-backstop" onClick={() => setMpAbandonConfirm(false)}>
          <div class="mp-join-dialog" onClick={e => e.stopPropagation()}>
            <RoomDialogBackground />
            <h2 class="mp-dialog-title">{loc('main_menu_ui', 'ABANDON_RUN_CONFIRMATION.header')}</h2>
            <p class="mp-dialog-desc">{loc('main_menu_ui', 'ABANDON_RUN_CONFIRMATION.body')}</p>
            <div class="mp-dialog-buttons">
              <PopupButton
                yes={false}
                text={loc('main_menu_ui', 'GENERIC_POPUP.cancel')}
                onClick={() => setMpAbandonConfirm(false)}
              />
              <PopupButton
                yes={true}
                text={loc('main_menu_ui', 'GENERIC_POPUP.confirm')}
                onClick={() => void handleAbandonMultiplayer()}
              />
            </div>
          </div>
          <BackButton enabled onClick={() => setMpAbandonConfirm(false)} />
        </div>
      )}

      {/* 悬浮铭牌快捷修改昵称弹窗 */}
      {editingMyName && (
        <div class="mp-join-modal-backstop" onClick={() => setEditingMyName(false)}>
          <div class="mp-join-dialog" onClick={e => e.stopPropagation()}>
            <RoomDialogBackground />
            <h2 class="mp-dialog-title">{tr('修改你的玩家昵称', 'Change Player Name')}</h2>
            <div class="mp-dialog-input-wrap">
              <input
                type="text"
                class="mp-dialog-input"
                maxLength={20}
                autoFocus
                value={nameInputVal}
                onInput={e => setNameInputVal(e.currentTarget.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (nameInputVal.trim()) {
                      renameMultiplayer(nameInputVal.trim());
                    }
                    setEditingMyName(false);
                  }
                }}
              />
            </div>
            <div class="mp-dialog-buttons">
              <PopupButton
                yes={false}
                text={tr('取消', 'Cancel')}
                onClick={() => setEditingMyName(false)}
              />
              <PopupButton
                yes={true}
                text={tr('保存', 'Save')}
                onClick={() => {
                  if (nameInputVal.trim()) {
                    renameMultiplayer(nameInputVal.trim());
                  }
                  setEditingMyName(false);
                }}
              />
            </div>
          </div>
          <BackButton enabled onClick={() => setEditingMyName(false)} />
        </div>
      )}

      {mp.error && <div class="mp-toast-error" role="alert">{multiplayerError()}</div>}

      {/* 1. 多人主菜单（SubmenuButtons 原版卡片） */}
      {mp.phase === 'idle' && view === 'menu' && (
        <div class="sp-submenu">
          {!hasMpSave ? (
            <>
              <SubmenuButton
                x={585}
                keyPrefix="HOST"
                icon="submenu_host"
                hsv={[0, 0.8, 0.8]}
                enabled
                onClick={() => setView('host')}
              />
              <SubmenuButton
                x={1005}
                keyPrefix="JOIN"
                icon="submenu_join"
                hsv={[0.24, 1.0, 0.7]}
                enabled
                onClick={() => setView('join')}
              />
            </>
          ) : (
            <>
              <SubmenuButton
                x={395}
                keyPrefix="MP_LOAD"
                icon="submenu_load"
                hsv={[0.48, 0.8, 0.7]}
                enabled
                onClick={() => void handleLoadMultiplayer()}
              />
              <SubmenuButton
                x={795}
                keyPrefix="MP_ABANDON"
                icon="submenu_abandon"
                hsv={[0.93, 1.2, 0.65]}
                enabled
                onClick={() => setMpAbandonConfirm(true)}
              />
              <SubmenuButton
                x={1195}
                keyPrefix="JOIN"
                icon="submenu_join"
                hsv={[0.24, 1.0, 0.7]}
                enabled
                onClick={() => setView('join')}
              />
            </>
          )}
          <BackButton enabled onClick={exit} />
        </div>
      )}

      {/* 2. 房主模式选择子菜单（SubmenuButtons 原版卡片） */}
      {mp.phase === 'idle' && view === 'host' && (
        <div class="sp-submenu">
          <SubmenuButton
            x={395}
            keyPrefix="STANDARD_MP"
            icon="submenu_standard"
            hsv={[0, 0.8, 0.8]}
            enabled
            onClick={() => void startConnect(undefined, 'standard')}
          />
          <SubmenuButton
            x={795}
            keyPrefix="DAILY_MP"
            icon="submenu_daily"
            hsv={[0.48, 0.8, 0.7]}
            enabled={daily}
            onClick={() => void startConnect(undefined, 'daily')}
          />
          <SubmenuButton
            x={1195}
            keyPrefix="CUSTOM_MP"
            icon="submenu_custom"
            hsv={[0.93, 1.2, 0.65]}
            enabled={custom}
            onClick={() => void startConnect(undefined, 'custom')}
          />
          <BackButton enabled onClick={() => setView('menu')} />
        </div>
      )}

      {/* Web room-code entry, using the original JoinFriendSubmenu panel material. */}
      {mp.phase === 'idle' && view === 'join' && (
        <div class="mp-join-modal-backstop">
          <div class="mp-join-dialog">
            <RoomDialogBackground />
            <h2 class="mp-dialog-title">{m('JOIN.title')}</h2>
            <p class="mp-dialog-desc">{m('JOIN.description')}</p>

            {/* 加入房间弹窗：常驻展示当前身份，提供 Steam 快捷登录入口 */}
            <div class="mp-join-identity-bar">
              <span class="mp-jib-label">
                {steam.profile ? tr('联机身份：', 'Identity: ') : tr('当前身份：', 'Playing as: ')}
                <strong style={{ color: '#efc851' }}>{effectivePlayerName()}</strong>
                {!steam.profile && <span style={{ opacity: 0.7 }}> ({tr('游客', 'Guest')})</span>}
              </span>
              {!steam.profile ? (
                <button
                  type="button"
                  class="mp-quick-steam-btn"
                  onClick={() => setShowAccountDialog(true)}
                >
                  <img src={imageUrl('images/ui/mods/steam_logo.png') || ''} alt="" class="mqs-icon" />
                  <span>{tr('登录 Steam', 'Sign In Steam')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  class="mp-quick-steam-btn signed-in"
                  onClick={() => setShowAccountDialog(true)}
                >
                  <img src={steam.profile.avatar || imageUrl('images/ui/mods/steam_logo.png') || ''} alt="" class="mqs-icon" />
                  <span>{tr('管理账号', 'Account')}</span>
                </button>
              )}
            </div>

            <div class="mp-dialog-input-wrap">
              <input
                type="text"
                class="mp-dialog-input"
                autoFocus
                placeholder="____________"
                value={joinCode}
                onPaste={e => {
                  const code = parseRoomInvitation(e.clipboardData?.getData('text') ?? '');
                  if (code) { e.preventDefault(); setJoinCode(code); }
                }}
                onInput={e => {
                  const val = e.currentTarget.value;
                  const parsed = parseRoomInvitation(val);
                  if (parsed) {
                    setJoinCode(parsed);
                  } else {
                    setJoinCode(val.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 12));
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && joinCode.length === 12) {
                    void startConnect(joinCode);
                  }
                }}
              />
              <div class="mp-paste-row">
                <div class="mp-dialog-hint">{tr('输入房间代码或粘贴邀请链接', 'Enter a room code or paste an invitation link')}</div>
                {typeof navigator !== 'undefined' && !!navigator.clipboard && (
                  <button
                    type="button"
                    class="mp-quick-paste-btn"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        const code = parseRoomInvitation(text);
                        if (code) {
                          setJoinCode(code);
                          playOneShot('event:/sfx/ui/clicks/ui_click');
                        }
                      } catch { }
                    }}
                  >
                    {tr('📋 粘贴', '📋 Paste')}
                  </button>
                )}
              </div>
            </div>

            <div class="mp-dialog-buttons">
              <PopupButton
                yes={false}
                text={loc('main_menu_ui', 'GENERIC_POPUP.cancel')}
                onClick={() => setView('menu')}
              />
              <PopupButton
                yes={true}
                text={m('JOIN.title')}
                disabled={joinCode.length !== 12}
                onClick={() => void startConnect(joinCode)}
              />
            </div>
          </div>
          <BackButton enabled onClick={() => setView('menu')} />
        </div>
      )}

      {/* 4. 连接/同步过渡加载状态（遵循原版 LoadingOverlay 质感，无网页旋转圈） */}
      {(mp.phase === 'connecting' || mp.phase === 'starting') && (
        <div class="mp-loading-overlay">
          <div class="mp-loading-label">
            {mp.phase === 'starting'
              ? tr('正在同步对局数据，即将启程…', 'Synchronizing co-op state, starting run…')
              : m('LOADING_OVERLAY.label')}
          </div>
        </div>
      )}

      {/* 5. 原版三大多人房间大厅：完全遵循原版场景设定与界面系统 */}
      {/* 每日挑战模式大厅：复用原版 NDailyRunScreen */}
      {mp.phase === 'lobby' && mp.mode === 'daily' && dailySetup && me && (
        <DailyRun lobby={{
          date: mp.settings.dailyDate, setup: dailySetup, index: mp.players.indexOf(me), playerCount: mp.players.length,
          playerName: multiplayerPlayerName(mp.id), ready: me.ready, players: remotePlayers,
          onReady: () => readyMultiplayer(!me.ready), onBack: exit,
        }} />
      )}

      {/* 自定义模式大厅：复用原版 NCustomRunScreen（种子、进阶、完整词缀列表与原版复选框切片） */}
      {mp.phase === 'lobby' && mp.mode === 'custom' && me && (
        <CustomRun lobby={{
          isHost,
          seed: mp.settings.seed,
          ascension: mp.settings.ascension,
          maxAscension: mp.maxAscension,
          modifiers: mp.settings.modifiers,
          selectedCharacter: currentHeroId,
          ready: me.ready,
          players: remotePlayers,
          onSelectCharacter: (entry) => handleSelectChar({ Id: { Entry: entry }, CharacterSelectSfx: 'event:/sfx/ui/clicks/ui_click' }, false),
          onConfigure: (settings) => configureMultiplayer(settings),
          onReady: () => readyMultiplayer(!me.ready),
          onBack: exit,
        }} />
      )}

      {/* 标准模式大厅：复用原版 NCharacterSelectScreen */}
      {mp.phase === 'lobby' && mp.mode === 'standard' && (
        <div class="charselect mp-lobby-screen">
          {/* 左侧角色属性信息面板 */}
          {selectedCharObj && (
            <InfoPanel c={selectedCharObj.c} locked={selectedCharObj.locked} />
          )}

          {/* 角色选择按钮栏 */}
          <div class="chs-buttons" style={{ left: `${960 - (charList.length * 116 - 16) / 2}px` }}>
            {charList.map(({ c, locked }) => (
              <CharacterSelectButton
                key={c.Id.Entry}
                c={c}
                locked={locked}
                selected={currentHeroId === c.Id.Entry}
                enabled={!me?.ready}
                onSelect={() => handleSelectChar(c, locked)}
              />
            ))}
          </div>

          <AscensionPanel
            multiplayer
            level={mp.settings.ascension}
            max={mp.maxAscension}
            readOnly={mp.id !== 1 || !!me?.ready}
            onChange={ascension => configureMultiplayer({ ascension })}
          />

          {/* 原版 RemotePlayerContainer（左上角玩家状态与邀请码） */}
          {remotePlayers}

          {/* 左下角原版返回按钮 */}
          <BackButton enabled onClick={exit} />

          {/* 右下角原版按钮：未准备时为 ConfirmButton（打勾确认），已准备时为 UnreadyButton（红叉取消准备） */}
          {!me?.ready ? (
            <ConfirmButton
              enabled={!!me && !selectedCharObj?.locked}
              onClick={() => {
                if (me && me.character !== currentHeroId) {
                  selectMultiplayerCharacter(currentHeroId);
                }
                readyMultiplayer(true);
              }}
            />
          ) : (
            <UnreadyButton
              enabled={true}
              onClick={() => readyMultiplayer(false)}
            />
          )}
        </div>
      )}

      {/* 6. 原版多人读档大厅：1:1 对齐 NMultiplayerLoadGameScreen / multiplayer_load_game_screen.tscn */}
      {mp.phase === 'lobby' && mp.mode === 'load' && (
        <div class="mp-load-screen">
          {/* 顶部进阶展示面板 */}
          <div style={{ position: 'absolute', left: '50%', top: '64px', transform: 'translateX(-50%)' }}>
            <AscensionPanel
              multiplayer
              level={mp.loadInfo?.ascension ?? 0}
              max={mp.loadInfo?.ascension ?? 0}
              readOnly={true}
              onChange={() => { }}
            />
          </div>

          {/* 左侧房主角色信息卡片 (InfoPanel) */}
          <div class="mpl-info-panel">
            <div
              class="mpl-panel-bg"
              style={{
                borderImageSource: `url(${imageUrl('images/ui/fuzzy_nine_patch_char_select.png')})`,
                backgroundColor: 'rgba(0, 0, 0, 0.36)',
              }}
            />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div class="mpl-char-name">
                {loc('characters', `${mp.loadInfo?.hostCharacter || 'ironclad'}.title`)}
              </div>
              <div class="mpl-stats-row">
                <div class="mpl-stat-item">
                  <div class="mpl-stat-icon" style={frameStyle(frameByName('ui_atlas', 'top_bar/top_bar_heart'), 40, 40)} />
                  <span class="mpl-stat-val-hp">{mp.loadInfo?.hostHp ?? 80}/{mp.loadInfo?.hostMaxHp ?? 80}</span>
                </div>
                <div class="mpl-stat-item">
                  <div class="mpl-stat-icon" style={frameStyle(frameByName('ui_atlas', 'top_bar/top_bar_gold'), 40, 40)} />
                  <span class="mpl-stat-val-gold">{mp.loadInfo?.hostGold ?? 99}</span>
                </div>
              </div>
              <div class="mpl-location-row">
                <div class="mpl-loc-icon" style={frameStyle(frameByName('ui_atlas', 'top_bar/top_bar_floor'), 40, 40)} />
                <div class="mpl-loc-text">
                  <span>{loc('main_menu_ui', 'MULTIPLAYER_LOAD_MENU.ACT') ? loc('main_menu_ui', 'MULTIPLAYER_LOAD_MENU.ACT').replace('{act}', String(mp.loadInfo?.act ?? 1)) : `Act: ${mp.loadInfo?.act ?? 1}`}</span>
                  <span>{loc('main_menu_ui', 'MULTIPLAYER_LOAD_MENU.FLOOR') ? loc('main_menu_ui', 'MULTIPLAYER_LOAD_MENU.FLOOR').replace('{floor}', String(mp.loadInfo?.floor ?? 1)) : `Floor: ${mp.loadInfo?.floor ?? 1}`}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧队友槽位容器 (RemotePlayerLoadContainer) */}
          <div class="mpl-remote-container">
            <div
              class="mpl-panel-bg"
              style={{
                borderImageSource: `url(${imageUrl('images/ui/fuzzy_nine_patch_char_select.png')})`,
                backgroundColor: 'rgba(0, 0, 0, 0.36)',
              }}
            />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div class="mpl-others-title">
                {loc('main_menu_ui', 'MULTIPLAYER_LOAD_MENU.OTHERS')
                  ? loc('main_menu_ui', 'MULTIPLAYER_LOAD_MENU.OTHERS').replace('{others}', String(Math.max(1, (mp.loadInfo?.totalPlayers ?? 2) - 1)))
                  : tr(`另外 ${(mp.loadInfo?.totalPlayers ?? 2) - 1} 名队友:`, `And ${(mp.loadInfo?.totalPlayers ?? 2) - 1} others:`)}
              </div>
              <div class="mpl-slot-list">
                {(mp.loadInfo?.players || []).filter((p: any) => p.slot !== 1).map((savedPlayer: any) => {
                  const connectedPeer = mp.players.find(p => p.id === savedPlayer.slot);
                  const pChar = String(savedPlayer.character || 'silent').toLowerCase();
                  const tickFrame = frameByName('compressed', 'confirm_button_tick');
                  return (
                    <div key={savedPlayer.slot} class="mpl-slot-item">
                      <div class="mpl-slot-avatar-wrap">
                        <img
                          class="mpl-slot-avatar"
                          src={connectedPeer?.profile?.avatar || imageUrl(`images/ui/top_panel/character_icon_${pChar}.png`) || ''}
                          alt=""
                        />
                        {connectedPeer?.ready && (
                          <div
                            class="rlp-ready-tick"
                            style={{
                              ...frameStyle(tickFrame, 40, 40),
                              filter: 'drop-shadow(0 0 4px #7fff00) brightness(1.2)',
                            }}
                          />
                        )}
                        {connectedPeer && !connectedPeer.connected && (
                          <img class="rlp-disconnect" src={imageUrl('images/ui/disconnected.png') ?? ''} />
                        )}
                      </div>
                      <div class="mpl-slot-info">
                        <div class="mpl-slot-player-name">
                          {connectedPeer ? multiplayerPlayerName(savedPlayer.slot) : tr('等待连入…', 'Waiting to join…')}
                          {savedPlayer.slot === mp.id && tr(' (你)', ' (You)')}
                        </div>
                        <div class="mpl-slot-char-desc">
                          {loc('characters', `${savedPlayer.character}.title`)} · HP {savedPlayer.hp}/{savedPlayer.maxHp} · {savedPlayer.gold} G
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 原版 RemotePlayerContainer（左上角悬浮铭牌与邀请码） */}
          {remotePlayers}

          {/* 左下角原版返回按钮 */}
          <BackButton enabled onClick={exit} />

          {/* 右下角原版启程/取消准备按钮 */}
          {!me?.ready ? (
            <ConfirmButton
              enabled={!!me}
              onClick={() => readyMultiplayer(true)}
            />
          ) : (
            <UnreadyButton
              enabled={true}
              onClick={() => readyMultiplayer(false)}
            />
          )}
        </div>
      )}
      {/* 原版九宫格 Steam 账号管理弹窗（置于最顶层，确保高于所有模式与子弹窗） */}
      {showAccountDialog && (
        <div class="mp-join-modal-backstop mp-account-modal-backstop" onClick={() => setShowAccountDialog(false)}>
          <div class="mp-join-dialog mp-account-dialog" onClick={e => e.stopPropagation()}>
            <RoomDialogBackground />
            <h2 class="mp-dialog-title">{tr('Steam 账号', 'Steam Account')}</h2>

            <div class="mp-account-card">
              <img
                class="mp-account-avatar"
                src={steam.profile?.avatar || imageUrl('images/ui/mods/steam_logo.png') || ''}
                alt=""
                referrerPolicy="no-referrer"
              />
              <div class="mp-account-info">
                <div class="mp-account-name">{steam.profile?.name || tr('游客身份', 'Guest')}</div>
                <div class="mp-account-sub">
                  {steam.profile ? tr('Steam 账号已验证', 'Verified Steam Account') : tr('未登录 · 游客模式', 'Not Signed In · Guest')}
                </div>
              </div>
            </div>

            <p class="mp-dialog-desc">
              {steam.profile
                ? tr('当前已连接 Steam。在多人联机房间与游戏中，其他玩家将看到你的 Steam 昵称与头像。支持跨设备云存档漫游同步。', 'Connected with Steam. Other players will see your verified Steam profile in multiplayer sessions. Cross-device Steam Cloud save synchronization is enabled.')
                : tr('当前以游客身份联机。你可以直接修改下方游客昵称，或使用 Steam 网页登录展示真实 Steam 昵称与头像。单人游戏存档不受任何影响，仍安全保存在本地。', 'Currently playing as a guest. You can customize your guest nickname below, or sign in with Steam to show your verified profile.')}
            </p>

            {steam.profile && (
              <div class="mp-cloud-save-section">
                <div class="mp-cloud-save-header">
                  <span class="mp-cloud-save-title">☁ {tr('Steam 云存档', 'Steam Cloud Save')}</span>
                  <span class="mp-cloud-save-status">
                    {cloudSave.uploading
                      ? tr('正在备份...', 'Uploading...')
                      : cloudSave.restoring
                        ? tr('正在恢复...', 'Restoring...')
                        : cloudSave.meta?.exists
                          ? tr('云端已就绪', 'Ready')
                          : tr('尚未备份', 'Not Backed Up')}
                  </span>
                </div>
                <div class="mp-cloud-save-time">
                  {cloudSave.meta?.updatedAt
                    ? `${tr('上次云端备份：', 'Last Backup: ')}${formatCloudSaveTime(cloudSave.meta.updatedAt)} (${cloudSave.meta.fileCount ?? 0} ${tr('个文件', 'files')})`
                    : tr('当前账号在云端暂无备份，点击右侧立即备份本地进度。', 'No cloud backup yet. Click below to backup your current local saves.')}
                </div>
                <div class="mp-cloud-save-actions">
                  <GameTextureButton
                    text={tr('备份至云端', 'Upload')}
                    disabled={cloudSave.uploading || cloudSave.restoring}
                    onClick={() => void uploadCloudSave(true)}
                  />
                  <GameTextureButton
                    text={tr('从云端恢复', 'Restore')}
                    disabled={cloudSave.uploading || cloudSave.restoring || !cloudSave.meta?.exists}
                    onClick={async () => {
                      const yes = await confirmPopup({
                        header: tr('恢复云存档', 'Restore Cloud Save'),
                        body: appText('cloudSaveRestoreConfirmBody'),
                        yes: loc('main_menu_ui', 'GENERIC_POPUP.confirm'),
                        no: loc('main_menu_ui', 'GENERIC_POPUP.cancel'),
                      });
                      if (yes) {
                        void restoreCloudSaveFromCloud(true);
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {!steam.profile && (
              <>
                <div class="mp-dialog-input-wrap" style={{ margin: '12px 0 14px 0' }}>
                  <div style={{ color: '#fff6e2', fontSize: '18px', marginBottom: '6px', textAlign: 'left', fontWeight: 'bold' }}>
                    {tr('自定义游客昵称：', 'Custom Guest Nickname:')}
                  </div>
                  <input
                    type="text"
                    class="mp-dialog-input"
                    maxLength={20}
                    value={guestNameInput}
                    placeholder={getGuestName()}
                    onInput={e => setGuestNameInput(e.currentTarget.value)}
                  />
                </div>
                <div class="mp-network-tip">
                  <div class="mp-network-tip-header">
                    <span class="mp-network-tip-icon">💡</span>
                    <span class="mp-network-tip-title">{tr('国内网络提示', 'Network Notice')}</span>
                  </div>
                  <div class="mp-network-tip-text">
                    {tr(
                      '由于国内网络限制，直连 Steam 社区可能会出现打不开或连接超时的情况。若需登录，可开启网络加速器（如 Watt Toolkit、UU 等开启免费 Steam 社区加速）或代理。若无需展示 Steam 头像，可直接使用上方游客昵称免登录联机，联机与单人游戏功能 100% 完整，本地存档安全可靠！',
                      'Accessing Steam Community may require a network accelerator (such as Watt Toolkit or VPN) in certain regions. If you prefer not to sign in, simply customize your nickname above to play multiplayer as a guest with full game functionality!'
                    )}
                  </div>
                </div>
              </>
            )}

            {steam.error && (
              <p class="mp-account-error" role="alert">
                {tr('账号服务暂时不可用，请稍后再试。', 'Account service temporarily unavailable, please try again later.')}
              </p>
            )}

            <div class="mp-dialog-buttons">
              {steam.profile ? (
                <>
                  <PopupButton
                    yes={false}
                    text={tr('退出登录', 'Sign Out')}
                    onClick={() => { void logoutSteam(); setShowAccountDialog(false); }}
                  />
                  <PopupButton
                    yes={true}
                    text={tr('完成', 'Done')}
                    onClick={() => setShowAccountDialog(false)}
                  />
                </>
              ) : (
                <>
                  <PopupButton
                    yes={false}
                    text={tr('保存昵称', 'Save Name')}
                    onClick={() => {
                      if (guestNameInput.trim()) {
                        renameMultiplayer(guestNameInput.trim());
                      }
                      setShowAccountDialog(false);
                    }}
                  />
                  <PopupButton
                    yes={true}
                    text={tr('登录 Steam', 'Sign In Steam')}
                    onClick={() => loginSteam(() => setShowAccountDialog(false))}
                  />
                </>
              )}
            </div>
          </div>
          <BackButton enabled onClick={() => setShowAccountDialog(false)} />
        </div>
      )}
    </div>
  );
}

export function MultiplayerStatus() {
  if (mp.phase !== 'playing' && mp.phase !== 'starting' && mp.phase !== 'ended' && mp.phase !== 'reconnecting') return null;

  // 1. 局内等待队友重连或同步（1:1 对齐原版 NCombatRoom %WaitingForOtherPlayers 规范）
  if (mp.waiting && mp.phase === 'playing') {
    const disconnectedPlayers = mp.players.filter((p: any) => !p.connected).map((p: any) => multiplayerPlayerName(p.id));
    const who = disconnectedPlayers.length > 0 ? disconnectedPlayers.join('、') : '';
    const subText = who
      ? tr(`正在等待队友 ${who} 重新连接并同步数据`, `Waiting for teammate ${who} to reconnect and synchronize`)
      : tr('对局已自动暂停，正在等待队友重新连接并同步数据', 'Run paused, waiting for teammates to reconnect and synchronize');

    return (
      <div class="waiting-for-players-overlay">
        <div class="wfpo-banner">
          <RoomDialogBackground />
          <div class="wfpo-title">
            {loc('gameplay_ui', 'MULTIPLAYER_WAITING')}
            <span class="thinky-dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </div>
          <div class="wfpo-sub">
            {subText}
          </div>
          <div class="wfpo-btn-wrap">
            <PopupButton
              yes={false}
              text={tr('返回主菜单', 'Return to Menu')}
              onClick={leaveMultiplayer}
            />
          </div>
        </div>
      </div>
    );
  }

  // 2. 本机断线重连或对局彻底结束
  return (
    <>
      {(mp.phase === 'ended' || mp.phase === 'reconnecting') && (
        <div class="mp-join-modal-backstop">
          <div class="mp-join-dialog">
            <RoomDialogBackground />
            <h2 class="mp-dialog-title">{mp.phase === 'ended' ? tr('联机已中断', 'Co-op Session Ended') : tr('正在重新连接', 'Reconnecting to Room')}</h2>
            <p class="mp-dialog-desc">{mp.phase === 'ended' ? multiplayerError() : tr('正在尝试重新连接房间服务器。请保留此页面，战斗与操作已安全暂存。', 'Reconnecting to room server. Keep this page open; combat and pending choices are safely preserved.')}</p>
            <p class="coop-note">
              {tr('现有单人存档未受任何影响，仍安全保存在本地。', 'Your singleplayer profile and saves remain completely intact.')}
            </p>
            <div class="mp-dialog-buttons" style={{ justifyContent: 'center' }}>
              {mp.phase === 'reconnecting' && <PopupButton yes text={tr('立即重试', 'Retry Now')} onClick={retryMultiplayer} />}
              <PopupButton
                yes={true}
                text={tr('返回主菜单', 'Return to Menu')}
                onClick={leaveMultiplayer}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
