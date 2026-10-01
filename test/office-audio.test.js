const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function audioHarness() {
  const calls = [];
  const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 });
  const node = () => ({ connect() {}, start() { calls.push('start'); }, stop() {}, frequency: param(), gain: param(), pan: param(), type: '' });
  class AudioContext {
    constructor() { calls.push('context'); this.sampleRate = 8000; this.currentTime = 1; this.destination = node(); this.state = 'running'; }
    createBuffer(channels, length) { calls.push('buffer'); return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() { return node(); }
    createBiquadFilter() { return node(); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createStereoPanner() { return node(); }
  }
  const window = { AudioContext };
  let clock = 1000;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/js/office-audio.js'), 'utf8'), { window, Math, performance: { now: () => clock } });
  return { audio: new window.DesklyOfficeAudio(), calls, advance: ms => { clock += ms; } };
}

test('office sounds start on demand, respect mute, and generate varied action cues', () => {
  const { audio, calls, advance } = audioHarness();
  assert.equal(calls.length, 0);
  audio.setVolume(0);
  assert.equal(audio.play('step'), false);
  assert.equal(calls.length, 0);
  audio.setVolume(0.7);
  for (const sound of ['step', 'pour', 'sip', 'cup', 'chair', 'door', 'printer', 'paper', 'switch', 'lift']) {
    advance(1000);
    assert.equal(audio.play(sound), true, sound);
  }
  assert.equal(calls.filter(x => x === 'context').length, 1);
  assert.ok(calls.filter(x => x === 'start').length > 15);
  assert.ok(calls.includes('buffer'));
});

test('nearby employee footsteps are limited while player footsteps remain available', () => {
  const { audio, advance } = audioHarness();
  assert.equal(audio.play('step', { actor: 'dev' }), true);
  assert.equal(audio.play('step', { actor: 'designer' }), false);
  assert.equal(audio.play('step'), true);
  advance(150);
  assert.equal(audio.play('step', { actor: 'designer' }), true);
});
