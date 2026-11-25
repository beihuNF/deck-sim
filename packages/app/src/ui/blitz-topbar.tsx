// NBlitzTopBarMap / NBlitzTopBarMapPoint：Blitz 闪电模式顶部栏线性地图进度条
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { $, G, list, localPlayer } from '../game';
import { frameByName, frameStyle, imageUrl } from '../assets';
import { edge } from '../view';
import { loc, locv } from '../i18n';
import { logicalRect, setTip } from './tooltip';
import { floorTipData, type FloorTipData } from './history';
import './blitz-topbar.css';

const safe = <T,>(f: () => T, d: T): T => {
  try {
    return f();
  } catch {
    return d;
  }
};

// 节点类型与图标资源名映射（与 NNormalMapPoint.IconName 保持一致）
const ICON_NAMES: Record<string, string> = {
  Unassigned: 'map_unknown',
  Monster: 'map_monster',
  Elite: 'map_elite',
  Ancient: 'map_unknown',
  Treasure: 'map_chest',
  Shop: 'map_shop',
  RestSite: 'map_rest',
  Unknown: 'map_unknown',
};

const UNKNOWN_ICONS: Record<string, [string, string]> = {
  Treasure: ['map_unknown_chest', 'map_chest_outline'],
  Monster: ['map_unknown_monster', 'map_monster_outline'],
  Shop: ['map_unknown_shop', 'map_shop_outline'],
  Elite: ['map_unknown_elite', 'map_elite_outline'],
};

const LEGEND_KEYS: Record<number, string> = {
  [G.MapPointType?.Unknown ?? 1]: 'LEGEND_UNKNOWN',
  [G.MapPointType?.Shop ?? 2]: 'LEGEND_MERCHANT',
  [G.MapPointType?.Treasure ?? 3]: 'LEGEND_TREASURE',
  [G.MapPointType?.RestSite ?? 4]: 'LEGEND_REST',
  [G.MapPointType?.Monster ?? 5]: 'LEGEND_ENEMY',
  [G.MapPointType?.Elite ?? 6]: 'LEGEND_ELITE',
  [G.MapPointType?.Ancient ?? 7]: 'LEGEND_ANCIENT',
  [G.MapPointType?.Boss ?? 8]: 'LEGEND_BOSS',
};

function coordEq(a: any, b: any): boolean {
  return !!a && !!b && a.row === b.row && a.col === b.col;
}

/** 计算单个节点在 ui_atlas / packed / compressed_atlas 中的图标和描边样式 */
function resolvePointVisual(pt: any, rs: any) {
  const M = G.MapPointType;
  const ptType = pt?.PointType;
  if (ptType === M.Ancient || ptType === M.Boss) {
    const id = ptType === M.Ancient ? safe(() => rs.Act.Ancient.Id, null) : safe(() => rs.Act.BossEncounter.Id, null);
    const roomType = ptType === M.Ancient ? G.RoomType.Event : G.RoomType.Boss;
    const iconPath = id ? safe(() => G.ImageHelper.GetRoomIconPath(ptType, roomType, id), null) : null;
    const outlinePath = id ? safe(() => G.ImageHelper.GetRoomIconOutlinePath(ptType, roomType, id), null) : null;
    return {
      isSpecial: true,
      iconUrl: iconPath ? imageUrl(iconPath) : null,
      outlineUrl: outlinePath ? imageUrl(outlinePath) : null,
      iconFrame: null as any,
      outlineFrame: null as any,
    };
  }

  const typeStr = $.enumStr(M, ptType) || 'Unknown';
  let iconName = ICON_NAMES[typeStr] ?? 'map_unknown';
  let outlineName = `${iconName}_outline`;

  if (ptType === M.Unknown) {
    const actHist = safe(() => list(list(rs.MapPointHistory)[rs.CurrentActIndex]), [] as any[]);
    const row = pt?.coord?.row ?? -1;
    if (row >= 0 && row < actHist.length) {
      const rooms = safe(() => list(actHist[row].Rooms), [] as any[]);
      const roomType = rooms[0]?.RoomType;
      const roomStr = roomType !== undefined ? $.enumStr(G.RoomType, roomType) : '';
      const mapped = UNKNOWN_ICONS[roomStr];
      if (mapped) {
        [iconName, outlineName] = mapped;
      }
    }
  }

  return {
    isSpecial: false,
    iconUrl: null as string | null,
    outlineUrl: null as string | null,
    iconFrame: frameByName('ui_atlas', `map/icons/${iconName}`),
    outlineFrame: frameByName('compressed_atlas', outlineName),
  };
}

