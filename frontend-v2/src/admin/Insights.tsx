// 分析（/admin/insights/）。どこで離脱しているか・続けて使われているか・いつ使われているか・
// つながりと機能の使われ方を見る。数字は GET /v1/admin/insights（名前・メール・IDは入らない）。
// 「分析用に保存」で、同じ数字をJSONファイルにして秘書（Claude）に渡せる。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { InsightsResponse } from '../api/types';

const fmt = (n: number) => n.toLocaleString('ja-JP');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function Insights() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.adminInsights());
      setError('');
    } catch (e) {
      if ((e as { status?: number }).status === 401) { window.location.reload(); return; }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cokoyo-分析-${data.today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>COKOYO — 分析</h1>
          <p>{data ? `${new Date(data.generatedAt).toLocaleString('ja-JP')} 時点。日付・時刻は日本時間。` : '読み込み中…'}</p>
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={save} disabled={!data}>分析用に保存</button>
          <button type="button" className="ghost" onClick={() => void load()} disabled={loading}>{loading ? '更新中…' : '更新'}</button>
          <a className="ghost ins-link" href="../">管理画面へ</a>
        </div>
      </header>
      {error && <p className="gate-error" role="alert">読めませんでした：{error}</p>}
      {data && <>
        <Summary d={data} />
        <Funnel d={data} />
        <Retention d={data} />
        <Daily d={data} />
        <Heat d={data} />
        <div className="admin-cols">
          <Network d={data} />
          <Features d={data} />
        </div>
        <People d={data} />
      </>}
    </div>
  );
}

function Summary({ d }: { d: InsightsResponse }) {
  const users = d.features.users;
  const from7 = d.daily.slice(-7);
  const active7 = d.people.filter((p) => p.lastActive && p.lastActive >= from7[0]!.date).length;
  const avgDau7 = Math.round(from7.reduce((s, x) => s + x.active, 0) / 7 * 10) / 10;
  const active30 = d.people.filter((p) => p.activeDays30 > 0).length;
  const items: Array<[string, string, string]> = [
    ['登録した人', fmt(users), 'MACアドレスの登録まで終えた人'],
    ['直近7日に開いた人', fmt(active7), `登録した人の ${pct(active7, users)}`],
    ['1日に開く人（7日平均）', String(avgDau7), `直近30日に開いた人（${active30}人）の ${pct(avgDau7, active30)}（毎日どれだけ戻ってくるか）`],
    ['フレンド0人の人', fmt(d.network.zeroFriends), `登録した人の ${pct(d.network.zeroFriends, users)}`],
  ];
  return (
    <div className="ins-kpis">
      {items.map(([label, value, note]) => (
        <div className="stat" key={label}><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-note">{note}</p></div>
      ))}
    </div>
  );
}

