// キャンパスのフィールドを置く場所
// フィールド本体（src/field/campusField.ts）はReactの外で一度だけ作ってあり、ここに差し込むだけ。
// ホームから離れても作り直さないので、スライムの動きが途切れない。
//
// 図をタップすると、キャンパスの地図（src/phone/CampusMap.tsx）にうつる。

import { useLayoutEffect, useRef } from 'react';
import { useApp } from '../app/AppContext';

export function FieldView() {
  const { field, openMap } = useApp();
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    el.appendChild(field.el);
    return () => { if (field.el.parentNode === el) el.removeChild(field.el); };
  }, [field]);

  return (
    <div className="field-host">
      <div ref={host} />
      {/* スライムのタップ（名前が出る）をふさがないよう、地図へ行くのは角のボタンだけ */}
      <button className="field-map-btn" onClick={openMap} aria-label="キャンパスの地図をひらく">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14" /><path d="M15 6v14" />
        </svg>
        地図
      </button>
    </div>
  );
}
