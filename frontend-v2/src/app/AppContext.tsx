// アプリ全体の状態と操作
//
// 画面（src/phone/*）は useApp() でここから状態と操作を受け取る。
// バックエンドとのやりとりは src/api/client.ts の api.* を通す。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, callLog, device } from '../api/client';
import { mockBackend } from '../api/mockBackend';
import type { CheckResponse, FriendsResponse, Me, PointsResponse } from '../api/types';
import { useMockBackend } from '../config';
import { createCampusField, type CampusField } from '../field/campusField';
import { clearPendingInvite, pendingInvite, takeInviteFromUrl } from './invite';

export type View = 'loading' | 'onboarding' | 'app' | 'error';
export type Tab = 'home' | 'friends' | 'settings';
export type AddMode = 'show' | 'scan';

/** 右上の累計ポイント（src/phone/TotalPoints.tsx）が登録する操作 */
export interface CounterHandle {
  animate(from: number, to: number): void;
  pop(text: string): void;
}

interface AppState {
  view: View;
  error: string;
  tab: Tab;
  me: Me | null;
  friends: FriendsResponse | null;
  points: PointsResponse | null;
  lastCheck: CheckResponse | null;
  checking: boolean;
  /** はじめての登録か、MACアドレスの登録し直しか */
  onboardingMode: 'new' | 'reregister';
  sheet: { open: boolean; mode: AddMode };
  /** キャンパスの地図をひらいているか */
  mapOpen: boolean;
  /** ポイント加算の演出中に、右上に出している累計 */
  displayTotal: number | null;
  toast: { id: number; message: string } | null;
}

interface AppActions {
  field: CampusField;
  counter: React.MutableRefObject<CounterHandle | null>;
  screenRef: React.RefObject<HTMLDivElement | null>;

  setTab(tab: Tab): void;
  openAddSheet(mode?: AddMode): void;
  closeSheet(): void;
  openMap(): void;
  closeMap(): void;
  setAddMode(mode: AddMode): void;
  showToast(message: string): void;

  /** バックエンドを呼ぶ操作を包む。失敗したらメッセージを出す。成功したら true */
  run(name: string, fn: () => Promise<void>): Promise<boolean>;
  check(): Promise<void>;
  toggleHide(): Promise<void>;
  reloadFriends(): Promise<void>;
  setMe(me: Me): void;

  // 登録
  completeRegistration(): Promise<void>;
  finishOnboarding(tab: Tab): void;
  startReregister(): void;
  cancelReregister(): void;

  // デモ操作から使う
  refresh(): Promise<void>;
  restart(): Promise<void>;
  restartFromOnboarding(): void;
}

type Ctx = AppState & AppActions;
const AppContext = createContext<Ctx | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp は AppProvider の中で使ってください');
  return ctx;
}

const LASTCHECK_KEY = (uid: string) => `cokoyo-lastcheck:v1:${uid}`;
const readLastCheck = (uid: string): CheckResponse | null => {
  try { const s = localStorage.getItem(LASTCHECK_KEY(uid)); return s ? (JSON.parse(s) as CheckResponse) : null; } catch { return null; }
};
const writeLastCheck = (uid: string, v: CheckResponse) => {
  try { localStorage.setItem(LASTCHECK_KEY(uid), JSON.stringify(v)); } catch { /* 保存できない環境 */ }
};