// ── どこで離脱しているか ────────────────────────────────────
function Funnel({ d }: { d: InsightsResponse }) {
  const top = d.funnel[0]?.count || 1;
  // 前の段階からいちばん減ったところに印を付ける
  const drops = d.funnel.map((f, i) => (i === 0 ? 0 : (d.funnel[i - 1]!.count - f.count) / (d.funnel[i - 1]!.count || 1)));
  const worst = drops.indexOf(Math.max(...drops));
  return (
    <section className="panel">
      <h2>どこで離脱しているか</h2>
      <p className="desc">上から順に、その段階まで進んだ人数。右の％は「ひとつ前の段階から残った割合」。いちばん減っている段階に印。</p>
      <ol className="ins-funnel">
        {d.funnel.map((f, i) => (
          <li key={f.key} className={i === worst && i > 0 ? 'worst' : ''}>
            <span className="ins-f-label">{f.label}{f.note && <small>{f.note}</small>}</span>
            <span className="ins-f-bar"><i style={{ width: `${(f.count / top) * 100}%` }} /></span>
            <span className="ins-f-num">{fmt(f.count)}人</span>
            <span className="ins-f-pct">{i === 0 ? '' : pct(f.count, d.funnel[i - 1]!.count)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── 続けて使われているか ────────────────────────────────────
function Retention({ d }: { d: InsightsResponse }) {
  const maxWeeks = Math.min(8, Math.max(0, ...d.retention.map((r) => r.weeks.length)));
  return (
    <section className="panel">
      <h2>続けて使われているか（登録した週ごと）</h2>
      <p className="desc">登録した週（月曜はじまり）ごとに、その後の各週にアプリを開いた人の割合。「0週目」は登録した週。色が濃いほど多く残っている。</p>
      {d.retention.length === 0 ? <p className="muted">まだデータがありません</p> : (
        <div className="ins-scroll">
          <table className="ins-cohort">
            <thead><tr><th>登録した週</th><th>人数</th>{Array.from({ length: maxWeeks }, (_, w) => <th key={w}>{w}週目</th>)}</tr></thead>
            <tbody>
              {d.retention.map((r) => (
                <tr key={r.cohort}>
                  <td>{md(r.cohort)}〜</td><td>{r.size}</td>
                  {Array.from({ length: maxWeeks }, (_, w) => {
                    const v = r.weeks[w];
                    if (v === undefined) return <td key={w} className="none" />;
                    const rate = r.size ? v / r.size : 0;
                    return <td key={w} style={{ background: `rgba(234,88,12,${0.08 + rate * 0.8})`, color: rate > 0.5 ? '#fff' : undefined }}
                      title={`${v}人`}>{Math.round(rate * 100)}%</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── いつ使われているか ──────────────────────────────────────
const SERIES: Array<{ key: 'active' | 'visitors' | 'checks' | 'greets' | 'newUsers'; title: string; unit: string }> = [
  { key: 'active', title: 'アプリを開いた人', unit: '人' },
  { key: 'visitors', title: 'キャンパスで確認できた人', unit: '人' },
  { key: 'checks', title: '在校確認を押した回数', unit: '回' },
  { key: 'newUsers', title: '新しく登録した人', unit: '人' },
  { key: 'greets', title: 'YO！の回数', unit: '回' },
];

function Daily({ d }: { d: InsightsResponse }) {
  return (
    <section className="panel">
      <h2>日ごとの推移（直近30日）</h2>
      <p className="desc">在校確認の回数・YO！の回数は、記録を始めた日（{d.checkLogSince ? md(d.checkLogSince) : 'これから'}）から。</p>
      <div className="ins-minis">
        {SERIES.map((s) => {
          const vals = d.daily.map((x) => x[s.key]);
          const max = Math.max(1, ...vals);
          const total = vals.reduce((a, b) => a + b, 0);
          return (
            <div className="ins-mini" key={s.key}>
              <p className="stat-label">{s.title}<span className="muted">　30日で {fmt(total)}{s.unit}・最大 {fmt(max === 1 && total === 0 ? 0 : max)}{s.unit}</span></p>
              <div className="ins-bars" role="img" aria-label={`${s.title}の日ごとの推移`}>
                {d.daily.map((x) => (
                  <i key={x.date} className={[0, 6].includes(new Date(`${x.date}T00:00:00Z`).getUTCDay()) ? 'we' : ''}
                    style={{ height: `${(x[s.key] / max) * 100}%` }} title={`${md(x.date)}：${x[s.key]}${s.unit}`} />
                ))}
              </div>
              <div className="ins-axis"><span>{md(d.daily[0]!.date)}</span><span>{md(d.daily.at(-1)!.date)}</span></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Heat({ d }: { d: InsightsResponse }) {
  // 押した回数の記録が1週間に満たないうちは、全期間ある「はじめて確認できた時刻」を先に見せる
  const weekOfChecks = !!d.checkLogSince && Date.parse(d.today) - Date.parse(d.checkLogSince) >= 7 * 86400000;
  const [mode, setMode] = useState<'checks' | 'firstVisits'>(weekOfChecks ? 'checks' : 'firstVisits');
  const grid = d.heat[mode];
  const max = Math.max(1, ...grid.flat());
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => h >= 6); // 夜中は省く
  return (
    <section className="panel">
      <h2>曜日と時間帯</h2>
      <div className="seg ins-seg" role="tablist">
        <button role="tab" className={mode === 'checks' ? 'on' : ''} aria-selected={mode === 'checks'} onClick={() => setMode('checks')}>在校確認を押した回数</button>
        <button role="tab" className={mode === 'firstVisits' ? 'on' : ''} aria-selected={mode === 'firstVisits'} onClick={() => setMode('firstVisits')}>その日はじめてキャンパスで確認できた時刻</button>
      </div>
      <p className="desc">{mode === 'checks' ? '押した回数を、曜日×時間（6時〜23時）で数えたもの。記録を始めてからの分。' : 'その日はじめて「キャンパスにいる」と判定された時刻。これまでの全期間。'}</p>
      <div className="ins-scroll">
        <table className="ins-heat">
          <thead><tr><th />{hours.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
              <tr key={wd}><th>{WD[wd]}</th>{hours.map((h) => {
                const v = grid[wd]![h]!;
                return <td key={h} style={{ background: v ? `rgba(234,88,12,${0.12 + (v / max) * 0.88})` : undefined }} title={`${WD[wd]} ${h}時：${v}`}>{v || ''}</td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── つながりと機能 ──────────────────────────────────────────
function Network({ d }: { d: InsightsResponse }) {
  const n = d.network;
  const max = Math.max(1, ...n.histogram.map((b) => b.users));
  return (
    <section className="panel">
      <h2>つながり</h2>
      <p className="desc">登録した人 {n.users}人のフレンド数。平均 {n.avgFriends}人。</p>
      <ul className="hbars">
        {n.histogram.map((b) => (
          <li key={b.label}><span className="hbar-label">{b.label}</span>
            <span className="hbar-track ins-track"><i style={{ width: `${(b.users / max) * 100}%` }} /></span><span>{b.users}人</span></li>
        ))}
      </ul>
      <dl className="ins-dl">
        <div><dt>フレンドの組</dt><dd>{fmt(n.friendPairs)}</dd></div>
        <div><dt>ベストフレンドの組</dt><dd>{fmt(n.bestPairs)}（フレンドの {pct(n.bestPairs, n.friendPairs)}）</dd></div>
        <div><dt>承認待ちの申請</dt><dd>{fmt(n.pendingRequests)}</dd></div>
        <div><dt>申請が成立した割合</dt><dd>{n.acceptRate === null ? '—' : `${Math.round(n.acceptRate * 100)}%`}</dd></div>
        <div><dt>直近7日のマッチ（同じ日にいたフレンドの組）</dt><dd>{fmt(n.matches7d)}</dd></div>
      </dl>
    </section>
  );
}

function Features({ d }: { d: InsightsResponse }) {
  const f = d.features;
  const rows: Array<[string, number, boolean]> = [
    ['通知をオンにしている', f.pushUsers, true], ['スライムの色を選んだ', f.colorUsers, true],
    ['かくれんぼ中', f.hiddenUsers, true], ['「知り合いかも」をオフ', f.notDiscoverableUsers, true],
    ['YO！（直近7日・回）', f.greets7d, false], ['つんつん（直近7日・回）', f.reactions7d, false],
  ];
  return (
    <section className="panel">
      <h2>機能の使われ方</h2>
      <p className="desc">人数は、登録した {f.users}人のうち。YO！・つんつんは記録を始めてからの回数。</p>
      <dl className="ins-dl">
        {rows.map(([label, v, ofUsers]) => <div key={label}><dt>{label}</dt><dd>{fmt(v)}{ofUsers ? `人（${pct(v, f.users)}）` : '回'}</dd></div>)}
      </dl>
    </section>
  );
}

// ── 1人ずつ（名前は出さない） ─────────────────────────────────
type SortKey = 'n' | 'friends' | 'visitDays' | 'activeDays30' | 'lastActive';
function People({ d }: { d: InsightsResponse }) {
  const [sort, setSort] = useState<SortKey>('n');
  const rows = useMemo(() => [...d.people].sort((a, b) => (sort === 'n' ? a.n - b.n
    : sort === 'lastActive' ? String(b.lastActive ?? '').localeCompare(String(a.lastActive ?? '')) : (b[sort] as number) - (a[sort] as number))), [d.people, sort]);
  return (
    <section className="panel">
      <h2>1人ずつ（{d.people.length}人・名前は出しません）</h2>
      <p className="desc">番号は登録した順。直近30日の数字。</p>
      <label className="muted">並び{' '}
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="n">登録した順</option><option value="friends">フレンドが多い順</option><option value="visitDays">来校日数が多い順</option>
          <option value="activeDays30">開いた日数が多い順</option><option value="lastActive">最近開いた順</option>
        </select>
      </label>
      <div className="ins-scroll">
        <table className="ins-people">
          <thead><tr><th>番号</th><th>ログイン日</th><th>登録</th><th>フレンド</th><th>来校日数（全期間）</th><th>来校日数（30日）</th><th>開いた日数（30日）</th><th>在校確認（30日）</th><th>最後に開いた日</th><th>通知</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.n} className={p.onboarded ? '' : 'muted'}>
                <td>{p.n}</td><td>{md(p.signedUp)}</td><td>{p.onboarded ? '済' : '途中'}</td><td>{p.friends}</td><td>{p.visitDays}</td>
                <td>{p.visitDays30}</td><td>{p.activeDays30}</td><td>{p.checks30}</td><td>{p.lastActive ? md(p.lastActive) : '—'}</td><td>{p.push ? 'オン' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
