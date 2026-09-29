// 管理画面（/admin）。利用者数・アクセス数・DBの中身を、運営者だけが見る。
//
// 数字は GET /v1/admin/stats、表は GET /v1/admin/db。どちらも管理用パスワードで入っていないと 401。
// アクセス数は「API を呼んだ回数」。ページを開いただけの回数（静的ファイル）は数えていない。

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { AdminStatsResponse, DbTable } from '../api/types';
import { DbTables } from '../demo/DbPanel';

type Daily = AdminStatsResponse['daily'][number];

const fmt = (n: number) => n.toLocaleString('ja-JP');
const md = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function Dashboard() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [tables, setTables] = useState<DbTable[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, db] = await Promise.all([api.adminStats(), api.adminDb()]);
      setStats(s);
      setTables(db.tables);
      setError('');
    } catch (e) {
      // 期限切れ（12時間）なら入口からやり直す
      if ((e as { status?: number }).status === 401) { window.location.reload(); return; }
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const logout = async () => {
    await api.adminLogout().catch(() => undefined);
    window.location.reload();
  };

  return (
    <div className="admin">
      <header className="admin-head">
        <div>
          <h1>COKOYO（仮称）— 管理画面</h1>
          <p>{stats ? `${dateTime(stats.generatedAt)} 時点。日付は日本時間。` : '読み込み中…'}</p>
        </div>
        <div className="row">
          <button type="button" className="ghost" onClick={() => void load()} disabled={loading}>
            {loading ? '更新中…' : '更新'}
          </button>
          <button type="button" className="ghost" onClick={() => void logout()}>ログアウト</button>
        </div>
      </header>

      {error && <p className="gate-error" role="alert">読めませんでした：{error}</p>}

      {stats && (
        <>
          <Kpis stats={stats} />
          <DailyCharts daily={stats.daily} />
          <div className="admin-cols">
            <Routes routes={stats.routes} />
            <Feedback items={stats.feedback} />
          </div>
          <Users users={stats.users} />
        </>
      )}

      {tables && (
        <section className="panel">
          <h2>DBの中身</h2>
          <p className="desc">
            全テーブル・全行。/explain とちがってメールと問い合わせも出します。
            Google の識別子、認証情報、MAC アドレスの全体、共有キーは出しません。
          </p>
          <details className="admin-db">
            <summary>テーブルを開く（{tables.length}個）</summary>
            <DbTables tables={tables} />
          </details>
        </section>
      )}
    </div>
  );
}

