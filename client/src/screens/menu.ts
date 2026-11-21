import { MAX_PLAYERS, sanitizeName } from '@masinute/shared';
import { isTouch } from '../device';
import type { GameTransport } from '../net/GameTransport';
import { abandonResumableRoom, createOfflineRoom, createRoom, joinRoom, onlineEnabled, resumeRoom, RoomError } from '../net/rooms';
import { getSetting, setSetting } from '../settings';
import { load } from '../storage';
import { CodeInput } from '../ui/CodeInput';
import { openDialog } from '../ui/dialog';
import { el } from '../ui/el';
import { button, setButtonStyle, title } from '../ui/html';
import { installHint } from '../ui/installHint';
import { otherClientButton } from '../ui/otherClient';
import type { MenuData, ScreenHost } from './host';

const CORNER_LABELS = { music: 'Muzică', reducedEffects: 'Efecte reduse' } as const;

/** Two obvious choices: create a game, or join a friend's by code. Offline play with bots is the third. */
export class MenuScreen {
  private readonly status: HTMLElement;
  private codeProblem!: HTMLElement;
  private codeInput!: CodeInput;
  private createButton!: HTMLButtonElement;
  private readonly offlineButton: HTMLButtonElement;
  private busy = false;

  constructor(
    private readonly host: ScreenHost,
    opts: MenuData,
  ) {
    this.status = el('p', { class: 'message status', text: opts.message ?? '' });
    this.offlineButton = button('Joacă offline cu boți', () => this.onPlayOffline(), onlineEnabled ? 'secondary' : 'primary', 'medium');
    // The all-time leaderboard lives on the server: an offline-only build has none.
    const leaderboardButton = onlineEnabled ? button('Clasament', () => this.openLeaderboard(), 'secondary', 'small') : null;
    const settings = isTouch || host.settingsOnDesktop;
    host.mount('menu', [
      title(true),
      this.playingAs(),
      el('div', { class: 'cards' }, [this.createCreateCard(), this.createJoinCard()]),
      this.status,
      // One row, so a phone held sideways sees all of it ("Setări" only on touch devices, unless the host wants it).
      el('div', { class: 'menu-footer' }, [
        leaderboardButton,
        this.offlineButton,
        settings ? button('Setări', () => host.openSettings(), 'secondary', 'small') : null,
        otherClientButton(host.otherClient, opts.invite),
      ]),
      isTouch ? null : this.cornerToggles(),
      installHint(),
    ]);

    if (opts.switchFrom !== undefined && opts.invite) this.askSwitch(opts.switchFrom, opts.invite);
    else if (opts.resume) this.resume();
    else if (opts.invite) this.joinInvite(opts.invite);
    else if (!isTouch && onlineEnabled) this.codeInput.focus();
  }

  /** Desktop: the "Muzică" and "Efecte reduse" toggles in the corner (touch devices have them under "Setări"). */
  private cornerToggles(): HTMLElement | null {
    if (this.host.cornerToggles.length === 0) return null;
    const toggle = (key: 'music' | 'reducedEffects') => {
      const label = () => `${CORNER_LABELS[key]}: ${getSetting(key) ? 'da' : 'nu'}`;
      const node = button(
        label(),
        () => {
          setSetting(key, !getSetting(key));
          node.textContent = label();
        },
        'secondary',
        'small',
      );
      return node;
    };
    return el('div', { class: 'corner-toggle' }, this.host.cornerToggles.map(toggle));
  }

  private resume(): void {
    void this.connect(resumeRoom(), 'Se reconectează la joc...');
  }

  /** A link to another room while this tab still has a game: the link wins, once confirmed. */
  private askSwitch(current: string, invite: string): void {
    const from = current ? ` (${current})` : '';
    const stay = () => {
      dialog.close();
      // Whatever happens, a later reload should not ask again.
      forgetInviteInUrl();
      this.resume();
    };
    const dialog = openDialog(
      [
        el('h2', { text: `Ieși din jocul curent${from}
și intri în ${invite}?` }),
        el('div', { class: 'btn-row' }, [
          button(
            `Da, intru în ${invite}`,
            () => {
              dialog.close();
              this.setStatus('Ieși din jocul curent...', true);
              void abandonResumableRoom().then(() => this.joinInvite(invite));
            },
            'primary',
          ),
          button('Nu, rămân', stay),
        ]),
      ],
      stay,
    );
  }

  /** "Joci ca {nume} · schimbă" */
  private playingAs(): HTMLElement {
    const change = el('button', { class: 'link', text: '· schimbă', attrs: { type: 'button' } });
    change.addEventListener('click', () => {
      if (!this.busy) this.host.go({ to: 'name', data: { edit: true } });
    });
    return el('p', { class: 'playing-as' }, [`Joci ca ${this.playerName()} `, change]);
  }

  private createCreateCard(): HTMLElement {
    this.createButton = button('Creează', () => this.onCreateRoom(), onlineEnabled ? 'primary' : 'secondary', 'medium');
    this.createButton.classList.add('card-action');
    const card = el('div', { class: 'card clickable' }, [
      el('h2', { text: 'Creează joc' }),
      el('p', { text: `Invită până la ${MAX_PLAYERS - 1} prieteni` }),
      this.createButton,
      onlineEnabled ? null : el('p', { class: 'soon', text: 'Doar offline în această versiune' }),
    ]);
    card.addEventListener('click', (e) => {
      if (e.target !== this.createButton) this.onCreateRoom();
    });
    return card;
  }

  private createJoinCard(): HTMLElement {
    this.codeProblem = el('p', { class: 'problem' });
    this.codeInput = new CodeInput({
      onComplete: (code) => this.join(code),
      onProblem: (message) => (this.codeProblem.textContent = message),
    });
    return el('div', { class: 'card' }, [
      el('h2', { text: 'Intră la un prieten' }),
      el('p', { text: 'Scrie codul de 6 caractere primit' }),
      this.codeInput.element,
      this.codeProblem,
    ]);
  }

  private playerName(): string {
    return sanitizeName(load('name') ?? '');
  }

  private onCreateRoom(): void {
    void this.connect(createRoom(this.playerName()), 'Se creează jocul...');
  }

  private openLeaderboard(): void {
    if (!this.busy) this.host.go({ to: 'leaderboard' });
  }

  private onPlayOffline(): void {
    void this.connect(createOfflineRoom(this.playerName()), 'Se pregătește jocul offline...');
  }

  private join(code: string): void {
    void this.connect(joinRoom(code, this.playerName()), `Intri în ${code}...`);
  }

  private joinInvite(code: string): void {
    this.codeInput.setCode(code);
    // Whatever happens, a later reload of this page should not retry the invite.
    forgetInviteInUrl();
    this.join(code);
  }

  private async connect(pending: Promise<GameTransport>, message: string): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    this.setStatus(message, true);
    try {
      const transport = await pending;
      this.host.go({ to: 'lobby', transport });
    } catch (err) {
      this.setBusy(false);
      this.setStatus(err instanceof Error ? err.message : 'Nu s-a putut intra în joc.', false);
      // No server (or a full one): highlight "Joacă offline cu boți" right under the message.
      if (err instanceof RoomError && err.offline) setButtonStyle(this.offlineButton, 'primary');
    }
  }

  private setStatus(text: string, info: boolean): void {
    this.status.textContent = text;
    this.status.classList.toggle('info', info);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.createButton.disabled = busy;
    this.offlineButton.disabled = busy;
    this.codeInput.setDisabled(busy);
  }
}

function forgetInviteInUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}
