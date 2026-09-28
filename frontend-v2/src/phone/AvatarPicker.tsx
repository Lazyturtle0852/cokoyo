// アイコンの写真を選ぶ（設定タブのプロフィール）
//
// 選んだ写真はこの端末の中で正方形に切り、128px に縮めてから送る。
// 大きいまま送るとバックエンドのDBが重くなるし、通信も遅くなるため。

import { useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { api } from '../api/client';
import { Avatar } from './ui';

/** 送る画像の一辺（px）と JPEG の画質 */
const SIZE = 128;
const QUALITY = 0.82;

/** 選んだ写真を、まんなかで正方形に切って縮めた data URL にする */
async function squareDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('画像を読み込めませんでした'));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('この端末では画像を扱えません');
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function AvatarPicker() {
  const { me, run, setMe, showToast } = useApp();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const image = await squareDataUrl(f);
      await run('アイコンを変更', async () => {
        setMe(await api.updateAvatar(image));
        showToast('アイコンを変えました');
      });
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = ''; // 同じ写真をもう一度選べるようにする
    }
  };

  const remove = () => run('アイコンを消す', async () => {
    setMe(await api.removeAvatar());
    showToast('アイコンを元に戻しました');
  });

  return (
    <div className="avatar-edit">
      <Avatar userId={me.userId} name={me.displayName} avatar={me.avatar} />
      <div className="avatar-edit-body">
        <div className="k">アイコン</div>
        <p className="row-note">フレンドの一覧に出ます。写真はまんなかで正方形に切って使います。</p>
        <div className="inline-actions">
          <button className="mini-btn primary" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? '準備しています…' : me.avatar ? '写真を変える' : '写真を選ぶ'}
          </button>
          {me.avatar && <button className="mini-btn" onClick={() => void remove()}>写真を削除</button>}
        </div>
      </div>
      <input ref={file} className="hidden-file" type="file" accept="image/*" aria-label="アイコンにする写真"
        onChange={(e) => void choose(e.target.files?.[0])} />
    </div>
  );
}
