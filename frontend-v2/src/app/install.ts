// ホーム画面に追加（PWA）の判定
//
// Android の Chrome は「追加できますよ」という知らせ（beforeinstallprompt）をくれるので、
// それを預かっておいてボタンから出す。iPhone の Safari はその知らせが無く、
// 共有メニューからしか追加できないので、やり方を絵で説明する。

import { useCallback, useEffect, useState } from 'react';
import { inAppBrowser } from './browser';

export type InstallWay = 'prompt' | 'ios' | 'manual';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Chrome がくれた「追加できます」の知らせ。React が動く前に来ることがあるので、ここで預かる */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // ブラウザ既定の細いバーを出さず、アプリの中の案内から出す
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
}

/** すでにホーム画面のアプリとして開いているか */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches
  || (navigator as { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isAndroid = () => /Android/.test(navigator.userAgent);

/** 「あとで」を押した記録。次からは案内を出さない */
const SKIP_KEY = 'cokoyo-install-skipped:v1';
const readSkip = () => { try { return localStorage.getItem(SKIP_KEY) === '1'; } catch { return false; } };

export function useInstall() {
  const [, bump] = useState(0);
  const [skipped, setSkipped] = useState(readSkip);

  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const way: InstallWay = deferred ? 'prompt' : isIOS() ? 'ios' : 'manual';

  /**
   * 案内を出す価値があるか。
   * 追加ずみ・「あとで」を押した・パソコンのときは出さない。
   * LINE やインスタの中のブラウザからはホーム画面に追加できないので、そこでも出さない
   * （先に「ふだんのブラウザで開いてください」の案内を読んでもらう）。
   */
  const canOffer = !isStandalone() && !skipped && !inAppBrowser()
    && (way === 'prompt' || (way === 'ios' && !!navigator.maxTouchPoints) || isAndroid());

  /** Chrome の追加ダイアログを出す。追加されたら true */
  const install = useCallback(async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    emit();
    await e.prompt();
    return (await e.userChoice).outcome === 'accepted';
  }, []);

  const skip = useCallback(() => {
    try { localStorage.setItem(SKIP_KEY, '1'); } catch { /* 保存できない環境 */ }
    setSkipped(true);
  }, []);

  return { way, canOffer, install, skip };
}
