// 画面で共通して使う小さな部品（アイコン・アバター・日付の表示）

import type { ReactNode } from 'react';
import { colorOf, shade } from '../field/campusField';

// ---------------------------------------------------------------
// 日付の表示
// ---------------------------------------------------------------
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const isToday = (iso: string) => dayKey(new Date(iso)) === dayKey(new Date());
const hhmm = (iso: string) => { const d = new Date(iso); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const when = (iso: string) => { const d = new Date(iso); return isToday(iso) ? hhmm(iso) : `${d.getMonth() + 1}/${d.getDate()} ${hhmm(iso)}`; };
export const fullDate = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
export const yen = (pt: number) => (pt / 100).toLocaleString('ja-JP', { maximumFractionDigits: 1 });

// ---------------------------------------------------------------
// アイコン
// ---------------------------------------------------------------
function Svg({ size, strokeWidth = 1.9, children }: { size: number; strokeWidth?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}

export const Icon = {
  Home: () => <Svg size={22}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></Svg>,
  Friends: ({ size = 22 }: { size?: number }) => (
    <Svg size={size}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9M18 19a5.4 5.4 0 0 0-2.2-4.3" /></Svg>
  ),
  Settings: () => (
    <Svg size={22} strokeWidth={1.7}><circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  Hide: () => (
    <Svg size={19}><path d="M3 3l18 18" /><path d="M10.6 5.2a9.6 9.6 0 0 1 10.4 6.8 12 12 0 0 1-2.4 3.9M6.2 6.7A11.6 11.6 0 0 0 3 12a9.6 9.6 0 0 0 12.8 5.4" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>
  ),
  Check: () => <Svg size={30} strokeWidth={2.4}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  Chevron: () => <Svg size={16} strokeWidth={2}><path d="M9 6l6 6-6 6" /></Svg>,
  Back: () => <Svg size={18} strokeWidth={2.2}><path d="M15 6l-6 6 6 6" /></Svg>,
  Plus: () => <Svg size={18} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></Svg>,
  Wifi: () => (
    <Svg size={18}><path d="M2 8.8a15 15 0 0 1 20 0" /><path d="M5.5 12.4a10 10 0 0 1 13 0" /><path d="M9 16a5 5 0 0 1 6 0" /><circle cx="12" cy="19.2" r=".9" fill="currentColor" /></Svg>
  ),
};

// ---------------------------------------------------------------
// アバター（そのフレンドのスライムと同じ色）
// ---------------------------------------------------------------
export function Avatar({ userId, name, on = false, off = false, small = false }: { userId: string; name: string; on?: boolean; off?: boolean; small?: boolean }) {
  const c = colorOf(userId);
  return (
    <div className={`av${on ? ' on' : ''}${off ? ' off' : ''}${small ? ' small' : ''}`} style={{ background: shade(c, 0.72), color: shade(c, -0.5) }}>
      <span className="ring" />{name.charAt(0)}
    </div>
  );
}
