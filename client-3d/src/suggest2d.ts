import { openDialog } from '@client/ui/dialog';
import { el } from '@client/ui/el';
import { button } from '@client/ui/html';
import { goToOtherClient } from '@client/ui/otherClient';

/** A slow device (SlowDeviceCheck): offers the 2D client. */
export function suggest2d(fps: number): void {
  const stay = () => dialog.close();
  const dialog = openDialog(
    [
      el('h2', { text: 'Varianta 2D merge mai fluid aici' }),
      el('p', {
        text: `Pe acest dispozitiv, 3D-ul merge cu vreo ${fps} de cadre pe secundă. În 2D jocul e mai fluid, cu aceiași prieteni și aceleași coduri. Poți reveni oricând din meniu.`,
      }),
      el('div', { class: 'btn-row' }, [button('Treci la 2D', () => goToOtherClient('2d'), 'primary'), button('Rămân în 3D', stay)]),
    ],
    stay,
  );
}
