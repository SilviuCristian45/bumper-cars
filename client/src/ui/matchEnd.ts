import type { AwardId, NewRecord } from '@masinute/shared';

// The end-of-match texts, without Phaser: shared by the 2D podium (ui/Podium.ts) and the 3D one.

export const AWARD_TEXT: Record<AwardId, { title: string; detail: (n: number) => string }> = {
  batausul: { title: 'Bătăușul', detail: (n) => `cei mai mulți scoși din ring (${n})` },
  kamikaze: { title: 'Kamikaze', detail: (n) => `cele mai multe ieșiri singur (${n})` },
  neclintitul: { title: 'Neclintitul', detail: (n) => (n === 0 ? 'n-a ieșit niciodată din ring' : `cele mai puține ieșiri (${n})`) },
  ciocanarul: { title: 'Ciocănarul', detail: (n) => `cele mai multe lovituri (${n})` },
  colectionarul: { title: 'Colecționarul', detail: (n) => `${n} power-up-uri adunate` },
  uriasul: { title: 'Uriașul', detail: (n) => `${n} ${n === 1 ? 'scos' : 'scoși'} din ring cât era mare` },
};

/** "★ Ai intrat în top! Locul 4 · Ana: record nou, locul 2 ★" (mine first), '' when nobody set one. */
export function recordsLine(records: readonly NewRecord[], me: string): string {
  const parts = [...records]
    .sort((a, b) => Number(b.playerId === me) - Number(a.playerId === me) || a.place - b.place)
    .map((r) =>
      r.playerId === me
        ? `${r.kind === 'top' ? 'Ai intrat în top!' : 'Record nou!'} Locul ${r.place}`
        : `${r.name}: ${r.kind === 'top' ? 'a intrat în top' : 'record nou'}, locul ${r.place}`,
    );
  return parts.length > 0 ? `★ ${parts.join('  ·  ')} ★` : '';
}