// 招待リンクで開かれたなら、URLからキーを預かる（表示の前に一度だけ）
takeInviteFromUrl();

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('loading');
  const [error, setError] = useState('');
  const [tab, setTabState] = useState<Tab>('home');
  const [me, setMe] = useState<Me | null>(null);
  const [friends, setFriends] = useState<FriendsResponse | null>(null);
  const [points, setPoints] = useState<PointsResponse | null>(null);
  const [lastCheck, setLastCheck] = useState<CheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [onboardingMode, setOnboardingMode] = useState<'new' | 'reregister'>('new');
  const [sheet, setSheet] = useState<{ open: boolean; mode: AddMode }>({ open: false, mode: 'show' });
  const [mapOpen, setMapOpen] = useState(false);
  const [displayTotal, setDisplayTotal] = useState<number | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const busy = useRef(false);
  const fieldRef = useRef<CampusField | null>(null);
  if (!fieldRef.current) fieldRef.current = createCampusField();
  const field = fieldRef.current;
  const counter = useRef<CounterHandle | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const friendsRef = useRef(friends);
  friendsRef.current = friends;
  const timers = useRef<number[]>([]);

  const showToast = useCallback((message: string) => setToast({ id: Date.now() + Math.random(), message }), []);

  const loadAll = useCallback(async () => {
    const [m, f, p] = await Promise.all([api.getMe(), api.getFriends(), api.getPoints()]);
    setMe(m); setFriends(f); setPoints(p);
    setLastCheck(readLastCheck(m.userId));
  }, []);

  const goOnboarding = useCallback(() => {
    field.clear();
    setDisplayTotal(null);
    setSheet({ open: false, mode: 'show' });
    setMapOpen(false);
    setOnboardingMode('new');
    setView('onboarding');
  }, [field]);

  const boot = useCallback(async () => {
    // 模擬バックエンドでは、はじめて開いたときは登録済みのサンプル（ゆうき）から始める
    if (useMockBackend && device.untouched) device.set(mockBackend.sim.demoToken);
    if (!device.token) { goOnboarding(); return; }
    callLog.begin('アプリを開いた');
    try {
      await loadAll();
      setView('app');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) { device.clear(); goOnboarding(); }
      else { setError(err.message); setView('error'); }
    }
  }, [goOnboarding, loadAll]);

  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void boot();
  }, [boot]);

  const run = useCallback(async (name: string, fn: () => Promise<void>) => {
    if (busy.current) return false;
    busy.current = true;
    callLog.begin(name);
    try {
      await fn();
      return true;
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) { device.clear(); goOnboarding(); }
      showToast(err.message);
      return false;
    } finally {
      busy.current = false;
    }
  }, [goOnboarding, showToast]);

  const reloadFriends = useCallback(async () => { setFriends(await api.getFriends()); }, []);

  // ---------------------------------------------------------------
  // 招待リンク（?add=<共有キー>）で開かれたとき
  //
  // 登録ずみならそのまま申請する。まだなら invite.ts が預かっているので、
  // 登録が終わってアプリの画面に入った時点でここに来る。
  // ---------------------------------------------------------------
  const inviting = useRef(false);
  useEffect(() => {
    if (view !== 'app' || !me || inviting.current) return;
    const shareKey = pendingInvite();
    if (!shareKey) return;
    inviting.current = true;

    if (shareKey === me.shareKey) {
      clearPendingInvite();
      showToast('これはあなた自身の招待リンクです');
      return;
    }

    void run('招待リンクからフレンド申請', async () => {
      // 断られた場合（すでにフレンド・ブロック中など）も預かったキーは捨てる。
      // 残すと画面を開くたびに同じ申請を繰り返すことになる。
      try {
        const r = await api.addFriend(shareKey, 'link');
        await reloadFriends();
        setTabState('friends');
        showToast(r.status === 'friends'
          ? `${r.user.displayName}さんとフレンドになりました`
          : `${r.user.displayName}さんに申請しました。相手が承認するとフレンドになります`);
      } finally {
        clearPendingInvite();
      }
    }).then((ok) => {
      // ほかの操作の最中で run が動かなかったときは、次の機会にやり直す
      if (!ok && pendingInvite()) inviting.current = false;
    });
  }, [view, me, run, reloadFriends, showToast]);

  // ---------------------------------------------------------------
  // 在校確認のあとの演出：スライムが現れ、ポイントが1つずつ累計に足される
  // ---------------------------------------------------------------
  const celebrate = useCallback((r: CheckResponse, before: number) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

    const list = friendsRef.current?.friends ?? [];
    const present = r.friends.filter((f) => f.present)
      .map((f) => ({ userId: f.userId, name: list.find((x) => x.userId === f.userId)?.displayName ?? '' }));
    const landed = field.sync(present, { present: r.me.present, ghost: r.me.hidden });
    const items = r.points.awarded;

    if (!items.length) {
      setDisplayTotal(null);
      later(Math.min(landed, 400), () => showToast(r.points.notice ?? '今の分は獲得済みです'));
      return;
    }
    if (r.points.notice) later(landed + items.length * 460 + 300, () => showToast(r.points.notice as string));

    let shown = before;
    items.forEach((it, i) => later(landed + i * 460, () => {
      const text = `+${it.pts.toLocaleString()}pt`;
      if (!(it.userId && field.pop(it.userId, text))) counter.current?.pop(text);
      const from = shown;
      shown += it.pts;
      counter.current?.animate(from, shown);
      setDisplayTotal(shown);
      if (i === items.length - 1) later(420, () => setDisplayTotal(null));
    }));
  }, [field, showToast]);

  const check = useCallback(async () => {
    if (busy.current || !points || !me) return;
    const before = points.total;
    const box: { result?: CheckResponse } = {};
    setChecking(true);
    await run('ポイント獲得（在校確認）', async () => {
      try {
        const r = await api.check();
        box.result = r;
        writeLastCheck(me.userId, r);
        setLastCheck(r);
        setPoints({ date: r.points.date, today: r.points.today, total: r.points.total });
        setMe((m) => (m ? { ...m, hidden: r.me.hidden } : m));
        if (r.points.awarded.length) setDisplayTotal(before); // 演出で少しずつ足すので、いったん前の値のまま出す
      } finally {
        setChecking(false);
      }
    });
    if (box.result) celebrate(box.result, before);
  }, [celebrate, me, points, run]);

  const toggleHide = useCallback(async () => {
    if (!me) return;
    await run('かくれんぼを切り替え', async () => {
      const m = await api.updateMe({ hidden: !me.hidden });
      setMe(m);
      field.setGhost(m.hidden); // 自分のスライムがいれば、おばけに変わる／戻る
      showToast(m.hidden ? 'かくれんぼをオンにしました' : 'かくれんぼをオフにしました');
    });
  }, [field, me, run, showToast]);

  const refresh = useCallback(async () => {
    if (view !== 'app') return;
    try { await loadAll(); } catch { /* 次の操作で表示する */ }
  }, [loadAll, view]);

  const restart = useCallback(async () => {
    timers.current.forEach(clearTimeout);
    field.clear();
    setDisplayTotal(null);
    setSheet({ open: false, mode: 'show' });
    setMapOpen(false);
    setTabState('home');
    setView('loading');
    await boot();
  }, [boot, field]);

  const value = useMemo<Ctx>(() => ({
    view, error, tab, me, friends, points, lastCheck, checking, onboardingMode, sheet, mapOpen, displayTotal, toast,
    field, counter, screenRef,
    // タブを移ると地図は閉じる
    setTab: (t) => { setMapOpen(false); setTabState(t); },
    openAddSheet: (mode = 'show') => setSheet({ open: true, mode }),
    closeSheet: () => setSheet((s) => ({ ...s, open: false })),
    setAddMode: (mode) => setSheet((s) => ({ ...s, mode })),
    openMap: () => setMapOpen(true),
    closeMap: () => setMapOpen(false),
    showToast,
    run,
    check,
    toggleHide,
    reloadFriends,
    setMe: (m) => setMe(m),
    completeRegistration: loadAll,
    finishOnboarding: (t) => {
      setView('app');
      setTabState(t);
      if (t === 'friends') setSheet({ open: true, mode: 'show' });
    },
    startReregister: () => { setOnboardingMode('reregister'); setView('onboarding'); },
    cancelReregister: () => setView('app'),
    refresh,
    restart,
    restartFromOnboarding: () => { device.clear(); setTabState('home'); goOnboarding(); },
  }), [view, error, tab, me, friends, points, lastCheck, checking, onboardingMode, sheet, mapOpen, displayTotal, toast,
    field, showToast, run, check, toggleHide, reloadFriends, loadAll, refresh, restart, goOnboarding]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
