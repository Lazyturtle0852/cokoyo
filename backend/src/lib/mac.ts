/**
 * MACの表記ゆれを吸収する。
 *
 * 保存は小文字16進12桁・区切りなし。
 * DTC は `^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$` しか受け付けないので、
 * 送信の直前だけコロン区切りに戻す。
 */

const HEX12 = /^[0-9a-f]{12}$/;

/** 入力が何であれ、保存形式に揃える。揃えられなければ null。 */
export function normalizeMac(input: string): string | null {
  const stripped = input.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  return HEX12.test(stripped) ? stripped : null;
}

/** 保存形式 → DTC が要求するコロン区切り。 */
export function toColonMac(normalized: string): string {
  return (normalized.match(/.{2}/g) ?? []).join(":");
}
