import type { MapSchema } from '@colyseus/schema';
import { GAME_STATE_KEYS, PLAYER_STATE_KEYS, type GameState } from '@masinute/shared';
import { PlayerSchema, type RoomState } from './schema';

// Copies the authoritative GameState into the schema after every tick. Only values that
// differ are assigned, so a patch carries just what changed. The simulation never reads
// the schema: determinism lives entirely in GameState.

export function mirror(src: Readonly<GameState>, dst: RoomState): void {
  assign(dst, src, GAME_STATE_KEYS);
  syncPlayers(src, dst.players);
}

function syncPlayers(src: Readonly<GameState>, dst: MapSchema<PlayerSchema>): void {
  for (const id of [...dst.keys()]) if (!src.players[id]) dst.delete(id);
  for (const p of Object.values(src.players)) {
    let view = dst.get(p.id);
    if (!view) {
      view = new PlayerSchema();
      assign(view, p, PLAYER_STATE_KEYS);
      dst.set(p.id, view);
    } else assign(view, p, PLAYER_STATE_KEYS);
  }
}

type Fields<K extends string> = { [P in K]: unknown };

/** Both sides must have every key; values are copied as-is (the schema field types mirror GameState). */
function assign<K extends string>(dst: Fields<K>, src: Readonly<Fields<K>>, keys: readonly K[]): void {
  for (const key of keys) {
    if (dst[key] !== src[key]) dst[key] = src[key];
  }
}
