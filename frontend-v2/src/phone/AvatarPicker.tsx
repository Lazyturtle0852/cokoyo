// アイコンの写真を選ぶ（設定タブのプロフィール）
//
// 選んだあと、丸い枠に重ねて「どう映るか」を見せる。指でずらして、
// スライダーで大きさを変えられる。決めた範囲だけを 128px に縮めて送る
// （大きいまま送るとバックエンドのDBが重くなるし、通信も遅くなるため）。

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { Avatar } from './ui';

/** 送る画像の一辺（px）と JPEG の画質 */
const SIZE = 128;
const QUALITY = 0.82;
/** 画面に出す枠の大きさ（CSSピクセル） */
const STAGE = 232;
const MAX_ZOOM = 3;

interface Picked {
  url: string;
  img: HTMLImageElement;
  /** 枠いっぱいに広げたときの倍率 */
  base: number;
}

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const el = new Image();
  el.onload = () => resolve(el);
  el.onerror = () => reject(new Error('画像を読み込めませんでした'));
  el.src = url;
});

export function AvatarPicker() {
  const { me, run, setMe, showToast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // 枠の左上を基準にした画像の位置
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // 使い終わった画像は片づける
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url); }, [picked]);

  if (!me) return null;

  const k = picked ? picked.base * zoom : 1;
  /** 枠からはみ出したままにならないよう、位置を戻す */
  const clamp = (v: { x: number; y: number }, scale = k) => {
    if (!picked) return v;
    const w = picked.img.naturalWidth * scale;
    const h = picked.img.naturalHeight * scale;
    return {
      x: Math.min(0, Math.max(STAGE - w, v.x)),
      y: Math.min(0, Math.max(STAGE - h, v.y)),
    };
  };

  const choose = async (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    try {
      const img = await loadImage(url);
      const base = STAGE / Math.min(img.naturalWidth, img.naturalHeight);
      setPicked({ url, img, base });
      setZoom(1);
      // はじめは写真のまんなかを枠に合わせる
      setPos({ x: (STAGE - img.naturalWidth * base) / 2, y: (STAGE - img.naturalHeight * base) / 2 });
    } catch (e) {
      URL.revokeObjectURL(url);
      showToast((e as Error).message);
    } finally {
      if (file.current) file.current.value = ''; // 同じ写真をもう一度選べるようにする
    }
  };

  const changeZoom = (next: number) => {
    if (!picked) return;
    // 枠のまんなかを軸にして拡大・縮小する
    const scale = picked.base * next;
    const ratio = scale / k;
    setPos((p) => clamp({ x: STAGE / 2 - (STAGE / 2 - p.x) * ratio, y: STAGE / 2 - (STAGE / 2 - p.y) * ratio }, scale));
    setZoom(next);
  };

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('この端末では画像を扱えません');
      // 枠（STAGE四方）に映っているぶんだけを切り出す
      ctx.drawImage(picked.img, -pos.x / k, -pos.y / k, STAGE / k, STAGE / k, 0, 0, SIZE, SIZE);
      const image = canvas.toDataURL('image/jpeg', QUALITY);
      const ok = await run('アイコンを変更', async () => {
        setMe(await api.updateAvatar(image));
        showToast('アイコンを変えました');
      });
      if (ok) { URL.revokeObjectURL(picked.url); setPicked(null); }
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => { if (picked) URL.revokeObjectURL(picked.url); setPicked(null); };

  const remove = () => run('アイコンを消す', async () => {
    setMe(await api.removeAvatar());
    showToast('アイコンを元に戻しました');
  });

  return (
    <div className="avatar-edit">
      <Avatar userId={me.userId} name={me.displayName} avatar={me.avatar} />
      <div className="avatar-edit-body">
        <div className="k">アイコン</div>
        <p className="row-note">フレンドの一覧に、丸く切り抜いて出ます。</p>
        <div className="inline-actions">
          <button className="mini-btn primary" disabled={busy} onClick={() => file.current?.click()}>
            {me.avatar ? '写真を変える' : '写真を選ぶ'}
          </button>
          {me.avatar && <button className="mini-btn" onClick={() => void remove()}>写真を削除</button>}
        </div>
      </div>

      {picked && (
        <div className="crop" role="group" aria-label="アイコンの位置を決める">
          <div
            className="crop-stage"
            style={{ width: STAGE, height: STAGE }}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              setPos(clamp({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
          >
            <img
              src={picked.url} alt="選んだ写真" draggable={false}
              style={{
                width: picked.img.naturalWidth * k,
                height: picked.img.naturalHeight * k,
                left: pos.x, top: pos.y,
              }}
            />
            <span className="crop-mask" aria-hidden="true" />
          </div>
          <label className="crop-zoom">
            <span>大きさ</span>
            <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))} aria-label="写真の大きさ" />
          </label>
          <p className="row-note">写真を指でずらして、丸の中に入れてください。</p>
          <div className="inline-actions">
            <button className="mini-btn primary" disabled={busy} onClick={() => void save()}>{busy ? '送っています…' : 'これにする'}</button>
            <button className="mini-btn" disabled={busy} onClick={() => file.current?.click()}>選び直す</button>
            <button className="mini-btn" disabled={busy} onClick={cancel}>やめる</button>
          </div>
        </div>
      )}

      <input ref={file} className="hidden-file" type="file" accept="image/*" aria-label="アイコンにする写真"
        onChange={(e) => void choose(e.target.files?.[0])} />
    </div>
  );
}
