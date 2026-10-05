// 公式インスタ（@cokoyo.sfc）への誘導。フレンドタブの上のほうに、いつも同じ大きさで出す
//
// 以前は、一度ボタンを押した人には下に小さく出すだけにしていたが、
// 「急に下に移った」ように見えて分かりにくかったのでやめた（2026-10-05）。
// 押したかどうかで出し方を変えない。端末に何も覚えさせないので、だれが開いても同じに見える。
//
// 文言の「フレンド」は、アプリのフレンド機能と同じ言い方にそろえている（「友達」とは書かない）。

import { COLORS, SELF_COLOR, slimeSvg } from '../field/campusField';

export const INSTAGRAM_URL = 'https://www.instagram.com/cokoyo.sfc/';

function IgIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InstagramCard() {
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
      <a className="ig-btn" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
        <IgIcon />インスタでフォローする
      </a>
    </div>
  );
}
