import { useState, useEffect } from 'preact/hooks';
import { G, list } from '../game';
import { multiplayer as mp, mpText as tr, connectMultiplayer, selectMultiplayerCharacter, readyMultiplayer,
  beginMultiplayer, leaveMultiplayer, multiplayerError } from '../multiplayer';
import { BackButton } from './buttons';
import { loc } from '../i18n';
import { imageUrl } from '../assets';
import { playOneShot } from '../audio';
import './multiplayer.css';

const m = (k: string) => loc('main_menu_ui', k);

export function MultiplayerLobby({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<'menu' | 'host' | 'join'>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const characters = list(G.SaveManager.Instance.GenerateUnlockStateFromProgress().Characters);
  const me = mp.players.find(p => p.id === mp.id);

  // 从 URL 参数直接加入房间（例如 ?room=CODE）
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('room');
    if (p && p.length === 12 && mp.phase === 'idle') {
      void connectMultiplayer(p.toUpperCase());
    }
  }, []);

  const copyText = (text: string, tag: string) => {
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

  const modeTitle = (mode: string) => {
    if (mode === 'daily') return m('DAILY_MP.title');
    if (mode === 'custom') return m('CUSTOM_MP.title');
    return m('STANDARD_MP.title');
  };

  return (
    <div class="mp-root">
      {mp.error && <div class="mp-toast-error" role="alert">{multiplayerError()}</div>}

      {/* 1. 多人主菜单（创建 / 加入） */}
      {mp.phase === 'idle' && view === 'menu' && (
        <div class="mp-submenu">
          <div class="mp-menu-header">
            <h1 class="mp-title">{m('MULTIPLAYER')}</h1>
            <p class="mp-subtitle">{tr('至多 4 人联机 · 独立会话不破坏单人存档', 'Up to 4 players · Ephemeral session, singleplayer saves kept intact')}</p>
          </div>
          <div class="mp-cards">
            <div class="mp-card" onClick={() => { playOneShot('event:/sfx/ui/clicks/ui_click'); setView('host'); }}>
              <div class="mp-card-border" />
              <div class="mp-card-content">
                <img class="mp-card-icon" src={imageUrl('images/ui/main_menu/submenu_standard.png') ?? ''} />
                <h2 class="mp-card-title">{m('HOST.title')}</h2>
                <p class="mp-card-desc">{m('HOST.description')}</p>
              </div>
            </div>
            <div class="mp-card" onClick={() => { playOneShot('event:/sfx/ui/clicks/ui_click'); setView('join'); }}>
              <div class="mp-card-border" />
              <div class="mp-card-content">
                <img class="mp-card-icon" src={imageUrl('images/ui/main_menu/submenu_daily.png') ?? ''} />
                <h2 class="mp-card-title">{m('JOIN.title')}</h2>
                <p class="mp-card-desc">{m('JOIN.description')}</p>
              </div>
            </div>
          </div>
          <BackButton onClick={exit} enabled />
        </div>
      )}

      {/* 2. 房主模式选择（标准模式 / 多人每日挑战 / 自定模式） */}
      {mp.phase === 'idle' && view === 'host' && (
        <div class="mp-submenu">
          <div class="mp-menu-header">
            <h1 class="mp-title">{m('HOST.title')}</h1>
            <p class="mp-subtitle">{m('HOST.description')}</p>
          </div>
          <div class="mp-cards">
            <div class="mp-card" onClick={() => void connectMultiplayer(undefined, 'standard')}>
              <div class="mp-card-border" />
              <div class="mp-card-content">
                <img class="mp-card-icon" src={imageUrl('images/ui/main_menu/submenu_standard.png') ?? ''} />
                <h2 class="mp-card-title">{m('STANDARD_MP.title')}</h2>
                <p class="mp-card-desc">{m('STANDARD_MP.description')}</p>
              </div>
            </div>
            <div class="mp-card" onClick={() => void connectMultiplayer(undefined, 'daily')}>
              <div class="mp-card-border" />
              <div class="mp-card-content">
                <img class="mp-card-icon" src={imageUrl('images/ui/main_menu/submenu_daily.png') ?? ''} />
                <h2 class="mp-card-title">{m('DAILY_MP.title')}</h2>
                <p class="mp-card-desc">{m('DAILY_MP.description')}</p>
              </div>
            </div>
            <div class="mp-card" onClick={() => void connectMultiplayer(undefined, 'custom')}>
              <div class="mp-card-border" />
              <div class="mp-card-content">
                <img class="mp-card-icon" src={imageUrl('images/ui/main_menu/submenu_custom.png') ?? ''} />
                <h2 class="mp-card-title">{m('CUSTOM_MP.title')}</h2>
                <p class="mp-card-desc">{m('CUSTOM_MP.description')}</p>
              </div>
            </div>
          </div>
          <BackButton onClick={exit} enabled />
        </div>
      )}

      {/* 3. 加入房间弹窗/界面 */}
      {mp.phase === 'idle' && view === 'join' && (
        <div class="mp-join-panel">
          <h2>{m('JOIN.title')}</h2>
          <p>{m('JOIN.description')}</p>
          <div class="mp-input-row">
            <input
              type="text"
              class="mp-code-input"
              maxLength={12}
              placeholder="12 位大写房间代码"
              value={joinCode}
              onInput={e => setJoinCode(e.currentTarget.value.toUpperCase().replace(/[^A-F0-9]/g, ''))}
            />
            <button
              class="mp-btn mp-btn-primary"
              disabled={joinCode.length !== 12}
              onClick={() => void connectMultiplayer(joinCode)}
            >
              {m('JOIN.title')}
            </button>
          </div>
          <BackButton onClick={exit} enabled />
        </div>
      )}

      {/* 4. 连接中 */}
      {mp.phase === 'connecting' && (
        <div class="mp-loading-box">
          <div class="mp-spinner" />
          <p>{m('LOADING_OVERLAY.label')}</p>
        </div>
      )}

      {/* 5. 房间大厅（至多 4 人，展示角色、准备状态与房间号） */}
      {mp.phase === 'lobby' && (
        <div class="mp-lobby">
          <div class="mp-lobby-top">
            <div class="mp-lobby-badge">{modeTitle(mp.mode)}</div>
            <div class="mp-room-info">
              <span class="mp-code-label">{tr('房间号：', 'Room Code: ')}</span>
              <strong class="mp-code-val">{mp.code}</strong>
              <button class="mp-btn-chip" onClick={() => copyText(mp.code, 'code')}>
                {copied === 'code' ? tr('已复制！', 'Copied!') : tr('复制房间号', 'Copy Code')}
              </button>
              <button class="mp-btn-chip" onClick={() => copyText(`${location.origin}?room=${mp.code}`, 'link')}>
                {copied === 'link' ? tr('已复制！', 'Copied!') : tr('复制邀请链接', 'Copy Link')}
              </button>
            </div>
          </div>

          {/* 4 个玩家槽位 */}
          <div class="mp-slots-container">
            {[1, 2, 3, 4].map(slotId => {
              const p = mp.players.find(x => x.id === slotId);
              const isMe = slotId === mp.id;
              const isHost = slotId === 1;
              const charId = (p?.character ?? 'ironclad').toLowerCase();
              return (
                <div key={slotId} class={`mp-slot ${p ? 'occupied' : 'empty'} ${isMe ? 'is-me' : ''}`}>
                  <div class="mp-slot-header">
                    <span class="mp-slot-role">
                      {isHost ? tr('房主', 'Host') : `${tr('玩家', 'Player')} ${slotId}`}
                      {isMe && <span class="mp-me-badge">{tr('（你）', ' (You)')}</span>}
                    </span>
                    {p && (
                      <span class={`mp-ready-badge ${p.ready ? 'ready' : 'not-ready'}`}>
                        {p.ready ? tr('已就绪', 'Ready') : tr('未就绪', 'Not Ready')}
                      </span>
                    )}
                  </div>
                  {p ? (
                    <div class="mp-slot-body">
                      <img
                        class="mp-slot-avatar"
                        src={imageUrl(`images/ui/top_panel/character_icon_${charId}.webp`) ?? ''}
                        alt={p.character}
                      />
                      <div class="mp-slot-name">{loc('characters', `${p.character}.title`)}</div>
                    </div>
                  ) : (
                    <div class="mp-slot-empty-text">
                      <div class="mp-empty-dot" />
                      <span>{m('CHARACTER_SELECT.waitingForPlayers')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {mp.players.length === 1 && (
            <div class="mp-solo-notice">{m('MULTIPLAYER_CHAR_SELECT.SOLO')}</div>
          )}

          {/* 底部控制台：选人、就绪、开始 */}
          <div class="mp-lobby-controls">
            <div class="mp-char-picker">
              <span class="mp-control-label">{tr('更换角色：', 'Select Character: ')}</span>
              <div class="mp-char-buttons">
                {characters.map(c => {
                  const entry = c.Id.Entry;
                  const active = me?.character === entry;
                  return (
                    <button
                      key={entry}
                      class={`mp-char-btn ${active ? 'active' : ''}`}
                      onClick={() => selectMultiplayerCharacter(entry)}
                    >
                      <img
                        src={imageUrl(`images/ui/top_panel/character_icon_${entry.toLowerCase()}.webp`) ?? ''}
                        alt={entry}
                      />
                      <span>{loc('characters', `${entry}.title`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div class="mp-actions-bar">
              <button
                class={`mp-btn ${me?.ready ? 'mp-btn-cancel' : 'mp-btn-ready'}`}
                onClick={() => readyMultiplayer(!me?.ready)}
              >
                {me?.ready ? tr('取消准备', 'Cancel Ready') : tr('准备就绪', 'Ready')}
              </button>

              {mp.id === 1 && (
                <button
                  class="mp-btn mp-btn-start"
                  disabled={mp.players.length < 2 || !mp.players.every(p => p.ready && p.connected)}
                  onClick={beginMultiplayer}
                >
                  {tr('开始游戏', 'Start Run')}
                </button>
              )}
            </div>
          </div>

          <BackButton onClick={exit} enabled />
        </div>
      )}

      {/* 6. 开始对局过渡中 */}
      {mp.phase === 'starting' && (
        <div class="mp-loading-box">
          <div class="mp-spinner" />
          <p>{tr('正在同步对局数据，即将启程…', 'Synchronizing co-op state, starting run…')}</p>
        </div>
      )}
    </div>
  );
}

export function MultiplayerStatus() {
  if (mp.phase !== 'playing' && mp.phase !== 'starting' && mp.phase !== 'ended') return null;
  const rs = G.RunManager.Instance.State;
  const me = rs?.GetPlayer(mp.id);

  return (
    <>
      <div class="coop-status">
        <span class="coop-status-badge">{m('MULTIPLAYER')}</span>
        <span>{mp.code}</span>
        <span>·</span>
        <span>{tr('角色：', 'Role: ')}{me?.Character?.Title?.GetFormattedText()}</span>
      </div>
      {mp.phase === 'ended' && (
        <div class="coop-ended">
          <section class="coop-panel">
            <h1>{tr('联机已中断', 'Co-op Session Ended')}</h1>
            <p>{multiplayerError()}</p>
            <p class="coop-note">{tr('现有单人存档未受任何影响，仍安全保存在本地。', 'Your singleplayer profile and saves remain completely intact.')}</p>
            <button class="mp-btn mp-btn-primary" onClick={leaveMultiplayer}>{tr('返回主菜单', 'Return to Menu')}</button>
          </section>
        </div>
      )}
    </>
  );
}
