// NRemoteMouseCursorContainer + NRemoteMouseCursor (ui/multiplayer/remote_mouse_cursor.tscn)
// Displays teammates' synchronized mouse pointers, drawing quills, eraser tools and name tags in co-op.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'preact/hooks';
import { G, $, list, localPlayer } from '../game';
import { ui } from '../store';
import { peerInputRoot } from '../input/peer-input';
import { imageUrl } from '../assets';

interface CursorState {
  prevX: number;
  prevY: number;
  nextX: number;
  nextY: number;
  currentX: number;
  currentY: number;
  lastUpdate: number;
  isDown: boolean;
  drawingMode: number; // 0: None, 1: Drawing, 2: Erasing
  visible: boolean;
}

const CHAR_COLORS: Record<string, string> = {
  ironclad: '#c43a31',
  silent: '#48b855',
  defect: '#3d86cc',
  necrobinder: '#9b42b8',
  regent: '#e5b22b',
};

export function RemoteMouseCursors() {
  const rm = G.RunManager?.Instance;
  const sync = rm?.InputSynchronizer;
  const net = rm?.NetService;
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!sync || !net?.IsConnected) return;
    setActive(true);
    return () => setActive(false);
  }, [sync, net?.IsConnected]);

  if (!active || !sync || !net?.IsConnected || !rm?.State) return null;

  const localId = net.NetId;
  const players = list(rm.State.Players).filter((p: any) => p.NetId !== localId);
  if (!players.length) return null;

  return (
    <div class="remote-cursors-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9990 }}>
      {players.map((p: any) => (
        <TeammateCursor key={p.NetId} player={p} sync={sync} localId={localId} />
      ))}
    </div>
  );
}

function TeammateCursor({ player, sync, localId }: { player: any; sync: any; localId: any }) {
  const stateRef = useRef<CursorState>({
    prevX: 960,
    prevY: 540,
    nextX: 960,
    nextY: 540,
    currentX: 960,
    currentY: 540,
    lastUpdate: performance.now(),
    isDown: false,
    drawingMode: 0,
    visible: true,
  });

  const [renderState, setRenderState] = useState<CursorState>(stateRef.current);

  useEffect(() => {
    const onStateChanged = (senderId: any) => {
      if (senderId !== player.NetId) return;
      try {
        const focus = sync.GetControlSpaceFocusPosition(player.NetId, peerInputRoot);
        const isDown = !!sync.GetMouseDown(player.NetId);
        const localScreen = sync.GetScreenType(localId);
        const remoteScreen = sync.GetScreenType(player.NetId);
        let drawingMode = 0;
        try {
          drawingMode = ($.ext('MegaCrit.Sts2.Core.Nodes.NRun') as any).Instance?.GlobalUi?.MapScreen?.Drawings?.GetDrawingMode?.(player.NetId) ?? 0;
        } catch {}

        const now = performance.now();
        const s = stateRef.current;
        s.prevX = s.currentX;
        s.prevY = s.currentY;
        s.nextX = focus ? focus.X : s.nextX;
        s.nextY = focus ? focus.Y : s.nextY;
        s.lastUpdate = now;
        s.isDown = isDown;
        s.drawingMode = drawingMode;
        // 原版规则：双方在同一界面，且不是卡牌检视等独占遮罩时显示
        s.visible = localScreen === remoteScreen && !ui.cardsView;
      } catch {}
    };

    sync.StateChanged = $.dcombine(sync.StateChanged, onStateChanged);

    // 启动 60fps 平滑插值动画
    const stopFrame = $.onFrame(() => {
      const s = stateRef.current;
      const now = performance.now();
      const elapsed = (now - s.lastUpdate) / 50; // 50ms 采样周期
      const t = Math.min(1, Math.max(0, elapsed));
      s.currentX = s.prevX + (s.nextX - s.prevX) * t;
      s.currentY = s.prevY + (s.nextY - s.prevY) * t;
      setRenderState({ ...s });
      return true;
    });

    return () => {
      sync.StateChanged = $.dremove(sync.StateChanged, onStateChanged);
      stopFrame();
    };
  }, [player.NetId, sync, localId]);

  if (!renderState.visible) return null;

  // 根据当前动作选择原版光标材质
  let texturePath = 'images/packed/common_ui/cursor_default.webp';
  let hotX = 0, hotY = 0;
  if (renderState.drawingMode === 1) { // Drawing (quill)
    texturePath = renderState.isDown ? 'images/packed/common_ui/cursor_default.webp' : 'images/packed/common_ui/cursor_quill_tilted.webp';
    hotX = 2; hotY = 28;
  } else if (renderState.drawingMode === 2) { // Erasing
    texturePath = renderState.isDown ? 'images/packed/common_ui/cursor_eraser.webp' : 'images/packed/common_ui/cursor_eraser_tilted.webp';
    hotX = 12; hotY = 29;
  } else if (renderState.isDown) {
    texturePath = 'images/packed/common_ui/cursor_tilted.webp';
  }

  const cursorUrl = imageUrl(texturePath) ?? '';
  const heroId = String(player.Character?.Id?.Entry ?? '').toLowerCase();
  const themeColor = CHAR_COLORS[heroId] || '#EFC851';
  const name = String(player.Name || player.Character?.Title?.GetFormattedText?.() || heroId || 'P');

  return (
    <div
      class="remote-player-cursor"
      style={{
        position: 'absolute',
        left: `${renderState.currentX - hotX}px`,
        top: `${renderState.currentY - hotY}px`,
        width: '32px',
        height: '32px',
        pointerEvents: 'none',
        willChange: 'left, top',
      }}
    >
      <div
        class="rpc-icon"
        style={{
          width: '32px',
          height: '32px',
          backgroundImage: `url(${cursorUrl})`,
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
        }}
      />
      <div
        class="rpc-tag"
        style={{
          position: 'absolute',
          left: '26px',
          top: '20px',
          backgroundColor: 'rgba(15, 17, 21, 0.88)',
          border: `1.5px solid ${themeColor}`,
          borderRadius: '4px',
          padding: '2px 6px',
          color: '#ffffff',
          font: "700 13px/1.2 'Kreon', var(--font)",
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px #000',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          opacity: renderState.isDown ? 0.95 : 0.75,
          transform: renderState.isDown ? 'scale(0.96)' : 'none',
          transition: 'transform 0.08s ease, opacity 0.08s ease',
        }}
      >
        {name}
      </div>
    </div>
  );
}
