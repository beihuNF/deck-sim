// Full-screen Pixi backdrop for non-combat rooms (rest site, merchant, treasure): owns the shared Pixi canvas while mounted.
import { useEffect, useRef } from 'preact/hooks';
import { Container } from 'pixi.js';
import { getApp } from '../render/stage';

export function Backdrop({ build, id }: { build: () => Promise<Container | null>; id: string }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = new Container();
    let dead = false;
    const attachApp = (retry = true) => {
      getApp()
        .then((a) => {
          if (dead) return;
          a.stage.removeChildren();
          a.stage.addChild(root);
          if (host.current && a.canvas.parentElement !== host.current) {
            host.current.appendChild(a.canvas);
          }
        })
        .catch((err) => {
          console.warn('Backdrop getApp failed for id:', id, err);
          if (retry && !dead) {
            setTimeout(() => { if (!dead) attachApp(false); }, 600);
          }
        });
    };
    attachApp(true);
    build()
      .then((c) => {
        if (c) {
          if (dead) c.destroy({ children: true });
          else root.addChild(c);
        }
      })
      .catch((e) => console.warn('backdrop build failed', id, e));
    return () => {
      dead = true;
      root.parent?.removeChild(root);
      root.destroy({ children: true });
      getApp().then((a) => { if (a.canvas.parentElement === host.current) a.canvas.remove(); }).catch(() => {});
    };
  }, [id]);
  return <div class="stage-host" ref={host} data-backdrop={id} />;
}
