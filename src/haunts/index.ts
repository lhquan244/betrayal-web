// Haunt registry: add your haunt module here.
import type { HauntModule } from './types';
import { mummyWalks } from './h01-mummy-walks';
import { webOfDestiny } from './h04-web-of-destiny';
import { payThePiper } from './h26-pay-the-piper';
import { checkmate } from './h37-checkmate';
import { hellbeasts } from './h38-hellbeasts';
import { buriedAlive } from './h40-buried-alive';

export const HAUNTS: Record<number, HauntModule> = {
  [mummyWalks.number]: mummyWalks,
  [webOfDestiny.number]: webOfDestiny,
  [payThePiper.number]: payThePiper,
  [checkmate.number]: checkmate,
  [hellbeasts.number]: hellbeasts,
  [buriedAlive.number]: buriedAlive,
};
export const implementedHaunts = () => Object.keys(HAUNTS).map(Number);

/** Group policy (chosen by the owner): when Traitor's Tome and Secrets of Survival disagree, follow Traitor's Tome. */
export const TT_POLICY = "Khi Traitor's Tome (TT) và Secrets of Survival (SoS) mâu thuẫn, bản web luôn theo Traitor's Tome.";
