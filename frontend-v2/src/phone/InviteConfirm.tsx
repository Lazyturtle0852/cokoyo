// 招待リンク・QRで開かれたときの確認
//
// 黙って申請せず、相手の名前とアイコンを見せて「申請しますか？」と聞く。
// はじめての人は、登録が終わってアプリの画面に入ったところで出る（src/app/AppContext.tsx）。

import { useApp } from '../app/AppContext';
import { Avatar } from './ui';

export function InviteConfirm() {
  const { view, invite, acceptInvite, dismissInvite } = useApp();
  if (view !== 'app' || !invite) return null;
  const { user, incoming } = invite;

  return (
    <>
      <div className="backdrop open" onClick={dismissInvite} />
      <div className="invite-card" role="alertdialog" aria-labelledby="inviteTitle" aria-describedby="inviteBody">
        <Avatar userId={user.userId} name={user.displayName} avatar={user.avatar} />
        <p className="invite-name">{user.displayName}さん</p>
        <h4 id="inviteTitle">{incoming ? 'フレンドになりますか？' : 'フレンド申請しますか？'}</h4>
        <p id="inviteBody" className="invite-body">
          {incoming
            ? `${user.displayName}さんから申請が届いています。「フレンドになる」を押すと、すぐにフレンドになります。`
            : `招待リンク（QR）を開きました。申請すると、${user.displayName}さんが承認したときにフレンドになります。`}
        </p>
        <button className="btn btn-primary" onClick={() => void acceptInvite()}>{incoming ? 'フレンドになる' : '申請する'}</button>
        <button className="btn btn-quiet" onClick={dismissInvite}>やめる</button>
      </div>
    </>
  );
}
