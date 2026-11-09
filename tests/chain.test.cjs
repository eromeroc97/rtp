'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const RTPChain = require('../assets/chain.js');
const RTPHash = require('../assets/sha256.js');

const entries = [
  {
    id: 'e-0001',
    occurred_at: '2026-11-09T17:05:00+01:00',
    recorded_at: '2026-11-09T17:05:31.000Z',
    model: { provider: 'OpenAI', name: 'GPT-4o', access: 'paid' },
    attachments: [],
    prompt: 'Primer prompt de prueba.'
  },
  {
    id: 'e-0002',
    occurred_at: '2026-11-09T17:12:00+01:00',
    recorded_at: '2026-11-09T17:12:40.000Z',
    model: { provider: 'Anthropic', name: 'Claude 3.5 Sonnet', access: 'free' },
    attachments: [],
    prompt: 'Segundo prompt de prueba, con una corrección.'
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('SHA-256 coincide con los vectores de prueba conocidos', async () => {
  assert.equal(
    await RTPHash.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  assert.equal(
    await RTPHash.sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
  assert.equal(
    RTPHash.toHex(RTPHash.sha256BytesFallback(RTPHash.utf8Bytes('abc'))),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('la cadena es determinista y verificable', async () => {
  const first = await RTPChain.computeChain(entries);
  const second = await RTPChain.computeChain(entries);

  assert.deepEqual(first, second);
  assert.equal(first[0].prev_hash, 'GENESIS');
  assert.equal(first[1].prev_hash, first[0].hash);

  const result = await RTPChain.verifyChain(first);
  assert.equal(result.valid, true);
  assert.equal(result.chain_head, first[first.length - 1].hash);
});

test('detecta la modificación de un prompt', async () => {
  const chained = await RTPChain.computeChain(entries);
  const tampered = clone(chained);
  tampered[1].prompt += ' (editado fuera de RTP)';

  const result = await RTPChain.verifyChain(tampered);
  assert.equal(result.valid, false);
  assert.equal(result.index, 1);
  assert.equal(result.reason, 'hash');
});

test('detecta el reordenamiento de entradas', async () => {
  const chained = await RTPChain.computeChain(entries);
  const reordered = [chained[1], chained[0]];

  const result = await RTPChain.verifyChain(reordered);
  assert.equal(result.valid, false);
  assert.equal(result.index, 0);
  assert.equal(result.reason, 'sequence');
});

test('detecta un prev_hash manipulado', async () => {
  const chained = await RTPChain.computeChain(entries);
  const tampered = clone(chained);
  tampered[1].prev_hash = 'GENESIS';

  const result = await RTPChain.verifyChain(tampered);
  assert.equal(result.valid, false);
  assert.equal(result.index, 1);
  assert.equal(result.reason, 'prev_hash');
});

test('el record_hash detecta cambios en los metadatos', async () => {
  const record = {
    schema_version: '1.0.0',
    tool: { name: 'RTP', version: '1.0.0' },
    student: { id: 'e.romero' },
    assignment: { id: 'GSyA-2026-P1', title: 'Trabajo', course: '2026/27' },
    declaration: { accepted: true, version: '1.0', accepted_at: '2026-11-09T17:00:00.000Z' },
    entries: await RTPChain.computeChain(entries),
    audit_log: [],
    integrity: {}
  };

  record.integrity = {
    algorithm: 'SHA-256',
    canonicalization: 'json-sorted-keys-v1',
    entry_count: record.entries.length,
    chain_head: record.entries[record.entries.length - 1].hash,
    record_hash: ''
  };
  record.integrity.record_hash = await RTPChain.computeRecordHash(record);

  assert.equal(await RTPChain.verifyRecordHash(record), true);

  record.student.id = 'otro.estudiante';
  assert.equal(await RTPChain.verifyRecordHash(record), false);
});

test('la canonicalización ordena las claves de forma estable', () => {
  const a = RTPChain.canonicalize({ b: 1, a: { d: 2, c: 3 } });
  const b = RTPChain.canonicalize({ a: { c: 3, d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":3,"d":2},"b":1}');
});
