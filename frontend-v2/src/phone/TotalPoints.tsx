// 右上の累計ポイント。在校確認のあと、カウントアップしながら弾む

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function TotalPoints() {
  const { points, displayTotal, counter, screenRef } = useApp();
  const target = displayTotal ?? points?.total ?? 0;
  const [shown, setShown] = useState(target);
  const animating = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!animating.current) setShown(target); }, [target]);

  useEffect(() => {
    counter.current = {
      animate(from, to) {
        const box = boxRef.current;
        if (box) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
        if (reduceMotion()) { setShown(to); return; }
        animating.current = true;
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - t0) / 380, 1);
          setShown(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
          if (p < 1) requestAnimationFrame(step);
          else animating.current = false;
        };
        requestAnimationFrame(step);
      },
      // 累計の下から「+250pt」が浮かび上がる
      pop(text) {
        const box = boxRef.current;
        const screen = screenRef.current;
        if (!box || !screen) return;
        const b = box.getBoundingClientRect();
        const s = screen.getBoundingClientRect();
        const k = s.width / screen.offsetWidth || 1; // 端末の枠が縮小表示されているときの補正
        const p = document.createElement('span');
        p.className = 'pop pop-counter';
        p.textContent = text;
        p.style.right = `${(s.right - b.right) / k}px`;
        p.style.top = `${(b.bottom - s.top) / k}px`;
        screen.appendChild(p);
        window.setTimeout(() => p.remove(), 1100);
      },
    };
    return () => { counter.current = null; };
  }, [counter, screenRef]);

  return (
    <div className="total" ref={boxRef}>
      <span className="total-label">累計</span>
      <span className="total-num">{shown.toLocaleString()}</span>
      <span className="total-unit">pt</span>
    </div>
  );
}
