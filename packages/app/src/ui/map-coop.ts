/* eslint-disable @typescript-eslint/no-explicit-any */
import { G, list } from '../game';

export interface DrawingLine { e: boolean; p: number[] }
/** NMapDrawings' original messages and per-player layers. Co-op drawings live only in the temporary run. */
export class CoopMapDrawings {
  readonly layers = new Map<number, DrawingLine[]>();
  private current = new Map<number, DrawingLine>();
  private modes = new Map<number, number>();
  private queued: any = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private net: any, private players: any[], private paint: () => void) {
    net.RegisterMessageHandler(G.MapDrawingMessage, this.receive);
    net.RegisterMessageHandler(G.ClearMapDrawingsMessage, this.receiveClear);
    net.RegisterMessageHandler(G.MapDrawingModeChangedMessage, this.receiveMode);
  }
  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.net.UnregisterMessageHandler(G.MapDrawingMessage, this.receive);
    this.net.UnregisterMessageHandler(G.ClearMapDrawingsMessage, this.receiveClear);
    this.net.UnregisterMessageHandler(G.MapDrawingModeChangedMessage, this.receiveMode);
  }
  clearAll() {
    this.flush();
    this.layers.clear(); this.current.clear(); this.paint();
  }
  clearMine() {
    this.end(); this.flush(); this.clear(this.net.NetId);
    this.net.SendMessage$2(G.ClearMapDrawingsMessage, new G.ClearMapDrawingsMessage().$zero_ClearMapDrawingsMessage());
  }
  begin(x: number, y: number, erase: boolean) {
    this.event(G.MapDrawingEventType.BeginLine, x, y, erase ? 2 : 1);
  }
  extend(x: number, y: number) { this.event(G.MapDrawingEventType.ContinueLine, x, y); }
  end() { if (this.current.has(this.net.NetId)) this.event(G.MapDrawingEventType.EndLine); }
  private event(type: number, x = 0, y = 0, mode: number | null = null) {
    const ev = new G.NetMapDrawingEvent().$zero_NetMapDrawingEvent();
    ev.type = type; ev.overrideDrawingMode = mode;
    // The original coordinates normalize the full-size paper, while our canvas stores half-size points.
    ev.position = { X: (x * 2 - 960) / 960, Y: y / 1620 };
    this.apply(this.net.NetId, ev, mode);
    this.queued ??= new G.MapDrawingMessage().$ctor_MapDrawingMessage();
    if (!this.queued.TryAddEvent(ev)) {
      this.flush();
      this.queued = new G.MapDrawingMessage().$ctor_MapDrawingMessage();
      this.queued.TryAddEvent(ev);
    }
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 50);
  }
  private flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.queued && this.net.IsConnected) this.net.SendMessage$2(G.MapDrawingMessage, this.queued);
    this.queued = null;
  }
  private receive = (msg: any, sender: number) => {
    if (!this.players.some(p => p.NetId === sender) || sender === this.net.NetId) return;
    for (const ev of list(msg.Events)) this.apply(sender, ev, msg.drawingMode);
  };
  private receiveClear = (_msg: any, sender: number) => { this.clear(sender); };
  private receiveMode = (msg: any, sender: number) => { this.modes.set(sender, msg.drawingMode); };
  private clear(sender: number) { this.layers.delete(sender); this.current.delete(sender); this.paint(); }
  private apply(sender: number, ev: any, mode: number | null) {
    if (ev.type === G.MapDrawingEventType.EndLine) { this.current.delete(sender); return; }
    const x = (ev.position.X * 960 + 960) / 2, y = ev.position.Y * 1620;
    let line = this.current.get(sender);
    if (ev.type === G.MapDrawingEventType.BeginLine || !line) {
      line = { e: (ev.overrideDrawingMode ?? mode ?? this.modes.get(sender)) === 2, p: [x, y, x, y + 0.5] };
      this.current.set(sender, line);
      const layer = this.layers.get(sender) ?? [];
      layer.push(line); this.layers.set(sender, layer);
    } else line.p.push(x, y);
    this.paint();
  }
}
