'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RTPValidate = require('../assets/validate.js');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const examplePath = path.join(__dirname, '..', 'examples', 'ejemplo-traza.json');
const schemaPath = path.join(__dirname, '..', 'schema', 'trace.schema.json');

const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function paths(result) {
  return result.errors.map((error) => error.path);
}

test('el ejemplo cumple el validador de la aplicación', () => {
  const result = RTPValidate.validateRecord(example);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('el ejemplo cumple el JSON Schema con Ajv', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const ok = validate(example);
  assert.equal(ok, true, JSON.stringify(validate.errors, null, 2));
});

test('rechaza la falta de student.id', () => {
  const record = clone(example);
  delete record.student.id;
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('student.id'));
});

test('rechaza un tipo de acceso no permitido', () => {
  const record = clone(example);
  record.entries[0].model.access = 'trial';
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('entries[0].model.access'));
});

test('rechaza entradas desordenadas cronológicamente', () => {
  const record = clone(example);
  record.entries[1].occurred_at = '2026-11-09T16:00:00+01:00';
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('entries[1].occurred_at'));
});

test('rechaza identificadores duplicados', () => {
  const record = clone(example);
  record.entries[1].id = 'e-0001';
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('entries[1].id'));
});

test('rechaza una secuencia incorrecta', () => {
  const record = clone(example);
  record.entries[1].sequence = 5;
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('entries[1].sequence'));
});

test('rechaza un hash mal formado', () => {
  const record = clone(example);
  record.entries[0].hash = 'abc';
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('entries[0].hash'));
});

test('rechaza propiedades no permitidas', () => {
  const record = clone(example);
  record.extra = true;
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('extra'));
});

test('rechaza una declaración no aceptada', () => {
  const record = clone(example);
  record.declaration.accepted = false;
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('declaration.accepted'));
});

test('rechaza un recuento de entradas incoherente', () => {
  const record = clone(example);
  record.integrity.entry_count = 99;
  const result = RTPValidate.validateRecord(record);
  assert.equal(result.valid, false);
  assert.ok(paths(result).includes('integrity.entry_count'));
});

test('valida correctamente fechas ISO 8601', () => {
  assert.equal(RTPValidate.isIsoDateTime('2026-11-09T17:05:00+01:00'), true);
  assert.equal(RTPValidate.isIsoDateTime('2026-11-09T17:05:00.123Z'), true);
  assert.equal(RTPValidate.isIsoDateTime('2026-11-09 17:05:00'), false);
  assert.equal(RTPValidate.isIsoDateTime('no-es-una-fecha'), false);
});
