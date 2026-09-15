// ホーム：在校確認 → フレンドの在校 → 今日の獲得 → かくれんぼ
// （上のフィールドはスクロールさせないので、src/phone/Phone.tsx で置いている）

import { useApp } from '../app/AppContext';
import { HideCard } from './HideCard';
import { Avatar, isToday, when, yen } from './ui';

export function Home() {
  const { me, friends, points, lastCheck: lc, checking, check, openAddSheet } = useApp();
  if (!me || !friends || !points) return null;

  const fresh = !!lc && isToday(lc.checkedAt);
  const present = !!lc?.me.present;
  const today = points.today;

  const kick = lc ? `${when(lc.checkedAt)} に確認` : 'まだ確認していません';
  const title = !lc ? 'キャンパスにいる？' : present ? 'キャンパスにいます' : 'キャンパス外です';
  const sub = !lc ? 'ボタンで、あなたとフレンドの様子を確認' : present ? lc.me.building : 'キャンパスのWiFiにつながっていません';
  const hint = me.hidden
    ? 'かくれんぼ中は来校ポイントだけ入ります（マッチは入りません）'
    : 'キャンパス外でもフレンドの様子は見られます（ポイントはキャンパスでだけ）';

  const results = new Map((lc?.friends ?? []).map((f) => [f.userId, f]));
  const awardedNow = new Map(fresh ? lc!.points.awarded.filter((a) => a.userId).map((a) => [a.userId as string, a]) : []);
  const matchedToday = new Set(today.items.map((i) => i.userId).filter(Boolean));
  const liveCount = friends.friends.filter((f) => results.get(f.userId)?.present).length;
  const rank = (id: string) => { const r = results.get(id); return !r ? 2 : r.present ? 0 : 1; };
  const sorted = [...friends.friends].sort((a, b) => rank(a.userId) - rank(b.userId));

  return (
    <>
      <div className="card check-card">
        <div className="check-head">
          <div className="kick"><span className={`pulse${fresh && present ? ' live' : ''}`} /><span>{kick}</span></div>
          {me.hidden && <span className="hidechip">かくれんぼ中</span>}
        </div>
        <div className="check-title">{title}<span className="check-sub">{sub}</span></div>
        <button className="btn btn-primary btn-check" onClick={() => void check()} disabled={checking}>
          {checking ? '確認しています…' : <>ポイント獲得<span className="btn-sub">（在校確認）</span></>}
        </button>
        <p className="btn-hint">{hint}</p>
      </div>

      <div className="sec"><h3>フレンド</h3><span>{lc ? `${when(lc.checkedAt)} 時点・${liveCount}人がキャンパスに` : '未確認'}</span></div>
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
            } else if (fresh && matchedToday.has(f.userId)) {
              chip = <span className="chip done">獲得済み</span>;
            }
          }
          const meta = !r ? '未確認' : r.present ? (r.building ? `${r.building}にいます` : 'キャンパスにいます') : 'いません';
          return (
            <div className="friend" key={f.userId}>
              <Avatar userId={f.userId} name={f.displayName} on={!!r?.present} />
              <div className="fbody">
                <div className="fname">{f.displayName}{f.best === 'best' && <span className="star">ベスト</span>}</div>
                <div className={`fmeta${r?.present ? ' live' : ''}`}>{meta}</div>
              </div>
              {chip}
            </div>
          );
        })}
      </div>

      <div className="sec"><h3>今日の獲得</h3><span>約{yen(today.total)}円</span></div>
      <div className="card">
        <div className="pt-head"><span className="pt-label">今日</span><span className="pt-value">{today.total.toLocaleString()}<small>pt</small></span></div>
        {today.items.length
          ? today.items.map((i, n) => <div className="pt-row" key={n}><span>{i.label}</span><span className="n">+{i.pts.toLocaleString()}</span></div>)
          : <div className="pt-empty">キャンパスで「ポイント獲得」を押すと入ります</div>}
        <div className="pt-foot"><span>累計</span><span>{points.total.toLocaleString()} pt（約{yen(points.total)}円）</span></div>
      </div>

      <HideCard />
    </>
  );
}
