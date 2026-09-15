// かくれんぼの切り替え（ホームとフレンド画面の両方に置く）

import { useApp } from '../app/AppContext';
import { Icon } from './ui';

export function HideCard() {
  const { me, toggleHide } = useApp();
  if (!me) return null;
  return (
    <div className="card">
      <button className={`setting${me.hidden ? ' on' : ''}`} onClick={() => void toggleHide()} aria-pressed={me.hidden}>
        <span className="ico"><Icon.Hide /></span>
        <span className="sbody">
          <span className="stitle">かくれんぼ</span>
          <span className="ssub">{me.hidden ? 'フレンド全員から「いません」に見えています' : 'オンにすると、フレンド全員から「いません」に見えます'}</span>
        </span>
        <span className="switch" />
      </button>
    </div>
  );
}
