// アプリ全体の状態と操作
//
// 画面（src/phone/*）は useApp() でここから状態と操作を受け取る。
// バックエンドとのやりとりは src/api/client.ts の api.* を通す。

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError, callLog } from '../api/client';
import type { CheckResponse, FriendsResponse, InviteResponse, Me, PointsResponse } from '../api/types';
import { createCampusField, type CampusField } from '../field/campusField';
import { clearPendingInvite, pendingInvite, takeInviteFromUrl } from './invite';
import { isToday } from '../phone/ui';

export type View = 'loading' | 'login' | 'onboarding' | 'app' | 'error';
export type Tab = 'home' | 'friends' | 'settings';
/** show: 自分のQR  scan: 相手のQRを読む（どちらも「QR」タブ）  link: リンクで共有 */
export type AddMode = 'show' | 'scan' | 'link';

/** 右上の累計ポイント（src/phone/TotalPoints.tsx）が登録する操作 */
export interface CounterHandle {
  animate(from: number, to: number): void;
  pop(text: string): void;
}

interface AppState {
  view: View;
  initialDisplayName: string;
  error: string;
  tab: Tab;
  me: Me | null;
  friends: FriendsResponse | null;
  points: PointsResponse | null;
  lastCheck: CheckResponse | null;
  checking: boolean;
  sheet: { open: boolean; mode: AddMode };
  /** キャンパスの地図をひらいているか */
  mapOpen: boolean;
  /** ポイント加算の演出中に、右上に出している累計 */
  displayTotal: number | null;
  toast: { id: number; message: string } | null;
  /** 招待リンク・QRで開かれたときの相手。申請するかを確かめているあいだだけ入る */
  invite: { shareKey: string; user: InviteResponse['user']; incoming: boolean } | null;
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
  /** auto: 裏で取り直すとき。押したときと同じ結果を受け取るが、失敗や「獲得済み」は黙っておく */
  check(auto?: boolean): Promise<void>;
  toggleHide(): Promise<void>;
  reloadFriends(silent?: boolean): Promise<void>;
  setMe(me: Me): void;
  /** 招待の相手に申請する（相手から申請が来ていれば、その場でフレンドになる） */
  acceptInvite(): Promise<void>;
  dismissInvite(): void;

  // 登録
  completeRegistration(): Promise<void>;
  finishOnboarding(tab: Tab): void;

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

const LASTCHECK_KEY = (uid: string) => `cokoyo-lastcheck:v2:${uid}`;
const readLastCheck = (uid: string): CheckResponse | null => {
  try { const s = localStorage.getItem(LASTCHECK_KEY(uid)); return s ? (JSON.parse(s) as CheckResponse) : null; } catch { return null; }
};
const writeLastCheck = (uid: string, v: CheckResponse) => {
  try { localStorage.setItem(LASTCHECK_KEY(uid), JSON.stringify(v)); } catch { /* 保存できない環境 */ }
};

/** 「佐藤さん・田中さんから」のように、名前を並べる */
const names = (list: string[]) => (list.length > 2 ? `${list.slice(0, 2).join('さん・')}さんほか${list.length - 2}人` : `${list.join('さん・')}さん`);

/** 今日確認ずみなら、開いているあいだこの間隔で取り直す */
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** 前の確認からこれより短ければ、開き直しても取り直さない（戻るたびに叩かない） */
const AUTO_CHECK_MIN_GAP_MS = 60 * 1000;

// 招待リンクで開かれたなら、URLからキーを預かる（表示の前に一度だけ）
takeInviteFromUrl();

export function AppProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('loading');
  const [initialDisplayName, setInitialDisplayName] = useState('');
  const [error, setError] = useState('');
  const [tab, setTabState] = useState<Tab>('home');
  const [me, setMe] = useState<Me | null>(null);
  const [friends, setFriends] = useState<FriendsResponse | null>(null);
  const [points, setPoints] = useState<PointsResponse | null>(null);
  const [lastCheck, setLastCheck] = useState<CheckResponse | null>(null);
  const [checking, setChecking] = useState(false);
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

  const loadAll = useCallback(async (silent = false) => {
    const [m, f, p] = await Promise.all([api.getMe(silent), api.getFriends(silent), api.getPoints(silent)]);
    setMe(m); setFriends(f); setPoints(p);
    const saved = readLastCheck(m.userId);
    setLastCheck(saved);
    // 前に確認したときが雨なら、開いた時点から降らせておく
    if (saved && isToday(saved.checkedAt)) field.setRain(saved.weather.rainy);
  }, [field]);

  const goOnboarding = useCallback(() => {
    field.clear();
    setDisplayTotal(null);
    setSheet({ open: false, mode: 'show' });
    setMapOpen(false);
    setView('onboarding');
  }, [field]);

