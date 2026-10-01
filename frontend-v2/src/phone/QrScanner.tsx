// QRコードの読み取り（ブラウザのカメラを使う）
//
// カメラの許可は、ブラウザが「ボタンを押した直後」にしか聞いてくれない（とくに iPhone の Safari）。
// なので開いただけでは起動せず、「カメラを使う」を押してから許可を求める。
// すでに許可されている端末では、ボタンを出さずにそのまま起動する。
//
// 読み取りは、ブラウザに備わっている BarcodeDetector（Android の Chrome など）を先に使い、
// 無ければ jsQR（iPhone の Safari など）で読む。jsQR は使うときだけ読み込む。
//
// カメラが使えるのは https のページだけ（本番は https、手元の localhost も可）。
//
// 写真（スクショ）からも読める。インスタのストーリーズに載ったQRは、スクショするしかないため。
// ただし写真から読んだときは、目の前に相手がいるとは限らないので、すぐにはフレンドにせず
// 申請にする（呼び出し側が from === 'photo' を見て決める）。

import { useCallback, useEffect, useRef, useState } from 'react';

type State = 'idle' | 'asking' | 'running' | 'denied' | 'nocamera' | 'unsupported' | 'error';

/** 読んだ文字列から共有キーを取り出す。招待リンク（?add=sk_…）でも、キーそのままでもよい。 */
export function shareKeyFrom(text: string): string | null {
  const s = text.trim();
  if (/^sk_[0-9A-Za-z]{4,64}$/.test(s)) return s;
  try {
    const key = new URL(s).searchParams.get('add') ?? '';
    return /^sk_[0-9A-Za-z]{4,64}$/.test(key) ? key : null;
  } catch { return null; }
}

type Detect = (source: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<string | null>;

/** どこから読んだか。camera は目の前の相手、photo は写真（スクショ）から */
export type QrSource = 'camera' | 'photo';

/** 写真の中のQRを読む。見つからなければ null */
async function readPhoto(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    if (BD) {
      try {
        const found = (await new BD({ formats: ['qr_code'] }).detect(img))[0]?.rawValue;
        if (found) return found;
      } catch { /* 読めなければ jsQR でもう一度 */ }
    }
    const { default: jsQR } = await import('jsqr');
    // スクショは大きいので縮める。ただ、QRが画面の一部に小さく写っていることが多いので、カメラより大きめに残す
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function makeDetector(): Promise<Detect> {
  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(s: CanvasImageSource): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (BD) {
    try {
      const d = new BD({ formats: ['qr_code'] });
      return async (video) => (await d.detect(video))[0]?.rawValue ?? null;
    } catch { /* 形式に対応していなければ jsQR へ */ }
  }
  const { default: jsQR } = await import('jsqr');
  return async (video, canvas) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    // 大きいままだと遅いので、長い辺を 480px に縮めて読む
    const k = Math.min(1, 480 / Math.max(w, h));
    canvas.width = Math.round(w * k);
    canvas.height = Math.round(h * k);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function QrScanner({ onKey }: { onKey(shareKey: string, from: QrSource): void }) {
  const [state, setState] = useState<State>('idle');
  const [wrong, setWrong] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');
  const [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef(0);
  const done = useRef(false);
  // 親が描き直されても、カメラは止めたくない。onKey は ref で持つ
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) { setState('unsupported'); return; }
    stop();
    done.current = false;
    setState('asking');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      stream.current = s;
      const v = video.current;
      if (!v) { stop(); return; }
      v.srcObject = s;
      await v.play().catch(() => undefined);
      setState('running');

      const detect = await makeDetector();
      canvas.current ??= document.createElement('canvas');
      const loop = async () => {
        if (!stream.current || done.current) return;
        const text = v.readyState >= 2 ? await detect(v, canvas.current as HTMLCanvasElement).catch(() => null) : null;
        if (text) {
          const key = shareKeyFrom(text);
          if (key) { done.current = true; stop(); onKeyRef.current(key, 'camera'); return; }
          setWrong(true);
        }
        timer.current = window.setTimeout(() => void loop(), 180);
      };
      void loop();
    } catch (e) {
      const name = (e as DOMException).name;
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'nocamera' : 'error');
    }
  }, [stop]);

  const choosePhoto = async (f: File | undefined) => {
    if (file.current) file.current.value = ''; // 同じ写真をもう一度選べるようにする
    if (!f) return;
    setPhotoMsg('');
    setReading(true);
    try {
      const text = await readPhoto(f);
      const key = text ? shareKeyFrom(text) : null;
      if (key) { stop(); onKeyRef.current(key, 'photo'); return; }
      setPhotoMsg(!text
        ? 'この写真からはQRコードが見つかりませんでした。QRが大きく写るようにスクショし直してみてください。'
        : 'COKOYOのフレンド用のQRではないようです（ストーリーズの画像のQRはアプリのページで、フレンド用ではありません）。相手の招待リンクか、フレンド追加のQRを読み込んでください。');
    } catch {
      setPhotoMsg('写真を読み込めませんでした。');
    } finally {
      setReading(false);
    }
  };

  // すでに許可されていれば、ボタンを待たずに起動する
  useEffect(() => {
    let alive = true;
    done.current = false;
    const perms = navigator.permissions as Permissions | undefined;
    perms?.query({ name: 'camera' as PermissionName })
      .then((p) => { if (!alive) return; if (p.state === 'granted') void start(); else if (p.state === 'denied') setState('denied'); })
      .catch(() => { /* 聞けないブラウザ（古い Safari など）はボタンから */ });
    return () => { alive = false; done.current = true; stop(); };
  }, [start, stop]);

  return (
    <div className="scanner">
      <div className={`camera${state === 'running' ? ' live' : ''}`}>
        <video ref={video} playsInline muted autoPlay aria-label="カメラの映像" />
        <span className="corner tl" /><span className="corner tr" /><span className="corner bl" /><span className="corner br" />
        {state === 'running' && <span className="camera-text">{wrong ? 'COKOYOのQRコードではないようです' : '相手のQRコードを枠に合わせてください'}</span>}
        {(state === 'idle' || state === 'asking') && (
          <div className="camera-ask">
            <button className="btn btn-primary" onClick={() => void start()} disabled={state === 'asking'}>
              {state === 'asking' ? '許可を待っています…' : 'カメラを使う'}
            </button>
            <p>このあと「カメラへのアクセス」を聞かれたら<b>「許可」</b>を押してください</p>
          </div>
        )}
      </div>

      <button className="btn btn-quiet btn-icon" disabled={reading} onClick={() => file.current?.click()}>
        <PhotoIcon />{reading ? '読み込んでいます…' : '写真から読み込む'}
      </button>
      <p className="scan-msg">ストーリーズなどのQRは、スクショしてから読み込めます。写真から読み込んだときは<b>申請</b>になり、相手が承認するとフレンドになります。</p>
      {photoMsg && <p className="scan-msg scan-warn" role="alert">{photoMsg}</p>}
      <input ref={file} className="hidden-file" type="file" accept="image/*" aria-label="QRコードの写真"
        onChange={(e) => void choosePhoto(e.target.files?.[0])} />

      {state === 'denied' && <DeniedHelp onRetry={() => void start()} />}
      {state === 'nocamera' && <p className="scan-msg">カメラが見つかりませんでした。「リンクで共有」のタブから、共有キーでも追加できます。</p>}
      {state === 'unsupported' && (
        <p className="scan-msg">
          このブラウザではカメラを使えません。スマホの<b>標準のカメラアプリ</b>で相手のQRを写して、出てきたリンクを開いても追加できます。
        </p>
      )}
      {state === 'error' && (
        <p className="scan-msg">カメラを起動できませんでした。ほかのアプリがカメラを使っていないか確かめて、<button className="linkish" onClick={() => void start()}>もう一度</button></p>
      )}
    </div>
  );
}

function PhotoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.8" /><path d="m21 16-5-5-9 9" />
    </svg>
  );
}

/** カメラを「許可しない」にしてしまったときの戻し方。端末ごとに場所が違う。 */
function DeniedHelp({ onRetry }: { onRetry(): void }) {
  const ios = isIOS();
  const app = isStandalone();
  return (
    <div className="scan-help">
      <p className="scan-help-title">カメラが「許可しない」になっています</p>
      {ios && !app && (
        <ol className="steps">
          <li><span>アドレスバーの左はしの<b>「ぁあ」</b>（または <b>⋯</b>）を押す</span></li>
          <li><span><b>「Webサイトの設定」</b>を押す</span></li>
          <li><span><b>「カメラ」</b>を<b>「許可」</b>にする</span></li>
        </ol>
      )}
      {ios && app && (
        <ol className="steps">
          <li><span>iPhone の<b>「設定」</b>アプリを開く</span></li>
          <li><span><b>「アプリ」→「Safari」</b>を開く（古い iOS では「Safari」だけ）</span></li>
          <li><span>下のほうの<b>「カメラ」</b>を<b>「確認」</b>か<b>「許可」</b>にする</span></li>
        </ol>
      )}
      {!ios && !app && (
        <ol className="steps">
          <li><span>アドレスバーの左はしの<b>鍵のマーク</b>（または <b>⚙</b>）を押す</span></li>
          <li><span><b>「権限」</b>を押す</span></li>
          <li><span><b>「カメラ」</b>をオンにする</span></li>
        </ol>
      )}
      {!ios && app && (
        <ol className="steps">
          <li><span>ホーム画面の COKOYO のアイコンを<b>長押し</b>して<b>「アプリ情報」</b></span></li>
          <li><span><b>「権限」→「カメラ」</b>を開く</span></li>
          <li><span><b>「アプリの使用中のみ許可」</b>にする</span></li>
        </ol>
      )}
      <button className="btn btn-quiet" onClick={onRetry}>設定したので、もう一度試す</button>
      <p className="scan-msg">うまくいかないときは、上の「写真から読み込む」か、「リンクで共有」のタブの共有キーでも追加できます。</p>
    </div>
  );
}
