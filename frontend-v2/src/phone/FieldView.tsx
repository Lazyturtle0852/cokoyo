// キャンパスのフィールドを置く場所
// フィールド本体（src/field/campusField.ts）はReactの外で一度だけ作ってあり、ここに差し込むだけ。
// ホームから離れても作り直さないので、スライムの動きが途切れない。

import { useLayoutEffect, useRef } from 'react';
import { useApp } from '../app/AppContext';

export function FieldView() {
  const { field } = useApp();
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    el.appendChild(field.el);
    return () => { if (field.el.parentNode === el) el.removeChild(field.el); };
  }, [field]);

  return <div className="field-host" ref={host} />;
}
