import assert from 'node:assert/strict';
import test from 'node:test';
import { horizontalPetPath, isShortPetJump } from './PetWandererGeometry';

test('walks horizontally between positions within a desktop viewport', () => {
  const end = { x: 400, y: 628 };
  assert.deepEqual(horizontalPetPath({ x: 1196, y: 628 }, end, 1280, 720), [end]);
});

test('walking rejects vertical moves and points outside the screen', () => {
  assert.equal(horizontalPetPath({ x: 100, y: 100 }, { x: 200, y: 101 }, 390, 844), null);
  assert.equal(horizontalPetPath({ x: 100, y: 100 }, { x: 390, y: 100 }, 390, 844), null);
});

test('only short jumps can change height', () => {
  assert.equal(isShortPetJump({ x: 100, y: 300 }, { x: 110, y: 200 }), true);
  assert.equal(isShortPetJump({ x: 100, y: 300 }, { x: 110, y: 199 }), false);
});
