// ホーム：在校確認 → フレンドの在校 → 今日の獲得 → かくれんぼ
// （上のフィールドはスクロールさせないので、src/phone/Phone.tsx で置いている）

import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { HideCard } from './HideCard';
import { InstallCard } from './Install';
import { Avatar, isToday, when } from './ui';
import { Section } from './Section';

/** 前の確認からこれだけたったら、押し直しをすすめる */
const STALE_MS = 5 * 60 * 1000;

/** 開いているあいだ、時間の経過で表示を変えるための「今」 */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Home() {
  const { me, friends, points, lastCheck: lc, presenceDiff: diff, checking, check, openAddSheet } = useApp();
  const now = useNow(30 * 1000);
  if (!me || !friends || !points) return null;

  const fresh = !!lc && isToday(lc.checkedAt);
  const present = lc?.me.presence === 'present';
  const unknown = lc?.me.presence === 'unknown';
  const today = points.today;

  const kick = lc ? `${when(lc.checkedAt)} に確認` : 'まだ確認していません';
  const title = !lc ? 'キャンパスにいる？' : unknown ? '在校を判定できません' : present ? 'キャンパスにいます' : 'キャンパス外です';
  const sub = !lc ? 'ボタンで、あなたとフレンドの様子を確認' : unknown ? '大学側の通信を確認できませんでした。もう一度お試しください' : present ? lc.me.building : 'キャンパスのWiFiにつながっていません';
  const minutes = lc ? Math.floor((now - new Date(lc.checkedAt).getTime()) / 60000) : 0;
  const stale = fresh && minutes * 60000 >= STALE_MS;
  const hint = stale
    ? `${minutes}分前の確認です。もう一度確認してください`
    : me.hidden
    ? 'かくれんぼ中は来校ポイントだけ入ります（マッチは入りません）'
    : 'キャンパス外でもフレンドの様子は見られます（ポイントはキャンパスでだけ）';

  const results = new Map((lc?.friends ?? []).map((f) => [f.userId, f]));
  const awardedNow = new Map(fresh ? lc!.points.awarded.filter((a) => a.userId).map((a) => [a.userId as string, a]) : []);
  const matchedToday = new Set(today.items.map((i) => i.userId).filter(Boolean));
  const came = new Set(fresh ? diff?.came ?? [] : []);
  const left = new Set(fresh ? diff?.left ?? [] : []);
  const liveCount = friends.friends.filter((f) => results.get(f.userId)?.present).length;
  const changes = [came.size && `${came.size}人来た`, left.size && `${left.size}人帰った`].filter(Boolean).join('・');
  // キャンパスにいる → さっき帰った → いない → 未確認 の順
  const rank = (id: string) => { const r = results.get(id); return !r ? 3 : r.present ? 0 : left.has(id) ? 1 : 2; };
  const sorted = [...friends.friends].sort((a, b) => rank(a.userId) - rank(b.userId));

  return (
    <>
      <InstallCard />

      <div className="card check-card">
        <div className="check-head">
          <div className="kick"><span className={`pulse${fresh && present ? ' live' : ''}`} /><span>{kick}</span></div>
          {me.hidden && <span className="hidechip">かくれんぼ中</span>}
        </div>
        <div className="check-title">{title}<span className="check-sub">{sub}</span></div>
        <button className="btn btn-primary btn-check" onClick={() => void check()} disabled={checking}>
          {checking ? '確認しています…' : <>ポイント獲得<span className="btn-sub">（在校確認）</span></>}
        </button>
        <p className={`btn-hint${stale ? ' stale' : ''}`}>{hint}</p>
      </div>

      <Section id="home.friends" title="フレンド" aside={lc ? `${when(lc.checkedAt)} 時点・${liveCount}人がキャンパスに${changes ? `（${changes}）` : ''}` : '未確認'}>
      <div className="card">
        {sorted.length === 0 && (
          <>
            <div className="pt-empty">まだフレンドがいません</div>
            <button className="btn btn-quiet" onClick={() => openAddSheet()}>フレンドを追加</button>
          </>
        )}
        {sorted.map((f) => {
          const r = results.get(f.userId);
          const a = awardedNow.get(f.userId);
          let chip = null;
          if (r?.present) {
            if (a) {
              chip = a.kind === 'first' ? <span className="chip first">+{a.pts} はじめて</span>
                : a.kind === 'reunion' ? <span className="chip reunion">+{a.pts} {a.days}日ぶり</span>
                : <span className="chip normal">+{a.pts}</span>;
            } else if (came.has(f.userId)) {
              chip = <span className="chip came">来た</span>;
            } else if (fresh && matchedToday.has(f.userId)) {
              chip = <span className="chip done">獲得済み</span>;
            }
          } else if (left.has(f.userId)) {
            chip = <span className="chip left">帰った</span>;
          }
          const meta = !r ? '未確認' : r.present ? (r.building ? `${r.building}にいます` : 'キャンパスにいます') : 'いません';
          return (
            <div className="friend" key={f.userId}>
              <Avatar userId={f.userId} name={f.displayName} avatar={f.avatar} on={!!r?.present} />
              <div className="fbody">
                <div className="fname">{f.displayName}{f.best === 'best' && <span className="star">ベスト</span>}</div>
                <div className={`fmeta${r?.present ? ' live' : ''}`}>{meta}</div>
              </div>
              {chip}
            </div>
          );
        })}
      </div>

      {liveCount > 0 && <p className="footnote tap-hint">上のスライムを連打すると、そのフレンドに「つんつん」が届きます</p>}
      </Section>

      <div className="sec"><h3>今日の獲得</h3></div>
      <div className="card">
        <div className="pt-head"><span className="pt-label">今日</span><span className="pt-value">{today.total.toLocaleString()}<small>pt</small></span></div>
        {today.items.length
          ? today.items.map((i, n) => <div className="pt-row" key={n}><span>{i.label}</span><span className="n">+{i.pts.toLocaleString()}</span></div>)
          : <div className="pt-empty">キャンパスで「ポイント獲得」を押すと入ります</div>}
        <div className="pt-foot"><span>累計</span><span>{points.total.toLocaleString()} pt</span></div>
      </div>

      <HideCard />
    </>
  );
}
