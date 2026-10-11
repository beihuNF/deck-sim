// Multiplayer menus and lobby using original game assets and layouts.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useMemo } from 'preact/hooks';
import { G, $, list } from '../game';
import {
  multiplayer as mp, mpText as tr, connectMultiplayer, selectMultiplayerCharacter,
  readyMultiplayer, configureMultiplayer, leaveMultiplayer, kickMultiplayerPlayer, multiplayerError, invitedRoomCode, parseRoomInvitation, multiplayerPlayerName, retryMultiplayer,
} from '../multiplayer';
import { BackButton, ConfirmButton } from './buttons';
import { SubmenuButton, characters, epochRevealed } from './menu';
import { CharacterSelectButton, InfoPanel, AscensionPanel } from './charselect';
import { allModifiers, DailyRun } from './modes';
import { ScrollArea } from './scrollable';
import { PopupButton } from './modal';
import { RichText } from './richtext';
import { loc } from '../i18n';
import { imageUrl, frameByName, frameStyle } from '../assets';
import { playOneShot } from '../audio';
import { tint } from '../filters';
import { charSelectBg } from '../render/scene';
import './multiplayer.css';
import { steam, loadSteamProfile, loginSteam, logoutSteam } from '../steam';

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
  const [view, setView] = useState<'menu' | 'host' | 'join'>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [, setKickGen] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [seed, setSeed] = useState('');
  const modifiers = useMemo(allModifiers, []);
  useEffect(() => { setSeed(mp.settings.seed); }, [mp.settings.seed]);

  const charList = characters();
  const me = mp.players.find(p => p.id === mp.id);
  const currentHeroId = preview ?? (me?.character ?? 'ironclad').toUpperCase();
  const selectedCharObj = charList.find(c => c.c.Id.Entry === currentHeroId) ?? charList[0];
  const dailySetup = mp.phase === 'lobby' && mp.mode === 'daily' && mp.settings.dailyDate ? G.webDailySetup(mp.settings.dailyDate, mp.players) : null;
  useEffect(() => { if (mp.phase !== 'lobby') setPreview(null); }, [mp.phase]);

  // 从 URL 参数自动加入房间
  useEffect(() => {
    const code = invitedRoomCode();
    if (code && mp.phase === 'idle') {
      void connectMultiplayer(code);
    }
  }, []);

  // 房间大厅角色背景同步
  useEffect(() => {
    if (mp.phase === 'lobby' && mp.mode !== 'daily' && selectedCharObj) {
      void charSelectBg(selectedCharObj.locked ? null : String(selectedCharObj.c.Id.Entry).toLowerCase());
    } else {
      void charSelectBg(null);
    }
    return () => { void charSelectBg(null); };
  }, [mp.phase, mp.mode, selectedCharObj?.c?.Id?.Entry]);

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
    if (me?.ready) return; // 已就绪状态禁止切人
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
  const hasMpSave = false; // 当前暂无断线续玩联机存档

  // 房主与全员就绪判定：至少 2 人，所有玩家（包括房主自身）全部就绪且在线
  const isHost = mp.id === 1;
  const allReady = mp.players.length >= 2 && mp.players.every(p => p.ready && p.connected);

  const remotePlayers = (
    <div class="remote-player-container">
      {/* 邀请代码与复制按钮 */}
      <div
        class="invite-code-btn"
        onClick={() => copyText(`${location.origin}?room=${mp.code}`, 'link')}
        onPointerEnter={() => playOneShot('event:/sfx/ui/clicks/ui_hover')}
        title={tr('点击复制邀请链接与房间号', 'Click to copy invite link and room code')}
      >
        <img class="icb-bg" src={imageUrl('images/ui/reward_screen/reward_item_button.png') ?? ''} />
        <span class="icb-label">
          {copied === 'link' ? tr('已复制邀请链接！', 'Link Copied!') : `${m('INVITE')} · ${mp.code}`}
        </span>
      </div>

      {/* 房间玩家卡片列表（最多 4 人） */}
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
                  {isSlotMe && tr('(你)', '(You)')}
                </div>
                <div class="rlp-char-title">
                  {loc('characters', `${player.character}.title`)}
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

      {/* 单人等待其他玩家提示 */}
      {mp.players.length === 1 && (
        <div class="remote-solo-label">
          {loc('main_menu_ui', 'MULTIPLAYER_CHAR_SELECT.SOLO')}
        </div>
      )}
    </div>
  );

  return (
    <div class="mp-screen-container">
      {mp.phase === 'idle' && <div class="mp-steam-account">
        {steam.profile?.avatar && <img src={steam.profile.avatar} alt="" referrerPolicy="no-referrer" />}
        <span>{steam.profile?.name || tr('游客', 'Guest')}</span>
        {steam.profile ? <button data-ctl onClick={() => void logoutSteam()}>{tr('退出 Steam', 'Sign out of Steam')}</button>
          : <button data-ctl disabled={steam.loading} onClick={loginSteam}>{tr('使用 Steam 登录', 'Sign in through Steam')}</button>}
        {steam.error && <span role="alert">{tr('账号服务暂不可用', 'Account service unavailable')}</span>}
      </div>}
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
                onClick={() => {}}
              />
              <SubmenuButton
                x={795}
                keyPrefix="MP_ABANDON"
                icon="submenu_abandon"
                hsv={[0.93, 1.2, 0.65]}
                enabled
                onClick={() => {}}
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
            onClick={() => void connectMultiplayer(undefined, 'standard')}
          />
          <SubmenuButton
            x={795}
            keyPrefix="DAILY_MP"
            icon="submenu_daily"
            hsv={[0.48, 0.8, 0.7]}
            enabled={daily}
            onClick={() => void connectMultiplayer(undefined, 'daily')}
          />
          <SubmenuButton
            x={1195}
            keyPrefix="CUSTOM_MP"
            icon="submenu_custom"
            hsv={[0.93, 1.2, 0.65]}
            enabled={custom}
            onClick={() => void connectMultiplayer(undefined, 'custom')}
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

            <div class="mp-dialog-input-wrap">
              <input
                type="text"
                class="mp-dialog-input"
                maxLength={12}
                autoFocus
                placeholder="____________"
                value={joinCode}
                onPaste={e => {
                  const code = parseRoomInvitation(e.clipboardData?.getData('text') ?? '');
                  if (code) { e.preventDefault(); setJoinCode(code); }
                }}
                onInput={e => setJoinCode(e.currentTarget.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && joinCode.length === 12) {
                    void connectMultiplayer(joinCode);
                  }
                }}
              />
              <div class="mp-dialog-hint">{tr('输入房间代码或粘贴邀请链接', 'Enter a room code or paste an invitation link')}</div>
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
                onClick={() => void connectMultiplayer(joinCode)}
              />
            </div>
          </div>
          <BackButton enabled onClick={() => setView('menu')} />
        </div>
      )}

      {/* 4. 连接/同步过渡加载状态（原版 LoadingOverlay 质感） */}
      {(mp.phase === 'connecting' || mp.phase === 'starting') && (
        <div class="mp-loading-overlay">
          <div class="mp-loading-spinner" />
          <div class="mp-loading-label">
            {mp.phase === 'starting'
              ? tr('正在同步对局数据，即将启程…', 'Synchronizing co-op state, starting run…')
              : m('LOADING_OVERLAY.label')}
          </div>
        </div>
      )}

      {/* 5. 原版多人房间大厅（挂接在 CharacterSelectScreen 体验上） */}
      {mp.phase === 'lobby' && mp.mode === 'daily' && dailySetup && me && <DailyRun lobby={{
        date: mp.settings.dailyDate, setup: dailySetup, index: mp.players.indexOf(me), playerCount: mp.players.length,
        playerName: multiplayerPlayerName(mp.id), ready: me.ready, players: remotePlayers,
        onReady: () => readyMultiplayer(!me.ready), onBack: exit,
      }} />}
      {mp.phase === 'lobby' && mp.mode !== 'daily' && (
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

          <AscensionPanel multiplayer level={mp.settings.ascension} max={mp.maxAscension} readOnly={mp.id !== 1 || !!me?.ready} onChange={ascension => configureMultiplayer({ ascension })} />
          <div class="mp-run-settings">
            {custom && <label>{tr('种子', 'Seed')} <input class="mp-seed-input" maxLength={40} value={seed} disabled={mp.id !== 1 || !!me?.ready} onInput={e => setSeed(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))} onBlur={() => { if (seed !== mp.settings.seed) configureMultiplayer({ seed }); }} /></label>}
            {mp.mode === 'custom' && <button class="mp-settings-button" onClick={() => setShowSettings(true)}>{tr('词缀', 'Modifiers')} ({mp.settings.modifiers.length})</button>}
          </div>

          {/* 原版 RemotePlayerContainer（左上角玩家状态与邀请码） */}
          {remotePlayers}

          {/* 大厅就绪与启程提示 */}
          <div class={`mp-lobby-ready-tip ${allReady ? 'all-ready' : me?.ready ? 'is-ready' : ''}`}>
            {mp.players.length === 1
              ? loc('main_menu_ui', 'MULTIPLAYER_CHAR_SELECT.SOLO')
              : allReady
                ? isHost
                  ? tr('全员已就绪 · 即将启程！', 'All players ready · Embarking!')
                  : tr('全员已就绪 · 即将启程！', 'All players ready · Embarking!')
                : me?.ready
                  ? tr('已就绪 · 等待其他玩家就绪...', 'Ready · Waiting for other players...')
                  : tr('点击右下角按钮准备就绪', 'Click bottom right button to ready up')}
          </div>

          {/* 左下角原版返回按钮 */}
          <BackButton enabled onClick={exit} />

          {/* 右下角原版确认/启程按钮 */}
          <ConfirmButton
            enabled={!!me && !selectedCharObj?.locked && me.character === currentHeroId && !showSettings}
            onClick={() => readyMultiplayer(!me?.ready)}
          />
          {showSettings && <div class="mp-join-modal-backstop"><div class="mp-settings-dialog">
            <div class="mp-settings-bg" style={{ borderImageSource: `url(${imageUrl('images/ui/tiny_nine_patch.png')})` }} />
            <h2>{tr('词缀', 'Modifiers')}</h2>
            <ScrollArea rect={[25, 90, 850, 540]} bar={[860, 90, 25, 540]}>
              {modifiers.map(row => <label class="mp-mod-row" data-ctl>
                <input type="checkbox" checked={mp.settings.modifiers.includes(row.key)} disabled={mp.id !== 1 || !!me?.ready} onChange={() => {
                  let keys = mp.settings.modifiers.filter(key => key !== row.key);
                  if (!mp.settings.modifiers.includes(row.key)) {
                    const group = list(G.ModelDb.MutuallyExclusiveModifiers).find(s => s.Contains(row.canonical));
                    keys = keys.filter(key => { const other = modifiers.find(m => m.key === key); return other?.canonical !== row.canonical && (!group || !group.Contains(other?.canonical)); });
                    keys.push(row.key);
                  }
                  configureMultiplayer({ modifiers: keys });
                }} /><RichText text={row.text} />
              </label>)}
            </ScrollArea>
            <button class="mp-settings-button mp-settings-close" onClick={() => setShowSettings(false)}>{tr('完成', 'Done')}</button>
          </div></div>}
        </div>
      )}
    </div>
  );
}

