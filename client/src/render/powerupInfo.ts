import { PU_HORN, PU_LIFEBUOY, PU_MICI, PU_OIL, PU_SPRINGS, PU_TUICA } from '@masinute/shared';

// How each power-up kind is shown: its name, the shout over the car when it is picked up, a
// one-line hint for the HUD, and its color (aura, text, debug).

export interface PowerupInfo {
  name: string;
  shout: string;
  hint: string;
  color: number;
}

export const POWERUP_INFO: Record<number, PowerupInfo> = {
  [PU_HORN]: { name: 'Claxon de TIR', shout: 'CLAXON DE TIR!', hint: 'i-a împins pe toți', color: 0xffd166 },
  [PU_MICI]: { name: 'Mici cu muștar', shout: 'MICI CU MUȘTAR!', hint: 'greu de mișcat, lovești tare', color: 0xe9a23b },
  [PU_LIFEBUOY]: { name: 'Colac de salvare', shout: 'COLAC DE SALVARE!', hint: 'următoarea ieșire e anulată', color: 0xff5d5d },
  [PU_OIL]: { name: 'Ulei vărsat', shout: 'ULEI VĂRSAT!', hint: 'baltă în urma ta', color: 0x9b7bd8 },
  [PU_TUICA]: { name: 'Țuică de prună', shout: 'ȚUICĂ DE PRUNĂ!', hint: 'primul lovit o ia razna', color: 0x7f5af0 },
  [PU_SPRINGS]: { name: 'Bară cu arcuri', shout: 'BARĂ CU ARCURI!', hint: 'loviturile tale împing dublu', color: 0x4cc9f0 },
};

export const hexColor = (c: number) => '#' + c.toString(16).padStart(6, '0');
