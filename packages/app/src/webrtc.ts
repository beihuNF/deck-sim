// WebRTC DataChannel P2P transport with STUN hole punching and dual-stack fallback.
/* eslint-disable @typescript-eslint/no-explicit-any */

const ICE_SERVERS: RTCIceServer[] = [
  // 1. 自建国内高可用 BGP TURN / STUN 节点（深圳机房，极速中继打洞保底）
  {
    urls: [
      'stun:120.24.232.60:3478',
      'turn:120.24.232.60:3478?transport=udp',
      'turn:120.24.232.60:3478?transport=tcp',
    ],
    username: 'sts2',
    credential: 'coop2026pass',
  },
  // 2. 国内公共优质 STUN 节点辅助打洞
  { urls: ['stun:stun.qq.com:3478', 'stun:stun.miwifi.com:3478'] },
  // 3. 海外与全网保底 STUN
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

export interface P2PPeerStatus {
  id: number;
  connected: boolean;
  ping: number;
}

type SignalSender = (to: number, data: any) => void;
type PacketReceiver = (bytes: number[], sender: number) => void;

class PeerConnection {
  readonly peerId: number;
  private readonly myId: number;
  private readonly sendSignal: SignalSender;
  private readonly onReceive: PacketReceiver;
  private readonly onStatusChange: () => void;

  pc: RTCPeerConnection | null = null;
  reliableDc: RTCDataChannel | null = null;
  unreliableDc: RTCDataChannel | null = null;
  connected = false;
  ping = 0;

  private pingTimer: any = null;
  private fallbackTimer: any = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private closed = false;

  constructor(myId: number, peerId: number, sendSignal: SignalSender, onReceive: PacketReceiver, onStatusChange: () => void) {
    this.myId = myId;
    this.peerId = peerId;
    this.sendSignal = sendSignal;
    this.onReceive = onReceive;
    this.onStatusChange = onStatusChange;
    this.init();
  }

  private init() {
    if (typeof RTCPeerConnection === 'undefined') return;
    try {
      this.pc = new RTCPeerConnection({
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 2,
      });
      console.log(`[WebRTC] Initializing peer connection with player ${this.peerId} (myId: ${this.myId})`);
    } catch (e) {
      console.warn('[WebRTC] RTCPeerConnection init failed', e);
      return;
    }

    this.pc.onicecandidate = e => {
      if (e.candidate && !this.closed) {
        console.log(`[WebRTC] ICE candidate ready for player ${this.peerId}:`, e.candidate.candidate);
        this.sendSignal(this.peerId, {
          candidate: {
            candidate: e.candidate.candidate,
            sdpMid: e.candidate.sdpMid,
            sdpMLineIndex: e.candidate.sdpMLineIndex,
          },
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      console.log(`[WebRTC] Peer ${this.peerId} connection state changed: ${state}`);
      if (state === 'connected') {
        this.checkChannels();
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.markDisconnected();
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] Peer ${this.peerId} ICE state: ${this.pc?.iceConnectionState}`);
      if (this.pc?.iceConnectionState === 'connected' || this.pc?.iceConnectionState === 'completed') {
        this.checkChannels();
      }
    };

    // 默认较小 ID 主动发起 Offer；较大 ID 等待接收 Offer
    if (this.myId < this.peerId) {
      this.setupOffererChannels();
      void this.createOffer();
    } else {
      this.pc.ondatachannel = e => {
        console.log(`[WebRTC] Received data channel: ${e.channel.label} from player ${this.peerId}`);
        this.bindDataChannel(e.channel);
      };
      // 容错机制：若 3 秒内未收到较小 ID 的 Offer，自动发起连接避免死锁
      this.fallbackTimer = setTimeout(() => {
        if (!this.connected && !this.closed && this.pc && !this.reliableDc) {
          console.log(`[WebRTC] No offer received from player ${this.peerId} after 3s, initiating offer as fallback...`);
          this.setupOffererChannels();
          void this.createOffer();
        }
      }, 3000);
    }
  }

  private setupOffererChannels() {
    if (!this.pc) return;
    try {
      const rDc = this.pc.createDataChannel('sts2_reliable', { ordered: true });
      this.bindDataChannel(rDc);
      const uDc = this.pc.createDataChannel('sts2_unreliable', { ordered: false, maxRetransmits: 0 });
      this.bindDataChannel(uDc);
    } catch (e) {
      console.warn('[WebRTC] createDataChannel failed', e);
    }
  }

  private bindDataChannel(dc: RTCDataChannel) {
    console.log(`[WebRTC] Binding data channel: ${dc.label} for peer ${this.peerId}`);
    if (dc.label === 'sts2_reliable') {
      this.reliableDc = dc;
    } else if (dc.label === 'sts2_unreliable') {
      this.unreliableDc = dc;
    }

    dc.onopen = () => {
      console.log(`[WebRTC] Data channel ${dc.label} OPEN for peer ${this.peerId}`);
      this.checkChannels();
    };
    dc.onclose = () => {
      console.log(`[WebRTC] Data channel ${dc.label} CLOSED for peer ${this.peerId}`);
      this.checkChannels();
    };
    dc.onerror = e => {
      console.warn(`[WebRTC] Data channel ${dc.label} ERROR`, e);
      this.checkChannels();
    };
    dc.onmessage = e => this.handleMessage(e.data);
  }

  private checkChannels() {
    const isNowConnected = this.reliableDc?.readyState === 'open' && this.unreliableDc?.readyState === 'open';
    if (isNowConnected !== this.connected) {
      this.connected = isNowConnected;
      if (this.connected) {
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer);
          this.fallbackTimer = null;
        }
        console.log(`[WebRTC] SUCCESS: Full P2P connection established with player ${this.peerId}!`);
        this.sendPingNow();
        this.startPingLoop();
      } else {
        this.stopPingLoop();
      }
      this.onStatusChange();
    }
  }

  private markDisconnected() {
    if (this.connected) {
      console.log(`[WebRTC] P2P disconnected from player ${this.peerId}`);
      this.connected = false;
      this.stopPingLoop();
      this.onStatusChange();
    }
  }

  private async createOffer() {
    if (!this.pc || this.closed) return;
    try {
      console.log(`[WebRTC] Creating offer for player ${this.peerId}...`);
      const offer = await this.pc.createOffer();
      if (this.closed || !this.pc) return;
      await this.pc.setLocalDescription(offer);
      console.log(`[WebRTC] Sending offer to player ${this.peerId}`);
      this.sendSignal(this.peerId, {
        offer: {
          type: offer.type,
          sdp: offer.sdp,
        },
      });
    } catch (e) {
      console.warn('[WebRTC] createOffer failed', e);
    }
  }

  async handleSignal(data: any) {
    if (!this.pc || this.closed) return;
    try {
      if (data.offer) {
        console.log(`[WebRTC] Received offer from player ${this.peerId}`);
        if (this.fallbackTimer) {
          clearTimeout(this.fallbackTimer);
          this.fallbackTimer = null;
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        for (const c of this.pendingCandidates) {
          try { await this.pc.addIceCandidate(c); } catch {}
        }
        this.pendingCandidates = [];
        const answer = await this.pc.createAnswer();
        if (this.closed || !this.pc) return;
        await this.pc.setLocalDescription(answer);
        console.log(`[WebRTC] Sending answer to player ${this.peerId}`);
        this.sendSignal(this.peerId, {
          answer: {
            type: answer.type,
            sdp: answer.sdp,
          },
        });
      } else if (data.answer) {
        console.log(`[WebRTC] Received answer from player ${this.peerId}`);
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        for (const c of this.pendingCandidates) {
          try { await this.pc.addIceCandidate(c); } catch {}
        }
        this.pendingCandidates = [];
      } else if (data.candidate) {
        console.log(`[WebRTC] Received ICE candidate from player ${this.peerId}`);
        const candidate = new RTCIceCandidate(data.candidate);
        if (this.pc.remoteDescription) {
          await this.pc.addIceCandidate(candidate);
        } else {
          this.pendingCandidates.push(data.candidate);
        }
      }
    } catch (e) {
      console.warn('[WebRTC] handleSignal error', e);
    }
  }

  send(packet: { volatile?: boolean; bytes: number[]; seq?: number; sender?: number; to?: number }): boolean {
    if (!this.connected) return false;
    const dc = packet.volatile ? this.unreliableDc : this.reliableDc;
    if (dc?.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(packet));
      return true;
    } catch {
      return false;
    }
  }

  private handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'p2p_ping') {
        if (this.reliableDc?.readyState === 'open') {
          this.reliableDc.send(JSON.stringify({ type: 'p2p_pong', t: msg.t }));
        }
        return;
      }
      if (msg.type === 'p2p_pong') {
        if (typeof msg.t === 'number') {
          const rtt = Math.max(1, Math.round(performance.now() - msg.t));
          if (rtt < 3000) {
            this.ping = this.ping ? Math.round(this.ping * 0.75 + rtt * 0.25) : rtt;
            this.onStatusChange();
          }
        }
        return;
      }
      if (Array.isArray(msg.bytes) && typeof msg.sender === 'number') {
        this.onReceive(msg.bytes, msg.sender);
      }
    } catch {}
  }

  private sendPingNow() {
    if (this.reliableDc?.readyState === 'open') {
      try {
        this.reliableDc.send(JSON.stringify({ type: 'p2p_ping', t: performance.now() }));
      } catch {}
    }
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingTimer = setInterval(() => {
      this.sendPingNow();
    }, 2_500);
  }

  private stopPingLoop() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  destroy() {
    this.closed = true;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    this.stopPingLoop();
    try { this.reliableDc?.close(); } catch {}
    try { this.unreliableDc?.close(); } catch {}
    try { this.pc?.close(); } catch {}
    this.reliableDc = null;
    this.unreliableDc = null;
    this.pc = null;
    this.connected = false;
  }
}

export class WebRtcMeshManager {
  private myId = 0;
  private sendSignal: SignalSender | null = null;
  private onReceive: PacketReceiver | null = null;
  private onStatusChange: () => void = () => {};
  private peers = new Map<number, PeerConnection>();

  start(myId: number, sendSignal: SignalSender, onReceive: PacketReceiver, onStatusChange: () => void) {
    this.stop();
    this.myId = myId;
    this.sendSignal = sendSignal;
    this.onReceive = onReceive;
    this.onStatusChange = onStatusChange;
  }

  syncPeers(activePlayerIds: number[]) {
    if (!this.myId || !this.sendSignal || !this.onReceive) return;
    const needed = new Set(activePlayerIds.filter(id => id !== this.myId));

    // 清理离开的玩家
    for (const [id, peer] of this.peers) {
      if (!needed.has(id)) {
        peer.destroy();
        this.peers.delete(id);
      }
    }

    // 建立新进入的玩家连接
    for (const id of needed) {
      if (!this.peers.has(id)) {
        const peer = new PeerConnection(this.myId, id, this.sendSignal, this.onReceive, () => this.onStatusChange());
        this.peers.set(id, peer);
      }
    }
  }

  handleSignal(from: number, data: any) {
    if (!this.myId || !this.sendSignal || !this.onReceive) return;
    let peer = this.peers.get(from);
    if (!peer) {
      // 容错：若信令到达时尚未同步Peer列表，立即创建并绑定
      console.log(`[WebRTC] Auto-creating peer connection for incoming signal from player ${from}`);
      peer = new PeerConnection(this.myId, from, this.sendSignal, this.onReceive, () => this.onStatusChange());
      this.peers.set(from, peer);
    }
    void peer.handleSignal(data);
  }

  /**
   * 尝试通过 P2P DataChannel 发送数据包。
   * 若所有目标节点都通过 P2P 成功发出，返回 true；若存在未直连节点或发送失败，返回 false（以便调用方降级走 WebSocket）。
   */
  send(packet: { volatile?: boolean; bytes: number[]; seq?: number; sender?: number; to?: number }): boolean {
    if (this.peers.size === 0) return false;
    const recipient = packet.to ?? 0;

    // 单播
    if (recipient !== 0) {
      const peer = this.peers.get(recipient);
      if (!peer || !peer.connected) return false;
      return peer.send(packet);
    }

    // 广播：检查是否所有存活队友均已 P2P 连通
    for (const peer of this.peers.values()) {
      if (!peer.connected) return false;
    }
    let allOk = true;
    for (const peer of this.peers.values()) {
      if (!peer.send(packet)) allOk = false;
    }
    return allOk;
  }

  /** 获取当前 P2P 直连状态：是否有任何直连连接，以及平均 P2P 延迟 */
  getStatus(): { isP2P: boolean; ping: number; connectedCount: number; totalCount: number } {
    let connectedCount = 0;
    let sumPing = 0;
    for (const p of this.peers.values()) {
      if (p.connected) {
        connectedCount++;
        sumPing += p.ping;
      }
    }
    const totalCount = this.peers.size;
    const isP2P = totalCount > 0 && connectedCount === totalCount;
    const ping = connectedCount > 0 ? Math.round(sumPing / connectedCount) : 0;
    return { isP2P, ping, connectedCount, totalCount };
  }

  stop() {
    for (const p of this.peers.values()) p.destroy();
    this.peers.clear();
    this.myId = 0;
    this.sendSignal = null;
    this.onReceive = null;
  }
}

export const webrtc = new WebRtcMeshManager();
