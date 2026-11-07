import assert from 'node:assert/strict';
import test from 'node:test';
import { horizontalPetPath, isShortPetJump, petSurfaceLanding } from './PetWandererGeometry';

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


test('landing feet touch the bubble top at every responsive size', () => {
  for (const width of [390, 768, 1440]) {
    const rect = {left:16, right:width-16, top:200, bottom:500};
    const point = petSurfaceLanding(rect, [], width)!;
    assert.equal(point.y + 72, rect.top);
    assert.ok(point.x >= rect.left && point.x + 72 <= rect.right);
  }
});
test('never lands through a neighbouring bubble in a narrow row gap', () => {
  const target = {left:16, right:374, top:414, bottom:600};
  assert.equal(petSurfaceLanding(target, [{left:16,right:374,top:180,bottom:400}],390),null);
});
test('chooses a clear part of the edge and rejects clipped tops', () => {
  const target = {left:100, right:700, top:200, bottom:500};
  const point = petSurfaceLanding(target,[{left:280,right:520,top:100,bottom:190}],800)!;
  assert.ok(point.x + 72 <= 280 || point.x >= 520);
  assert.equal(petSurfaceLanding({...target,top:60},[],800),null);
});