function fitStyle(f: any, boxSize: number) {
  if (!f) return {};
  const k = Math.min(boxSize / (f.sw * 2), boxSize / (f.sh * 2));
  const dw = f.sw * 2 * k;
  const dh = f.sh * 2 * k;
  return {
    ...frameStyle(f, dw, dh),
    left: `${(boxSize - dw) / 2}px`,
    top: `${(boxSize - dh) / 2}px`,
  };
}

/** 已访问节点的铅笔圆圈特效（对应 NMapCircleVfx） */
function BlitzCircleVfx({ play }: { play: boolean }) {
  const [frame, setFrame] = useState(play ? 0 : 4);
  useEffect(() => {
    if (!play) {
      setFrame(4);
      return;
    }
    let idx = 0;
    setFrame(0);
    const id = setInterval(() => {
      idx++;
      if (idx > 4) clearInterval(id);
      else setFrame(idx);
    }, 1000 / 24);
    return () => clearInterval(id);
  }, [play]);

  const f = frameByName('compressed_atlas', `map_circle_${frame}`);
  if (!f) return null;
  const w = f.sw * 2 * 0.675;
  const h = f.sh * 2 * 0.675;
  return (
    <div
      class="btm-circle"
      style={{
        ...frameStyle(f, w, h),
        left: `${20 - w / 2}px`,
        top: `${20 - h / 2}px`,
      }}
    />
  );
}

