// 公式インスタ（@cokoyo.sfc）への誘導。フレンドタブに出す
//
// まだ押していない人には、フレンドタブのいちばん上の近くに大きめのカードで出す。
// 一度押した人には、いちばん下に小さく出すだけにする（フォローしたかどうかは分からないので、
// 消しはしない。毎回大きく出すと、フレンドの一覧が見づらくなる）。
//
// 文言の「フレンド」は、アプリのフレンド機能と同じ言い方にそろえている（「友達」とは書かない）。

import { useCallback, useState } from 'react';
import { COLORS, SELF_COLOR, slimeSvg } from '../field/campusField';

export const INSTAGRAM_URL = 'https://www.instagram.com/cokoyo.sfc/';
const TAPPED = 'cokoyo-ig-tapped:v1';

const wasTapped = () => { try { return localStorage.getItem(TAPPED) === '1'; } catch { return false; } };

/** 押したかどうか。上のカードと下の行で同じ値を使うので、フレンドタブで1つだけ持つ */
export function useInstagramTapped(): [boolean, () => void] {
  const [tapped, setTapped] = useState(wasTapped);
  const mark = useCallback(() => {
    try { localStorage.setItem(TAPPED, '1'); } catch { /* 覚えられなければ、次も大きく出るだけ */ }
    // 開いた直後に下へ移すと、戻ってきたときに見失うので、少し待つ
    window.setTimeout(() => setTapped(true), 1500);
  }, []);
  return [tapped, mark];
}

function IgIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** where … 'top' はまだ押していない人向けの大きいカード、'bottom' は押した人向けの小さい行 */
export function InstagramCard({ where, tapped, onTap }: { where: 'top' | 'bottom'; tapped: boolean; onTap(): void }) {
  if ((where === 'top') === tapped) return null;

  if (where === 'bottom') {
    return (
      <a className="ig-row" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
        <span className="ig-row-icon"><IgIcon size={16} /></span>
        <span className="ig-row-text">COKOYO 公式インスタ <b>@cokoyo.sfc</b></span>
        <span className="ig-row-arrow" aria-hidden="true">›</span>
      </a>
    );
  }

  return (
    <div className="ig-card">
      <div className="ig-slimes" aria-hidden="true">
        <span dangerouslySetInnerHTML={{ __html: slimeSvg(COLORS[5]) }} />
        <span className="ig-me" dangerouslySetInnerHTML={{ __html: slimeSvg(SELF_COLOR) }} />
        <span dangerouslySetInnerHTML={{ __html: slimeSvg(COLORS[0]) }} />
      </div>
      <p className="ig-kicker">公式インスタ @cokoyo.sfc</p>
      <h4 className="ig-title">COKOYOとも、フレンドになろう</h4>
      <p className="ig-body">新しい機能のお知らせや使い方のコツ、COKOYO主催のイベントの告知を、いちばん早く届けます。</p>
      <a className="ig-btn" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" onClick={onTap}>
        <IgIcon />インスタでフォローする
      </a>
    </div>
  );
}