export function MultiplayerStatus() {
  if (mp.phase !== 'playing' && mp.phase !== 'starting' && mp.phase !== 'ended' && mp.phase !== 'reconnecting') return null;
  return (
    <>
      {(mp.phase === 'ended' || mp.phase === 'reconnecting' || mp.waiting) && (
        <div class="mp-join-modal-backstop">
          <div class="mp-join-dialog">
            <RoomDialogBackground />
            <h2 class="mp-dialog-title">{mp.phase === 'ended' ? tr('联机已中断', 'Co-op Session Ended') : tr('等待重新连接', 'Waiting for Reconnection')}</h2>
            <p class="mp-dialog-desc">{mp.phase === 'ended' ? multiplayerError() : mp.phase === 'reconnecting'
              ? tr('正在重新连接房间。请保留此页面，战斗和待选操作已保留。', 'Reconnecting to the room. Keep this page open; combat and pending choices are preserved.')
              : tr('队友已掉线，正在等待其重连。请保留此页面。', 'A teammate disconnected. Waiting for them to reconnect; keep this page open.')}</p>
            <p class="coop-note">
              {tr('现有单人存档未受任何影响，仍安全保存在本地。', 'Your singleplayer profile and saves remain completely intact.')}
            </p>
            <div class="mp-dialog-buttons" style={{ justifyContent: 'center' }}>
              {mp.phase === 'reconnecting' && <PopupButton yes text={tr('重试连接', 'Retry Connection')} onClick={retryMultiplayer} />}
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
