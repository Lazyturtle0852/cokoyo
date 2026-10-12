// スライムの色を選ぶ（設定タブのプロフィール）
//
// 選んだ色は、自分の画面のスライムだけでなく、フレンドの画面に出るあなたのスライムと
// アイコンの色にもなる。選んでいない人は、自分の画面ではオレンジ、フレンドの画面では
// 名前から決まった色で出る（前からの見え方のまま）。

import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { SLIME_COLORS, type SlimeColor } from '../api/types';
import { selfColor, slimeSvg } from '../field/campusField';

const NAMES: Record<SlimeColor, string> = {
  orange: 'オレンジ', sky: 'みずいろ', green: 'みどり', red: 'あか', purple: 'むらさき',
  yellow: 'きいろ', pink: 'ピンク', mint: 'ミント', blue: 'あお',
};

export function SlimeColorPicker() {
  const { me, run, setMe, showToast } = useApp();
  if (!me) return null;

  const pick = (color: SlimeColor) => {
    if (color === me.color) return;
    void run('スライムの色を変更', async () => {
      setMe(await api.updateMe({ color }));
      showToast(`スライムを${NAMES[color]}にしました`);
    });
  };

  return (
    <div className="slime-colors">
      <div className="k">スライムの色</div>
      <div className="slime-color-row" role="radiogroup" aria-label="スライムの色">
        {(Object.keys(SLIME_COLORS) as SlimeColor[]).map((key) => {
          const on = me.color ? me.color === key : SLIME_COLORS[key] === selfColor();
          return (
            <button key={key} type="button" role="radio" aria-checked={on} aria-label={NAMES[key]}
              className={`slime-color${on ? ' on' : ''}`} onClick={() => pick(key)}
              dangerouslySetInnerHTML={{ __html: slimeSvg(SLIME_COLORS[key]) }} />
          );
        })}
      </div>
      <p className="row-note">{me.color
        ? 'フレンドの画面でも、あなたのスライムとアイコンがこの色で出ます'
        : '選ぶと、フレンドの画面でもあなたのスライムとアイコンがその色になります'}</p>
    </div>
  );
}
