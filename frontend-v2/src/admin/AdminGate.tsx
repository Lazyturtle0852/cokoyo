// 管理用パスワードの入口。/admin（管理画面）と /explain（説明画面）の前に置く。
//
// 画面を隠すのはここ、データを守るのはバックエンド（/v1/admin/* と /v1/debug/db は
// パスワードで入った Cookie が無いと 401 を返す）。この部品を外しても中身は見えない。

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';

type State = 'checking' | 'locked' | 'open' | 'unavailable';

export function AdminGate({ title, children }: { title: string; children: ReactNode }) {
  const [state, setState] = useState<State>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.adminSession()
      .then((r) => setState(r.admin ? 'open' : 'locked'))
      .catch(() => setState('unavailable'));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.adminLogin(password);
      setPassword('');
      setState('open');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ログインできませんでした');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'open') return <>{children}</>;

  return (
    <div className="gate">
      <form className="panel gate-card" onSubmit={submit}>
        <h2>{title}</h2>
        {state === 'checking' && <p className="desc">確認しています…</p>}
        {state === 'unavailable' && (
          <p className="desc">バックエンドに接続できません。時間をおいて開き直してください。</p>
        )}
        {state === 'locked' && (
          <>
            <p className="desc">運営者用のページです。管理用のパスワードを入力してください。</p>
            <label className="gate-label" htmlFor="admin-password">パスワード</label>
            <input
              id="admin-password" type="password" autoComplete="current-password" autoFocus
              value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }}
            />
            {error && <p className="gate-error" role="alert">{error}</p>}
            <button type="submit" className="gate-submit" disabled={busy || !password}>
              {busy ? '確認中…' : '入る'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