// ── いちばん上の数字 ──────────────────────────────────────────
function Kpis({ stats }: { stats: AdminStatsResponse }) {
  const { totals: t, active } = stats;
  const today = stats.daily.at(-1);
  const sub: Array<[string, number]> = [
    ['登録途中', t.onboarding],
    ['フレンド', t.friendships],
    ['ベストフレンド', t.bestFriends],
    ['申請待ち', t.pendingRequests],
    ['登録端末', t.macs],
    ['かくれんぼ中', t.hidden],
    ['ブロック', t.blocks],
    ['ご意見', t.feedback],
    ['配ったポイント', t.points],
  ];
  return (
    <section className="panel">
      <div className="kpis">
        <Stat label="利用者数" value={t.users} note="初回登録まで終えた人" hero />
        <Stat label="今日使った人" value={active.today} note={`API 呼び出し ${fmt(today?.hits ?? 0)} 回`} />
        <Stat label="直近7日" value={active.week} note="1回でも使った人" />
        <Stat label="直近30日" value={active.month} note="1回でも使った人" />
        <Stat label="今日来校" value={today?.visitors ?? 0} note="在校と判定された人" />
      </div>
      <dl className="kpi-sub">
        {sub.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{fmt(v)}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function Stat({ label, value, note, hero = false }: { label: string; value: number; note: string; hero?: boolean }) {
  return (
    <div className={hero ? 'stat hero' : 'stat'}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{fmt(value)}</p>
      <p className="stat-note">{note}</p>
    </div>
  );
}

// ── 日ごとの推移 ──────────────────────────────────────────────
// 単位も大きさも違う4つを1つの軸に重ねず、同じ形の小さなグラフを4つ並べる。
const SERIES: Array<{ key: keyof Omit<Daily, 'date'>; title: string; unit: string }> = [
  { key: 'activeUsers', title: '使った人', unit: '人' },
  { key: 'hits', title: 'API 呼び出し', unit: '回' },
  { key: 'signups', title: '新しく Google ログインした人', unit: '人' },
  { key: 'visitors', title: '来校した人', unit: '人' },
];

function DailyCharts({ daily }: { daily: Daily[] }) {
  return (
    <section className="panel">
      <h2>日ごとの推移（直近{daily.length}日）</h2>
      <p className="desc">
        API 呼び出しには、ログインしていない呼び出しも入ります（棒にかざすと内訳）。ページを開いただけでは数えません。
      </p>
      <div className="charts">
        {SERIES.map((s) => <BarChart key={s.key} daily={daily} field={s.key} title={s.title} unit={s.unit} />)}
      </div>
      <details className="admin-table-view">
        <summary>表で見る</summary>
        <div className="simwrap">
          <table className="sim dbt-table">
            <thead>
              <tr><th>日付</th>{SERIES.map((s) => <th key={s.key}>{s.title}</th>)}<th>うち未ログイン</th></tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  {SERIES.map((s) => <td key={s.key} className="num">{fmt(d[s.key])}</td>)}
                  <td className="num">{fmt(d.anonHits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

const W = 300;
const H = 110;
const PAD = { top: 8, bottom: 18 };

function BarChart({ daily, field, title, unit }: {
  daily: Daily[]; field: keyof Omit<Daily, 'date'>; title: string; unit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = daily.map((d) => d[field]);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const slot = W / daily.length;
  const bw = Math.max(2, slot - 2); // 棒と棒のあいだに 2px
  const plotH = H - PAD.top - PAD.bottom;
  const baseY = H - PAD.bottom;
  const hovered = hover === null ? null : daily[hover];

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        <span className="chart-total">30日計 {fmt(total)}{unit}・最大 {fmt(max)}{unit}</span>
      </figcaption>
      <div className="chart-body">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}の日ごとの推移`} onMouseLeave={() => setHover(null)}>
          <line x1={0} x2={W} y1={PAD.top} y2={PAD.top} className="grid" />
          <line x1={0} x2={W} y1={PAD.top + plotH / 2} y2={PAD.top + plotH / 2} className="grid" />
          {daily.map((d, i) => {
            const h = (d[field] / max) * plotH;
            const x = i * slot + (slot - bw) / 2;
            return (
              <g key={d.date}>
                {h > 0 && <path d={bar(x, baseY, bw, h)} className={hover === i ? 'bar on' : 'bar'} />}
                {/* 棒より大きい当たり判定 */}
                <rect x={i * slot} y={0} width={slot} height={H} fill="transparent"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={0} x2={W} y1={baseY} y2={baseY} className="axis" />
          <text x={0} y={H - 4} className="tick">{md(daily[0]?.date ?? '')}</text>
          <text x={W} y={H - 4} className="tick" textAnchor="end">{md(daily.at(-1)?.date ?? '')}</text>
        </svg>
        {hovered && hover !== null && (
          <div className="tip" style={{ left: `${((hover + 0.5) / daily.length) * 100}%` }}>
            <b>{md(hovered.date)}</b> {fmt(hovered[field])}{unit}
            {field === 'hits' && <span className="tip-sub">うち未ログイン {fmt(hovered.anonHits)}</span>}
          </div>
        )}
      </div>
    </figure>
  );
}

/** 上の角だけ丸めた棒（下は基準線にそろえて角のまま） */
function bar(x: number, base: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  const top = base - h;
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`;
}

// ── ルートごとの回数 ──────────────────────────────────────────
function Routes({ routes }: { routes: AdminStatsResponse['routes'] }) {
  const max = Math.max(1, ...routes.map((r) => r.hits));
  return (
    <section className="panel">
      <h2>よく呼ばれている API（直近7日）</h2>
      <p className="desc">どの機能が使われているかの目安。URL の中の値は入れずに、ルートの形で数えています。</p>
      {routes.length === 0 && <p className="empty">まだありません。</p>}
      <ul className="hbars">
        {routes.map((r) => (
          <li key={`${r.method} ${r.route}`}>
            <span className="hbar-label mono">
              <span className="verb">{r.method}</span> {r.route.replace(/^\/api/, '')}
            </span>
            <span className="hbar-track"><span className="hbar" style={{ width: `${(r.hits / max) * 100}%` }} /></span>
            <span className="hbar-value">{fmt(r.hits)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── ご意見 ────────────────────────────────────────────────────
function Feedback({ items }: { items: AdminStatsResponse['feedback'] }) {
  return (
    <section className="panel">
      <h2>ご意見・問い合わせ（{items.length}件）</h2>
      <p className="desc">アプリの中から届いたもの。新しい順。</p>
      {items.length === 0 && <p className="empty">まだありません。</p>}
      <ul className="feedback-list">
        {items.map((f) => (
          <li key={f.id}>
            <p className="fb-meta">
              <b>{f.displayName || '（名前なし）'}</b>
              <a href={`mailto:${f.email}`} className="mono">{f.email}</a>
              <span>{dateTime(f.createdAt)}</span>
            </p>
            <p className="fb-body">{f.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── 利用者一覧 ────────────────────────────────────────────────
type SortKey = 'lastSeen' | 'createdAt' | 'recentHits' | 'points' | 'friends' | 'visitDays';
const SORTS: Array<[SortKey, string]> = [
  ['lastSeen', '最後に使った日'], ['createdAt', '登録日'], ['recentHits', '30日の呼び出し'],
  ['points', 'ポイント'], ['friends', 'フレンド'], ['visitDays', '来校日数'],
];

function Users({ users }: { users: AdminStatsResponse['users'] }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('lastSeen');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => !q || `${u.displayName} ${u.email} ${u.userId}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const x = a[sort] ?? '';
        const y = b[sort] ?? '';
        return x < y ? 1 : x > y ? -1 : 0;
      });
  }, [users, query, sort]);

  return (
    <section className="panel">
      <h2>利用者（{users.length}人）</h2>
      <p className="desc">Google ログインをした人全員。登録途中の人も含みます。</p>
      <div className="row admin-filter">
        <input type="search" placeholder="名前・メール・ID で絞る" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="muted">並び
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="simwrap">
        <table className="sim dbt-table admin-users">
          <thead>
            <tr>
              <th>表示名</th><th>メール</th><th>状態</th><th>登録</th><th>最後に使った日</th>
              <th>30日の呼び出し</th><th>端末</th><th>フレンド</th><th>来校日数</th><th>ポイント</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.userId}>
                <td title={u.userId}>{u.displayName || <span className="muted">（未設定）</span>}</td>
                <td>{u.email}</td>
                <td>
                  {!u.onboarded && <span className="rel">登録途中</span>}
                  {u.hidden && <span className="rel">かくれんぼ</span>}
                </td>
                <td>{u.createdAt.slice(0, 10)}</td>
                <td>{u.lastSeen ?? <span className="muted">—</span>}</td>
                <td className="num">{fmt(u.recentHits)}</td>
                <td className="num">{u.macs}</td>
                <td className="num">{u.friends}</td>
                <td className="num">{u.visitDays}</td>
                <td className="num">{fmt(u.points)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={10} className="muted">該当する人はいません</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