  const goLogin = useCallback(() => {
    setMe(null); setFriends(null); setPoints(null); setLastCheck(null);
    field.clear();
    setInitialDisplayName('');
    setView('login');
  }, [field]);

  const boot = useCallback(async () => {
    callLog.begin('アプリを開いた');
    try {
      const session = await api.getSession();
      if (session.status === 'onboarding') { setInitialDisplayName(session.displayName ?? ''); goOnboarding(); return; }
      await loadAll();
      setView('app');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) goLogin();
      else { setError(err.message); setView('error'); }
    }
  }, [goLogin, goOnboarding, loadAll]);

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
      if (err.status === 401) goLogin();
      showToast(err.message);
      return false;
    } finally {
      busy.current = false;
    }
  }, [goLogin, showToast]);

  const reloadFriends = useCallback(async (silent = false) => { setFriends(await api.getFriends(silent)); }, []);

  // ---------------------------------------------------------------
  // 招待リンク（?add=<共有キー>）で開かれたとき
  //
  // 登録ずみならすぐ、まだなら invite.ts が預かっているので、登録が終わって
  // アプリの画面に入った時点でここに来る。
  // 黙って申請はしない。相手の名前を出して「申請しますか？」と確かめる
  // （ストーリーズのQRなどは知らない人の手にも渡るので、本人が選べるようにする）。
  // ---------------------------------------------------------------
  const [invite, setInvite] = useState<AppState['invite']>(null);
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

    void (async () => {
      try {
        const r = await api.getInvite(shareKey);
        if (r.relation === 'none' || r.relation === 'incoming') {
          setInvite({ shareKey, user: r.user, incoming: r.relation === 'incoming' });
          return; // 預かったキーは、答えを聞いてから捨てる
        }
        showToast(r.relation === 'friends'
          ? `${r.user.displayName}さんとは、すでにフレンドです`
          : `${r.user.displayName}さんには申請ずみです。相手の承認を待っています`);
      } catch (e) {
        showToast(e instanceof ApiError ? e.message : '招待の相手を確かめられませんでした');
      }
      clearPendingInvite();
    })();
  }, [view, me, showToast]);

  const acceptInvite = useCallback(async () => {
    const target = invite;
    if (!target) return;
    await run('招待の相手にフレンド申請', async () => {
      const r = await api.addFriend(target.shareKey, 'link');
      await reloadFriends();
      setTabState('friends');
      showToast(r.status === 'friends'
        ? `${r.user.displayName}さんとフレンドになりました`
        : `${r.user.displayName}さんに申請しました。相手が承認するとフレンドになります`);
    });
    // 失敗しても（すでにフレンド・ブロック中など）同じ確認を出し続けないよう、預かりは捨てる
    clearPendingInvite();
    setInvite(null);
  }, [invite, run, reloadFriends, showToast]);

  const dismissInvite = useCallback(() => { clearPendingInvite(); setInvite(null); }, []);

  // ---------------------------------------------------------------
  // 在校確認のあとの演出：スライムが現れ、ポイントが1つずつ累計に足される
  // ---------------------------------------------------------------
  const celebrate = useCallback((r: CheckResponse, before: number, quiet = false) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

    const list = friendsRef.current?.friends ?? [];
    const nameOf = (id: string) => list.find((x) => x.userId === id)?.displayName ?? '';
    const present = r.friends.filter((f) => f.present).map((f) => ({ userId: f.userId, name: nameOf(f.userId) }));
    field.setRain(r.weather.rainy);
    let landed = field.sync(present, { present: r.me.presence === 'present', ghost: r.me.hidden });

    // 届いていたリアクション（つんつん）を、そのフレンドのスライムで見せてから、ポイントに移る
    const reactions = r.reactions ?? [];
    if (reactions.length) {
      reactions.forEach((x, i) => later(landed + 150 + i * 700, () => { field.react(x.userId, x.count); }));
      later(landed + 150, () => showToast(`${names(reactions.map((x) => nameOf(x.userId)))}から つんつんが届きました`));
      landed += 150 + reactions.length * 700 + 900;
    }
    const items = r.points.awarded;

    if (!items.length) {
      setDisplayTotal(null);
      if (!quiet) later(reactions.length ? landed : Math.min(landed, 400), () => showToast(r.points.notice ?? '今の分は獲得済みです'));
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

  const check = useCallback(async (auto = false) => {
    if (busy.current || !points || !me) return;
    const before = points.total;
    const box: { result?: CheckResponse } = {};
    const work = async () => {
      setChecking(true);
      try {
        const r = await api.check(auto);
        box.result = r;
        writeLastCheck(me.userId, r);
        setLastCheck(r);
        setPoints({ date: r.points.date, today: r.points.today, total: r.points.total });
        setMe((m) => (m ? { ...m, hidden: r.me.hidden } : m));
        if (r.points.awarded.length) setDisplayTotal(before); // 演出で少しずつ足すので、いったん前の値のまま出す
      } finally {
        setChecking(false);
      }
    };
    if (auto) {
      // 裏の取り直しは、ほかの操作の邪魔をせず、失敗しても黙って次の機会を待つ
      busy.current = true;
      try { await work(); } catch { /* 次の機会に取り直す */ } finally { busy.current = false; }
    } else {
      await run('ポイント獲得（在校確認）', work);
    }
    if (box.result) celebrate(box.result, before, auto);
  }, [celebrate, me, points, run]);

  // フレンドのスライムを連打し終えたら送る。すぐには届かず、相手の画面にこちらのスライムが出たときに届く
  useEffect(() => {
    field.onReact((userId, count) => {
      const name = friendsRef.current?.friends.find((f) => f.userId === userId)?.displayName ?? '';
      callLog.begin('スライムを連打した');
      api.react(userId, count)
        .then(() => showToast(`${name}さんに つんつん×${count} を送りました`))
        .catch((e: ApiError) => showToast(e.message));
    });
    return () => field.onReact(null);
  }, [field, showToast]);

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

  // ---------------------------------------------------------------
  // 今日すでに在校確認していたら、地図とフレンドの在校を自動で取り直す
  //
  // 一度押したあとは、フレンドが来た・帰ったが押し直すまで反映されない。
  // その日に押していれば「見たい」意思はあるとみなし、
  // アプリを開いたとき・画面に戻ってきたとき・開いているあいだは数分おきに、押したのと同じ確認をする。
  // 新しく来たフレンドのマッチもここで入る（押したときと同じ演出で見せる）。
  // ---------------------------------------------------------------
  const checkRef = useRef(check);
  checkRef.current = check;
  const lastCheckRef = useRef(lastCheck);
  lastCheckRef.current = lastCheck;
  const autoCheck = useCallback(() => {
    const lc = lastCheckRef.current;
    if (document.visibilityState !== 'visible' || !lc || !isToday(lc.checkedAt)) return;
    if (Date.now() - new Date(lc.checkedAt).getTime() < AUTO_CHECK_MIN_GAP_MS) return;
    void checkRef.current(true);
  }, []);

  const loaded = points !== null; // 中身が変わるたびには張り直さない
  useEffect(() => {
    if (view !== 'app' || !loaded) return;
    autoCheck(); // 開いた直後（前に確認したのが今日なら）
    const timer = window.setInterval(autoCheck, AUTO_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [view, loaded, autoCheck]);

  // ---------------------------------------------------------------
  // 画面に戻ってきたら、裏で取り直す
  //
  // フレンドは相手の操作でも変わる（QRを読み取ってもらった・申請を承認された）。
  // 自分が何かするまで古いままだと、片方の画面にだけ「承認待ち」が残って見える。
  // ---------------------------------------------------------------
  useEffect(() => {
    if (view !== 'app') return;
    let last = Date.now();
    const catchUp = () => {
      if (document.visibilityState !== 'visible') return;
      autoCheck();
      const now = Date.now();
      if (now - last < 5000) return; // 戻るたびに何度も叩かない
      last = now;
      loadAll(true).catch(() => { /* 次の操作で表示する */ });
    };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('focus', catchUp);
    return () => {
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('focus', catchUp);
    };
  }, [view, loadAll, autoCheck]);

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

  // ---------------------------------------------------------------
  // 開いたときに繋がらなかったら、繋がり直した・画面に戻ってきた時点で自動でやり直す
  //
  // 「もう一度試す」を押さなくても、電波が戻れば元の画面に戻れるようにする。
  // ---------------------------------------------------------------
  useEffect(() => {
    if (view !== 'error') return;
    const retry = () => {
      if (document.visibilityState !== 'visible') return;
      void restart();
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [view, restart]);

  const value = useMemo<Ctx>(() => ({
    view, initialDisplayName, error, tab, me, friends, points, lastCheck, checking, sheet, mapOpen, displayTotal, toast, invite,
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
    acceptInvite,
    dismissInvite,
    completeRegistration: loadAll,
    finishOnboarding: (t) => {
      setView('app');
      setTabState(t);
      // 招待リンクから来た人には、先に「申請しますか？」を出すので、追加のシートは開かない
      if (t === 'friends' && !pendingInvite()) setSheet({ open: true, mode: 'show' });
    },
    refresh,
    restart,
    restartFromOnboarding: () => { void api.logout().finally(() => { setTabState('home'); goLogin(); }); },
  }), [view, initialDisplayName, error, tab, me, friends, points, lastCheck, checking, sheet, mapOpen, displayTotal, toast, invite,
    field, showToast, run, check, toggleHide, reloadFriends, acceptInvite, dismissInvite, loadAll, refresh, restart, goLogin]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
