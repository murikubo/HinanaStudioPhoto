import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transformLayer, cropLayer } from '../src/editorGeometry.ts';
import { readProject, writeProject, validateProject } from '../dist-electron/projectFile.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
const layer = { id: 'text-1', name: '한글 텍스트', kind: 'text', text: '사진 이야기', image: png, visible: true, opacity: 80, x: 70, y: -30, scaleX: 125, scaleY: 75, rotation: 25 };
const project = () => ({ application: 'HINANA STUDIO PHOTO', formatVersion: 1, original: png, fileName: '사진.png', snapshot: { image: png, layers: [{ ...layer }], selectedLayerId: layer.id, adjustments: { brightness: 0, contrast: 0, saturation: 0, temperature: 12, hue: 0 } } });

test('rotation and flips are reversible and retain editable text and pixels', () => {
  assert.deepEqual(transformLayer(transformLayer(layer, 'cw'), 'ccw'), layer);
  assert.deepEqual(transformLayer(transformLayer(layer, 'flipH'), 'flipH'), layer);
  assert.deepEqual(transformLayer(transformLayer(layer, 'flipV'), 'flipV'), layer);
  const cw = transformLayer(layer, 'cw');
  assert.equal(cw.x, 30); assert.equal(cw.y, 70); assert.equal(cw.rotation, 115);
  assert.equal(cw.text, layer.text); assert.equal(cw.image, png);
});
test('crop shifts document origin without rasterizing or resetting transforms', () => {
  const cropped = cropLayer(layer, 1448, 1086, 145, 109, 1158, 869);
  assert.equal(1158 / 2 + cropped.x, 1448 / 2 + layer.x - 145);
  assert.equal(869 / 2 + cropped.y, 1086 / 2 + layer.y - 109);
  assert.equal(cropped.scaleX, 125); assert.equal(cropped.rotation, 25);
  assert.equal(cropped.text, layer.text); assert.equal(cropped.image, png);
});
test('rejects malformed projects, duplicated IDs and invalid transforms', () => {
  assert.throws(() => validateProject('{}'));
  for (const mutate of [p => p.snapshot.layers.push({ ...layer }), p => p.snapshot.layers[0].scaleX = 0, p => p.snapshot.adjustments = {}, p => p.formatVersion = 999]) {
    const p = project(); mutate(p); assert.throws(() => validateProject(JSON.stringify(p)));
  }
});
test('new layer settings validate while legacy projects remain compatible', () => {
  assert.doesNotThrow(() => validateProject(JSON.stringify(project())));
  for (const mode of ['source-over','multiply','screen','overlay','darken','lighten','difference']) {
    const p = project(); p.snapshot.layers[0].blendMode = mode; p.snapshot.layers[0].locked = true;
    assert.doesNotThrow(() => validateProject(JSON.stringify(p)));
  }
  for (const patch of [{locked: 'yes'}, {blendMode: 'invalid'}]) {
    const p = project(); Object.assign(p.snapshot.layers[0], patch);
    assert.throws(() => validateProject(JSON.stringify(p)));
  }
});
test('portable gzip and legacy JSON round-trip; safe overwrite retains previous file on validation failure', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hinanaphoto-test-'));
  const target = path.join(dir, '한글 프로젝트.hinanaphoto');
  try {
    const first = JSON.stringify(project());
    await writeProject(target, first);
    assert.equal((await readFile(target))[0], 0x1f);
    assert.equal(await readProject(target), first);
    const changed = project(); changed.snapshot.layers[0].text = '다른 PC에서도 그대로';
    changed.snapshot.layers[0].locked = true;
    changed.snapshot.layers[0].blendMode = 'multiply';
    const second = JSON.stringify(changed);
    await writeProject(target, second);
    assert.equal(await readProject(target), second);
    await assert.rejects(writeProject(target, '{}'));
    assert.equal(await readProject(target), second);
    assert.deepEqual(await readdir(dir), ['한글 프로젝트.hinanaphoto']);
    await writeFile(target, first, 'utf8');
    assert.equal(await readProject(target), first);
  } finally { await unlink(target).catch(() => {}); await rmdir(dir); }
});
