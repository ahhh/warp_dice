/**
 * The guided first venture: a fixed, hand-built spur of the Shattered Quays
 * that walks a fresh crew through every basic beat once — movement, a fight,
 * salvage, the warp-key and a (gentle) region lord.
 *
 *            (2,0) lord
 *              │ key door
 *            (2,1) harbourmaster
 *              │
 *   (1,2) ── (2,2) first fight
 *  salvage     │
 *            (2,3) spine
 *              │
 *            (2,4) boarding tube
 */
import type { DungeonMap, Facing, Room, RoomType } from '../engine/types.ts';
import { key, OPPOSITE } from './generator.ts';

export const TUTORIAL_SEED = 'TUTORIAL';

export const TUT = {
  entrance: key(2, 4),
  tunnel: key(2, 3),
  fight: key(2, 2),
  treasure: key(1, 2),
  kiln: key(2, 1),
  boss: key(2, 0),
} as const;

export function buildTutorialMap(): DungeonMap {
  const rooms: Record<string, Room> = {};
  const mk = (k: string, type: RoomType, name: string, text: string, scene: string, extra: Partial<Room> = {}): Room => {
    const [x, y] = k.split(',').map(Number);
    const r: Room = { key: k, x, y, type, name, text, exits: {}, tags: [], art: `scenes/docks_${scene}`, ...extra };
    rooms[k] = r;
    return r;
  };
  const link = (a: string, dir: Facing, b: string, lock?: 'sigil') => {
    rooms[a].exits[dir] = { to: b, lock };
    rooms[b].exits[OPPOSITE[dir]] = { to: a, lock };
  };

  mk(TUT.entrance, 'entrance', 'Boarding Tube', 'Your derelict trader\'s boarding tube clamps onto the Fortress hull with a shriek of metal. The enclave folk call this spur "the Nursery": everyone\'s first venture starts here.', 'corridor');
  mk(TUT.tunnel, 'corridor', 'Docking Spine', 'Frost on every surface. Somewhere ahead, a gretchin is counting stolen dice out loud, badly.', 'corridor');
  mk(TUT.fight, 'combat', 'Cargo Hold', 'Two gretchin look up from a pile of dice. They do not look pleased to see you.', 'hold',
    { encounter: { monsters: ['gretchin', 'gretchin'], kind: 'normal', cleared: false } });
  mk(TUT.treasure, 'treasure', 'Purser\'s Locker', 'A dented strongbox sits under a cargo net. Somebody forgot to lock it.', 'vault',
    { loot: { gold: 1, items: ['item'], charm: true, taken: false } });
  mk(TUT.kiln, 'key', 'Harbourmaster\'s Office', 'A key of blackstone floats above a plinth. The hatch beyond it is sealed with the same black glass.', 'vault', { eventId: 'sigilKey' });
  mk(TUT.boss, 'boss', 'The Nursery Throne', 'A rusted cargo-servitor wearing a captain\'s hat squats on a throne of crates. The enclave keeps it here to blood new crews. Mostly.', 'boss',
    { encounter: { monsters: ['rogueServitor'], kind: 'boss', cleared: false } });

  link(TUT.entrance, 'N', TUT.tunnel);
  link(TUT.tunnel, 'N', TUT.fight);
  link(TUT.fight, 'W', TUT.treasure);
  link(TUT.fight, 'N', TUT.kiln);
  link(TUT.kiln, 'N', TUT.boss, 'sigil');

  return { width: 5, height: 5, rooms, start: TUT.entrance, bossKey: TUT.boss, criticalPath: [TUT.entrance, TUT.tunnel, TUT.fight, TUT.kiln, TUT.boss] };
}
