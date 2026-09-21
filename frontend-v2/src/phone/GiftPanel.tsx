// フレンドにポイントを贈る（フレンドの行をひらいた中に出す）
//
// 決まりはバックエンドと同じ：10pt 単位で 10〜1,000pt、1日に贈れるのは合計 1,000pt まで、累計より多くは贈れない。
// ここでの計算は案内のためだけで、最後に決めるのはバックエンド。

import { useState } from 'react';
import { useApp } from '../app/AppContext';
import type { Friend } from '../api/types';
import { isToday, yen } from './ui';

const GIFT = { MIN: 10, MAX: 1000, STEP: 10, DAILY: 1000 };
const CHOICES = [10, 50, 100, 300];

export function GiftPanel({ friend, onDone }: { friend: Friend; onDone(): void }) {
  const { points, gift } = useApp();
  const [pts, setPts] = useState(50);
  if (!points) return null;

  const sentToday = points.gifts.filter((g) => g.direction === 'out' && isToday(g.createdAt)).reduce((n, g) => n + g.pts, 0);
  const left = Math.max(0, GIFT.DAILY - sentToday);
  const max = Math.min(GIFT.MAX, left, Math.floor(points.total / GIFT.STEP) * GIFT.STEP);
  const valid = Number.isInteger(pts) && pts >= GIFT.MIN && pts <= max && pts % GIFT.STEP === 0;
  const why = max < GIFT.MIN
    ? (left < GIFT.MIN ? '今日はもう贈れません（1日1,000ptまで）' : 'ポイントが足りません')
    : !valid ? `${GIFT.MIN}〜${max.toLocaleString()}pt を ${GIFT.STEP}pt 単位で` : '';

  const step = (d: number) => setPts((v) => Math.min(max, Math.max(GIFT.MIN, (Math.round(v / GIFT.STEP) + d) * GIFT.STEP)));

  return (
    <div className="gift">
      <p className="gift-title">{friend.displayName}さんにポイントを贈る</p>
      <div className="gift-chips">
        {CHOICES.map((c) => (
          <button key={c} className={`gift-chip${pts === c ? ' on' : ''}`} disabled={c > max} onClick={() => setPts(c)}>{c}pt</button>
        ))}
      </div>
      <div className="gift-amount">
        <button className="gift-step" onClick={() => step(-1)} disabled={pts <= GIFT.MIN} aria-label="10pt へらす">−</button>
        <label className="gift-input">
          <input type="number" inputMode="numeric" min={GIFT.MIN} max={max} step={GIFT.STEP} value={Number.isNaN(pts) ? '' : pts}
            onChange={(e) => setPts(parseInt(e.target.value, 10))} aria-label="贈るポイント" />
          <span>pt</span>
        </label>
        <button className="gift-step" onClick={() => step(1)} disabled={pts >= max} aria-label="10pt ふやす">＋</button>
      </div>
      <p className="row-note">
        {why || `約${yen(pts)}円ぶん。`}あなたの累計 {points.total.toLocaleString()}pt・今日あと {left.toLocaleString()}pt 贈れます
      </p>
      <button className="row-btn gift-send" disabled={!valid}
        onClick={async () => { if (await gift(friend.userId, friend.displayName, pts)) onDone(); }}>
        {valid ? `${pts.toLocaleString()}pt 贈る` : '贈る'}
      </button>
    </div>
  );
}
