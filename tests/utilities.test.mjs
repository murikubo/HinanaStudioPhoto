import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageSize, cropPreset, nudgePosition, pixelHex } from '../src/editorUtilities.ts';

test('canvas/export dimensions: rounded, nonzero and bounded allocation', () => {
  assert.deepEqual(imageSize(1920, 1080, 50), { width: 960, height: 540 });
  assert.deepEqual(imageSize(1, 1, 25), { width: 1, height: 1 });
  assert.deepEqual(imageSize(101, 51, 150), { width: 152, height: 77 });
  for (const args of [[0,1],[-1,100],[NaN,100],[Infinity,10],[1920,1080,0],[16385,10],[9000,9000],[10000,100,200]]) assert.throws(() => imageSize(...args));
});
test('crop presets stay centered and inside portrait and landscape images', () => {
  for (const [w,h] of [[1448,1086],[1080,1920],[1,1]]) for (const ratio of [1,4/3,3/4,16/9,9/16,w/h]) {
    const c = cropPreset(w,h,ratio);
    assert.ok(c.x >= -1e-10 && c.y >= -1e-10);
    assert.ok(c.x + c.width <= 100 + 1e-10 && c.y + c.height <= 100 + 1e-10);
    assert.ok(Math.abs((c.width*w)/(c.height*h) - ratio) < 1e-10);
    assert.ok(Math.abs(c.x + c.width/2 - 50) < 1e-10);
    assert.ok(Math.abs(c.y + c.height/2 - 50) < 1e-10);
  }
  assert.throws(() => cropPreset(100,0,1));
});
test('nudge uses document pixels, including fast shift increments', () => {
  assert.deepEqual(nudgePosition(2,3,'ArrowLeft',false), {x:1,y:3});
  assert.deepEqual(nudgePosition(2,3,'ArrowDown',true), {x:2,y:13});
  assert.deepEqual(nudgePosition(2,3,'ArrowUp',true), {x:2,y:-7});
  assert.deepEqual(nudgePosition(2,3,'ArrowRight',false), {x:3,y:3});
});
test('eyedropper formats zero-padded RGB and ignores fully transparent pixels', () => {
  assert.equal(pixelHex([0,15,255,255]), '#000fff');
  assert.equal(pixelHex([255,198,57,128]), '#ffc639');
  assert.equal(pixelHex([255,198,57,0]), null);
});
