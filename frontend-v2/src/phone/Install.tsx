// ホーム画面に追加（PWA）の案内
//
//   InstallStep … はじめて開いたときの最初の画面（src/phone/Onboarding.tsx）
//   InstallCard … 登録ずみの人のホームのいちばん上（src/phone/Home.tsx）
//
// Android の Chrome はボタン1つで追加できる。iPhone は共有メニューからしか追加できないので、
// 押す場所を絵で示す。どちらでもない（パソコンなど）ときは、そもそも出さない。

import { useState } from 'react';
import { isIOS, useInstall } from '../app/install';

const ShareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3" /><path d="M8.5 6.5 12 3l3.5 3.5" /><path d="M6 12H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
  </svg>
);

const PlusSquare = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M12 8.5v7M8.5 12h7" />
  </svg>
);

/** ホーム画面に並ぶアイコンの見本 */
const Preview = () => (
  <div className="inst-preview" aria-hidden="true">
    <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width="60" height="60" />
    <span>COKOYO</span>
  </div>
);

/** 端末ごとの追加のしかた */
function Steps() {
  if (isIOS()) {
    return (
      <ol className="steps">
        <li><span>画面の下（または上）にある<b>共有</b>ボタン<span className="inst-ico"><ShareIcon /></span>を押す</span></li>
        <li><span>メニューを下にたどって<b>「ホーム画面に追加」</b><span className="inst-ico"><PlusSquare /></span>を押す</span></li>
        <li><span>右上の<b>「追加」</b>を押す</span></li>
      </ol>
    );
  }
  return (
    <ol className="steps">
      <li><span>画面の右上の<b>⋮</b>（メニュー）を押す</span></li>
      <li><span><b>「アプリをインストール」</b>または<b>「ホーム画面に追加」</b>を押す</span></li>
      <li><span><b>「インストール」</b>を押す</span></li>
    </ol>
  );
}

const LEAD = 'ホーム画面から開けるようになり、ふつうのアプリと同じように全画面で使えます。あとからでも追加できます。';

/** はじめて開いたときの、いちばん最初の画面 */
export function InstallStep({ onNext }: { onNext(): void }) {
  const { way, install, skip } = useInstall();

  const add = async () => {
    const ok = await install();
    if (ok) onNext();
  };

  return (
    <div className="content ob">
      <div className="ob-hero inst-hero">
        <div className="wordmark big">COK<span>O</span>YO</div>
        <span className="provisional">仮称</span>
        <h2>まず、ホーム画面に追加しましょう</h2>
      </div>
      <Preview />
      <p className="ob-lead">{LEAD}</p>
      {way === 'prompt'
        ? <button className="btn btn-primary" onClick={() => void add()}>ホーム画面に追加</button>
        : <Steps />}
      <button className="btn btn-quiet" onClick={() => { skip(); onNext(); }}>
        {way === 'prompt' ? 'あとで' : '追加した／あとで'}
      </button>
    </div>
  );
}

/** 登録ずみの人のホームのいちばん上に出す、小さい案内 */
export function InstallCard() {
  const { way, canOffer, install, skip } = useInstall();
  const [open, setOpen] = useState(false);
  if (!canOffer) return null;

  return (
    <div className="card inst-card">
      <div className="inst-head">
        <Preview />
        <div>
          <div className="inst-title">ホーム画面に追加</div>
          <div className="inst-sub">アプリと同じように、全画面で開けます</div>
        </div>
      </div>
      {way === 'prompt' ? (
        <button className="btn btn-primary" onClick={() => void install()}>追加する</button>
      ) : open ? <Steps /> : (
        <button className="btn btn-primary" onClick={() => setOpen(true)}>追加のしかたを見る</button>
      )}
      <button className="row-btn inst-skip" onClick={skip}>あとで（もう出さない）</button>
    </div>
  );
}
