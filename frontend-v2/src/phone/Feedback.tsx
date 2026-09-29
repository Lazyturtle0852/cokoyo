// 問い合わせ・ご意見（設定タブ）
//
// Google フォームを開くだけ。項目を足したり集計したりをフォーム側でできるようにするため。
// URLは src/config.ts の feedbackFormUrl。

import { feedbackFormUrl } from '../config';

export function Feedback() {
  return (
    <>
      <p className="row-note">
        使いにくいところ、動かないところ、ほしい機能があれば教えてください。作っている学生に直接届きます。
        退会（データの削除）の希望もここから受け付けます。
      </p>
      <a className="btn btn-quiet" href={feedbackFormUrl} target="_blank" rel="noopener noreferrer">
        問い合わせフォームを開く
      </a>
      <p className="row-note">Google フォームが開きます。</p>
    </>
  );
}
