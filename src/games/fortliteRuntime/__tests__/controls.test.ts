import { describe, expect, it } from 'vitest';
import { getRequestedBuildPiece, getRequestedWeaponSlot } from '../controls';

describe('FortLite control bindings', () => {
  it.each([
    ['Digit1', 0],
    ['Numpad2', 1],
    ['3', 2],
  ])('maps %s directly to weapon slot %i', (key, slot) => {
    expect(getRequestedWeaponSlot(new Set([key]))).toBe(slot);
  });

  it('uses stable slot priority when multiple weapon keys arrive in one tick', () => {
    expect(getRequestedWeaponSlot(new Set(['Digit3', 'Digit1']))).toBe(0);
  });

  it.each([
    ['KeyZ', 'wall'],
    ['KeyX', 'floor'],
    ['KeyC', 'ramp'],
  ] as const)('maps %s to the %s build piece', (key, pieceType) => {
    expect(getRequestedBuildPiece(new Set([key]))).toBe(pieceType);
  });

  it('returns null when no direct selection key was pressed', () => {
    const pressedKeys = new Set(['KeyW', 'ShiftLeft']);
    expect(getRequestedWeaponSlot(pressedKeys)).toBeNull();
    expect(getRequestedBuildPiece(pressedKeys)).toBeNull();
  });
});
