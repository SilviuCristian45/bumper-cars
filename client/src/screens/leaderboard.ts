import { LEADERBOARD_MIN_HUMANS, LEADERBOARD_SIZE, nameKey, type LeaderboardEntry } from '@masinute/shared';
import { fetchLeaderboard, formatRecordDate } from '../net/leaderboard';
import { load } from '../storage';
import { el } from '../ui/el';
import { button, onKeyFor, title } from '../ui/html';
import type { ScreenHost } from './host';

const MEDALS = ['gold', 'silver', 'bronze'];

/** "Clasament": the all-time top, opened from the menu. */
export function showLeaderboard(host: ScreenHost): void {
  const back = () => host.go({ to: 'menu', data: {} });
  const content = el('div', { class: 'leaderboard-body' }, [el('p', { class: 'message info', text: 'Se încarcă...' })]);
  host.mount('leaderboard', [
    title(true),
    el('h2', { text: `Clasament: top ${LEADERBOARD_SIZE}` }),
    content,
    el('p', {
      class: 'note',
      text: `Intră doar meciurile online cu cel puțin ${LEADERBOARD_MIN_HUMANS} jucători (boții nu contează): cel mai bun meci al fiecărei porecle, după puncte, apoi runde câștigate.`,
    }),
    button('Înapoi', back, 'primary', 'medium'),
  ]);
  onKeyFor(host.life, 'Escape', back);
  void fetchRows(host, content);
}

async function fetchRows(host: ScreenHost, content: HTMLElement): Promise<void> {
  const entries = await fetchLeaderboard();
  // The player may have gone back while the request was out.
  if (!host.isActive()) return;
  if (entries === null) {
    content.replaceChildren(
      el('p', { class: 'message', text: 'Clasamentul nu e disponibil acum: serverul nu răspunde. Încearcă puțin mai târziu.' }),
    );
  } else if (entries.length === 0) {
    content.replaceChildren(el('p', { class: 'message info', text: 'Încă nu e niciun meci în clasament. Fii primul!' }));
  } else {
    content.replaceChildren(table(entries));
  }
}

function table(entries: LeaderboardEntry[]): HTMLElement {
  const me = nameKey(load('name') ?? '');
  const head = el(
    'tr',
    {},
    [
      ['Loc', ''],
      ['Porecla', ''],
      ['Puncte', ''],
      ['Runde', 'Runde câștigate / runde în meci'],
      ['Scoși', 'Mașinuțe scoase din ring'],
      ['Meciuri', 'Meciuri jucate'],
      ['Data', 'Data celui mai bun meci'],
    ].map(([text, hint]) => el('th', { text, attrs: hint ? { title: hint } : {} })),
  );
  const rows = entries.map((e) => {
    const medal = MEDALS[e.place - 1];
    const classes = [medal, nameKey(e.name) === me ? 'me' : ''].filter(Boolean).join(' ');
    return el('tr', { class: classes }, [
      el('td', { class: 'place', text: String(e.place) }),
      el('td', { class: 'name', text: e.name }),
      el('td', { class: 'points', text: String(e.points) }),
      el('td', { text: `${e.wins}/${e.rounds}` }),
      el('td', { text: String(e.knockouts) }),
      el('td', { text: String(e.matches) }),
      el('td', { class: 'date', text: formatRecordDate(e.endedAt) }),
    ]);
  });
  const tableNode = el('table', { class: 'leaderboard-table' }, [el('thead', {}, [head]), el('tbody', {}, rows)]);
  // A narrow phone scrolls the table sideways instead of squeezing it.
  return el('div', { class: 'table-scroll' }, [tableNode]);
}
