// ハロウィン仕様の日（10/31。土日の年は直前の金曜も）にはじめて開いたとき、「Happy Halloween!」をクラッカーと紙吹雪で一瞬だけ出す。
// 1台につき、その日1回だけ。押せばすぐ消える。動きを減らす設定の人には、紙吹雪を出さない。

import { useEffect, useState } from 'react';
import { halloweenDay } from '../field/campusField';

/** 日ごとに1回（前の金曜と当日、それぞれで出す） */
const key = () => `cokoyo-halloween-pop:${new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)}`;
const SHOW_MS = 2600;
const COLORS = ['#FF8A3D', '#7C5CC4', '#2E2A45', '#8FBF6A', '#FFD15A'];

const seen = () => { try { return localStorage.getItem(key()) === '1'; } catch { return true; } };

/** かぼちゃのおばけ（フィールドと同じドット） */
const PUMPKIN = ['....g....', '...gg....', '.ooooooo.', 'ooyooyooo', 'ooooooooo', 'oyoyoyoyo', 'ooyyyyyoo', '.ooooooo.'];
const FILL: Record<string, string> = { g: '#4E7A3A', o: '#F28A2E', y: '#3A2A1E' };
const Pumpkin = () => (
  <svg className="hw-pumpkin" viewBox="0 0 9 8" shape-rendering="crispEdges" aria-hidden="true">
    {PUMPKIN.flatMap((row, y) => [...row].map((ch, x) => (FILL[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width="1.02" height="1.02" fill={FILL[ch]} /> : null)))}
  </svg>
);

export function HalloweenPop() {
  const [day] = useState(() => halloweenDay());
  const [show, setShow] = useState(() => day !== null && !seen());

  useEffect(() => {
    if (!show) return;
    try { localStorage.setItem(key(), '1'); } catch { /* 保存できない環境 */ }
    const t = window.setTimeout(() => setShow(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;
  return (
    <div className="hw-pop" role="status" aria-live="polite" onClick={() => setShow(false)}>
      <div className="hw-confetti" aria-hidden="true">
        {Array.from({ length: 36 }, (_, i) => (
          <i key={i} style={{
            left: `${(i * 37) % 100}%`, background: COLORS[i % COLORS.length],
            animationDelay: `${(i % 9) * 0.06}s`, ['--x' as string]: `${((i * 53) % 120) - 60}px`, ['--r' as string]: `${(i * 47) % 360}deg`,
          }} />
        ))}
      </div>
      <span className="hw-cracker left" aria-hidden="true">🎉</span>
      <span className="hw-cracker right" aria-hidden="true">🎉</span>
      <div className="hw-card">
        <Pumpkin />
        <p>Happy Halloween!</p>
        <small>{day === 'eve' ? 'ひと足早く、今日のCOKOYOはハロウィン仕様' : '今日のCOKOYOは、ハロウィン仕様'}</small>
      </div>
    </div>
  );
}
