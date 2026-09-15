/**
 * 契約の一致を型で確かめる。
 *
 * shared/app-types.ts（バックエンドが実装する形）と
 * frontend-v2/src/api/types.ts（画面が期待する形）が
 * 食い違ったら、ここが型エラーになる。
 *
 * 実行はしない。npm run typecheck が通ることがテスト。
 */
import type * as App from "../../shared/app-types.js";
import type * as Fe from "../../frontend-v2/src/api/types.js";

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const assert = <T extends true>(_: T) => undefined;

assert<Exact<App.BestState, Fe.BestState>>(true);
assert<Exact<App.UserRef, Fe.UserRef>>(true);
assert<Exact<App.Me, Fe.Me>>(true);
assert<Exact<App.RegisterResponse, Fe.RegisterResponse>>(true);
assert<Exact<App.Friend, Fe.Friend>>(true);
assert<Exact<App.FriendRequest, Fe.FriendRequest>>(true);
assert<Exact<App.BlockedUser, Fe.BlockedUser>>(true);
assert<Exact<App.FriendsResponse, Fe.FriendsResponse>>(true);
assert<Exact<App.PointKind, Fe.PointKind>>(true);
assert<Exact<App.PointItem, Fe.PointItem>>(true);
assert<Exact<App.PointsResponse, Fe.PointsResponse>>(true);
assert<Exact<App.FriendPresence, Fe.FriendPresence>>(true);
assert<Exact<App.CheckResponse, Fe.CheckResponse>>(true);
assert<Exact<App.AddFriendResponse, Fe.AddFriendResponse>>(true);
assert<Exact<App.BestResponse, Fe.BestResponse>>(true);
assert<Exact<App.BlockResponse, Fe.BlockResponse>>(true);
assert<Exact<App.ApiErrorBody, Fe.ApiErrorBody>>(true);
