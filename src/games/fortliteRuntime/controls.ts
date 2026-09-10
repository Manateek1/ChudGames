import type { BuildPieceType } from './types';

const WEAPON_SLOT_KEYS: readonly (readonly string[])[] = [
  ['Digit1', 'Numpad1', '1'],
  ['Digit2', 'Numpad2', '2'],
  ['Digit3', 'Numpad3', '3'],
];

const BUILD_PIECE_KEYS: readonly [string, BuildPieceType][] = [
  ['KeyZ', 'wall'],
  ['KeyX', 'floor'],
  ['KeyC', 'ramp'],
];

export const getRequestedWeaponSlot = (pressedKeys: ReadonlySet<string>): number | null => {
  const slotIndex = WEAPON_SLOT_KEYS.findIndex((keys) => keys.some((key) => pressedKeys.has(key)));
  return slotIndex === -1 ? null : slotIndex;
};

export const getRequestedBuildPiece = (pressedKeys: ReadonlySet<string>): BuildPieceType | null => {
  for (const [key, pieceType] of BUILD_PIECE_KEYS) {
    if (pressedKeys.has(key)) {
      return pieceType;
    }
  }

  return null;
};
