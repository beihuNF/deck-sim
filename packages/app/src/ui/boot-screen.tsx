import { useEffect, useState } from 'preact/hooks';
import { subscribeBootProgress, bootState, type BootState } from '../render/boot-status';

export function BootScreen() {
  const [st, setSt] = useState<BootState>(bootState);

  useEffect(() => {
    return subscribeBootProgress((next) => {
      setSt({ ...next });
    });
  }, []);

  const pct = Math.min(100, Math.max(0, Math.round(st.progress)));

  return (
    <div class="boot-screen">
      <div class="boot-bg-glow" />
      <div class="boot-content">
        <div class="boot-title-wrap">
          <div class="boot-title">SLAY THE SPIRE 2</div>
          <div class="boot-subtitle">WEB EDITION</div>
        </div>

        <div class="boot-meter-box">
          <div class="boot-meter-header">
            <span class="boot-status-text">{st.title}</span>
            <span class="boot-pct-text">{pct}%</span>
          </div>

          <div class="boot-bar-track">
            <div
              class="boot-bar-fill"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div class="boot-meter-footer">
            <span class="boot-detail-text">{st.detail || '...'}</span>
          </div>
        </div>

        {st.gpuInfo && (
          <div class="boot-gpu-badge">
            <span class="boot-gpu-dot" />
            <span class="boot-gpu-label">{st.gpuInfo}</span>
          </div>
        )}
      </div>
    </div>
  );
}
