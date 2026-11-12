'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const RTPAttachments = require('../assets/attachments.js');

function bytes(text) {
  return new TextEncoder().encode(text);
}

test('codifica y recupera un archivo de texto con gzip', async () => {
  const original = bytes('Contenido de prueba con texto repetido. '.repeat(200));
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'apuntes.txt',
    mimeType: 'text/plain',
    bytes: original
  });

  assert.equal(attachment.name, 'apuntes.txt');
  assert.equal(attachment.size_bytes, original.length);
  assert.equal(attachment.mime_type, 'text/plain');
  assert.equal(attachment.content.encoding, 'base64');
  assert.equal(attachment.content.compression, 'gzip');
  assert.equal(attachment.content.original_size_bytes, original.length);
  assert.ok(attachment.content.compressed_size_bytes < original.length);
  assert.match(attachment.content.compressed_sha256, /^[a-f0-9]{64}$/);

  const decoded = await RTPAttachments.decodeAttachment(attachment);
  assert.equal(decoded.valid, true);
  assert.deepEqual(decoded.bytes, original);
});

test('codifica y recupera datos binarios', async () => {
  const original = new Uint8Array(4096);
  for (let i = 0; i < original.length; i += 1) {
    original[i] = (i * 37 + 11) % 256;
  }

  const attachment = await RTPAttachments.encodeAttachment({
    name: 'datos.bin',
    mimeType: 'application/octet-stream',
    bytes: original
  });

  const decoded = await RTPAttachments.decodeAttachment(attachment);
  assert.equal(decoded.valid, true);
  assert.deepEqual(decoded.bytes, original);
});

test('un archivo vacío se guarda sin compresión y se recupera', async () => {
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'vacio.txt',
    mimeType: 'text/plain',
    bytes: new Uint8Array(0)
  });

  assert.equal(attachment.size_bytes, 0);
  assert.equal(attachment.content.compression, 'none');
  assert.equal(attachment.content.compressed_size_bytes, 0);
  assert.equal(attachment.content.compressed_sha256, attachment.sha256);
  assert.equal(attachment.content.data, '');

  const decoded = await RTPAttachments.decodeAttachment(attachment);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.bytes.length, 0);
});

test('usa compression none cuando gzip no reduce el tamaño', async () => {
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'uno.txt',
    mimeType: 'text/plain',
    bytes: bytes('a')
  });

  assert.equal(attachment.content.compression, 'none');
  assert.equal(attachment.content.compressed_size_bytes, attachment.size_bytes);
  assert.equal(attachment.content.compressed_sha256, attachment.sha256);
  assert.equal((await RTPAttachments.decodeAttachment(attachment)).valid, true);
});

test('detecta base64 no válido', async () => {
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'nota.txt',
    mimeType: 'text/plain',
    bytes: bytes('contenido de prueba')
  });
  attachment.content.data = '@@@@';

  const result = await RTPAttachments.verifyAttachment(attachment);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'base64');
});

test('detecta una huella del contenido comprimido incorrecta', async () => {
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'nota.txt',
    mimeType: 'text/plain',
    bytes: bytes('contenido de prueba')
  });
  attachment.content.compressed_sha256 = '0'.repeat(64);

  const result = await RTPAttachments.verifyAttachment(attachment);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'compressed-hash');
});

test('detecta una huella del archivo original incorrecta', async () => {
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'nota.txt',
    mimeType: 'text/plain',
    bytes: bytes('contenido de prueba')
  });
  attachment.sha256 = '0'.repeat(64);

  const result = await RTPAttachments.verifyAttachment(attachment);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'original-hash');
});

test('limita el tamaño descomprimido para evitar bombas', async () => {
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'grande.txt',
    mimeType: 'text/plain',
    bytes: bytes('x'.repeat(50000))
  });
  assert.equal(attachment.content.compression, 'gzip');

  attachment.size_bytes = 10;
  attachment.content.original_size_bytes = 10;

  const result = await RTPAttachments.verifyAttachment(attachment);
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'decompressed-too-large');
});

test('resume y verifica los adjuntos de un registro', async () => {
  const withContent = await RTPAttachments.encodeAttachment({
    name: 'a.txt',
    mimeType: 'text/plain',
    bytes: bytes('archivo con contenido')
  });
  const withoutContent = {
    name: 'b.txt',
    size_bytes: 10,
    mime_type: 'text/plain',
    sha256: '1'.repeat(64)
  };

  const entries = [{ attachments: [withContent, withoutContent] }];
  const summary = RTPAttachments.summarizeAttachments(entries);
  assert.equal(summary.total, 2);
  assert.equal(summary.recoverable, 1);
  assert.equal(summary.withoutContent, 1);

  const result = await RTPAttachments.verifyRecordAttachments(entries);
  assert.equal(result.valid, true);
  assert.deepEqual(result.issues, []);
});