/** 单个 Blitz 顶栏节点（对应 NBlitzTopBarMapPoint） */
function BlitzMapPoint({
  pt,
  index,
  rs,
  visited,
  newlyVisited,
  onFloorTip,
}: {
  pt: any;
  index: number;
  rs: any;
  visited: boolean;
  newlyVisited: boolean;
  onFloorTip?: (tip: { d: FloorTipData; cell: [number, number]; w: number } | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const vis = resolvePointVisual(pt, rs);
  const boxSize = vis.isSpecial ? 60 : 40;

  const showTip = () => {
    const r = logicalRect(el.current) ?? [index * 70, 21.5, 40, 40];
    const cx = r[0] + r[2] * 0.5;
    const tipY = r[1] + r[3] + 20;
    const tipX = Math.max(edge.l + 12, Math.min(edge.r - 372, cx - 180));

    // 已完成楼层显示房间战绩浮窗，未到达或当前节点显示地图图例提示
    const actIdx = safe(() => rs.CurrentActIndex, 0);
    const history = safe(() => list(rs.MapPointHistory), [] as any[]);
    const actHist = actIdx < history.length ? list(history[actIdx]) : [];
    const row = pt?.coord?.row ?? -1;
    const entry = row >= 0 && row < actHist.length ? actHist[row] : null;
    const curLoc = safe(() => rs.MapLocation?.coord ?? rs.CurrentMapCoord, null);

    if (entry && !coordEq(curLoc, pt.coord)) {
      let floorNum = row + 1;
      for (let i = 0; i < history.length - 1; i++) {
        floorNum += list(history[i]).length;
      }
      const myId = safe(() => localPlayer(rs)?.NetId ?? 1, 1);
      const data = floorTipData(entry, floorNum, myId);
      if (onFloorTip) {
        onFloorTip({ d: data, cell: [tipX, tipY], w: 0 });
        return;
      }
    }

    onFloorTip?.(null);
    const key = LEGEND_KEYS[pt?.PointType] ?? 'LEGEND_UNKNOWN';
    const title = loc('map', `${key}.hoverTip.title`);
    let desc = loc('map', `${key}.hoverTip.description`);
    if (pt?.PointType === G.MapPointType?.Boss) {
      const bossName = safe(() => rs.Act.BossEncounter.Title.GetFormattedText(), '') ?? '';
      desc += '\n\n' + locv('static_hover_tips', 'BOSS.description', { BossName: bossName });
    }
    setTip(title, desc, { kind: 'at', x: tipX, y: tipY });
  };

  const hideTip = () => {
    onFloorTip?.(null);
    setTip(null);
  };

  return (
    <div
      ref={el}
      class={'btm-point' + (visited ? ' visited' : '')}
      style={{ left: `${index * 70}px`, top: '21.5px' }}
      onPointerEnter={showTip}
      onPointerLeave={hideTip}
    >
      {vis.isSpecial ? (
        <div class="btm-special">
          {vis.outlineUrl && <img class="btm-outline" src={vis.outlineUrl} />}
          {vis.iconUrl && <img class="btm-icon" src={vis.iconUrl} />}
        </div>
      ) : (
        <div class="btm-normal">
          {vis.outlineFrame && <div class="btm-outline-atlas" style={fitStyle(vis.outlineFrame, boxSize)} />}
          {vis.iconFrame && <div class="btm-icon-atlas" style={fitStyle(vis.iconFrame, boxSize)} />}
        </div>
      )}
      {visited && <BlitzCircleVfx play={newlyVisited} />}
    </div>
  );
}

export interface BlitzTopBarMapProps {
  rs: any;
  /** 可用区间左边界（1920 视口坐标系下的右侧参考值，缺省自动从 DOM 测算） */
  leftBound?: number;
  /** 可用区间右边界（1920 视口坐标系下的左侧参考值，缺省自动从 DOM 测算） */
  rightBound?: number;
  /** 悬停已访问节点的房间历史浮窗回调 */
  onFloorTip?: (tip: { d: FloorTipData; cell: [number, number]; w: number } | null) => void;
}

/** Blitz 模式顶栏地图（对应 NBlitzTopBarMap） */
export function BlitzTopBarMap({ rs, leftBound, rightBound, onFloorTip }: BlitzTopBarMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const prevCoordRef = useRef<string>('');
  const [pulseKey, setPulseKey] = useState(0);

  const pts = safe(() => [...$.iter(rs.Map.GetMapPoints())], [] as any[]);
  const visitedList = safe(() => list(rs.VisitedMapCoords), [] as any[]);
  const curCoord = visitedList.length > 0
    ? visitedList[visitedList.length - 1]
    : safe(() => rs.Map?.StartingMapPoint?.coord, null);

  const curIdx = curCoord ? pts.findIndex((p) => coordEq(p.coord, curCoord)) : -1;
  const curKey = curCoord ? `${curCoord.row},${curCoord.col}` : '';

  useEffect(() => {
    if (prevCoordRef.current && prevCoordRef.current !== curKey) {
      setPulseKey((k) => k + 1);
    }
    prevCoordRef.current = curKey;
  }, [curKey]);

  // 当前标记翻转跳动动画（对应 NMapMarker.SetMapPoint 的 Elastic 弹跳）
  useLayoutEffect(() => {
    const m = markerRef.current;
    if (!m || curIdx < 0) return;
    m.animate(
      [
        { scale: '0 -1', translate: '0 0' },
        { scale: '1 -1', translate: '0 25px', offset: 0.21 },
        { scale: '1 -1', translate: '0 0' },
      ],
      { duration: 950, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    );
  }, [curIdx, pulseKey]);

  // 宽度与居中防重叠缩放（对应 NBlitzTopBarMap.Reposition）
  const containerW = pts.length > 0 ? pts.length * 35 + (pts.length - 1) * 35 : 0;
  useLayoutEffect(() => {
    const track = trackRef.current;
    const host = hostRef.current;
    if (!track || !host || containerW <= 0) return;

    const updateLayout = () => {
      const hostW = host.clientWidth || 1920;
      let lb = leftBound ?? 0;
      let rb = rightBound ?? hostW;

      // 自动读取同一顶栏容器中的左右子元素边界，避免节点数多或非 16:9 视口下重叠
      if (leftBound === undefined || rightBound === undefined) {
        const bar = host.parentElement;
        if (bar) {
          const st = (document.querySelector('.stage-root') as HTMLElement | null)?.getBoundingClientRect();
          const scaleK = st && st.width > 0 ? 1920 / st.width : 1;
          const hostRect = host.getBoundingClientRect();
          if (leftBound === undefined) {
            const leftEl = bar.querySelector('.tb-left');
            if (leftEl) {
              let maxRight = 0;
              for (const ch of Array.from(leftEl.children)) {
                const cr = ch.getBoundingClientRect();
                if (cr.width > 0 && cr.height > 0) maxRight = Math.max(maxRight, (cr.right - hostRect.left) * scaleK);
              }
              if (maxRight > 0) lb = maxRight + 25;
            }
          }
          if (rightBound === undefined) {
            const rightEl = bar.querySelector('.tb-right');
            if (rightEl) {
              let minLeft = hostW;
              for (const ch of Array.from(rightEl.children)) {
                const cls = (ch as HTMLElement).className || '';
                if (cls.includes('tb-save')) continue;
                const cr = ch.getBoundingClientRect();
                if (cr.width > 0 && cr.height > 0) minLeft = Math.min(minLeft, (cr.left - hostRect.left) * scaleK);
              }
              if (minLeft < hostW) rb = minLeft - 25;
            }
          }
        }
      }

      let x = (hostW - containerW) * 0.5;
      let s = 1;
      if (lb > x) {
        x = lb;
        if (x + containerW > rb && rb > lb) {
          s = Math.max(0.4, (rb - lb) / containerW);
        }
      } else if (x + containerW > rb && rb > lb) {
        const avail = rb - lb;
        if (containerW <= avail) {
          x = rb - containerW;
        } else {
          x = lb;
          s = Math.max(0.4, avail / containerW);
        }
      }

      track.style.left = `${x}px`;
      track.style.transform = `scale(${s})`;
      track.style.transformOrigin = '0 50%';
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [containerW, leftBound, rightBound, pts.length]);

  if (pts.length === 0) return null;

  const dotFrame = frameByName('compressed_atlas', 'map_dot');
  const charId = safe(() => localPlayer(rs).Character.Id.Entry.toLowerCase(), 'ironclad');
  const markerSrc = imageUrl(`images/packed/map/icons/map_marker_${charId}.png`);

  return (
    <div class="blitz-top-map" ref={hostRef}>
      <div class="btm-track" ref={trackRef} style={{ width: `${containerW}px` }}>
        {/* 节点之间的虚线连接点 */}
        <div class="btm-paths">
          {pts.slice(1).map((_, idx) =>
            [44, 55, 66].map((offsetX, dIdx) => (
              <div
                key={`${idx}-${dIdx}`}
                class="btm-dot"
                style={{
                  ...(dotFrame ? frameStyle(dotFrame, 10, 16) : {}),
                  left: `${idx * 70 + offsetX - 5}px`,
                  top: '33.5px',
                }}
              />
            ))
          )}
        </div>

        {/* 线性节点序列 */}
        <div class="btm-points">
          {pts.map((pt, i) => {
            const isVisited = visitedList.some((c) => coordEq(c, pt.coord));
            const isNew = isVisited && coordEq(curCoord, pt.coord) && pulseKey > 0;
            return (
              <BlitzMapPoint
                key={`${pt.coord?.row ?? i}-${pt.coord?.col ?? i}`}
                pt={pt}
                index={i}
                rs={rs}
                visited={isVisited}
                newlyVisited={isNew}
                onFloorTip={onFloorTip}
              />
            );
          })}
        </div>

        {/* 当前所在节点的翻转角色标记 */}
        {curIdx >= 0 && markerSrc && (
          <div
            ref={markerRef}
            class="btm-marker"
            style={{
              left: `${curIdx * 70}px`,
              top: '56.5px',
              backgroundImage: `url(${markerSrc})`,
            }}
          />
        )}
      </div>
    </div>
  );
}
