'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { webcrypto, createHash } = require('node:crypto');

const RTPChain = require('../assets/chain.js');
const RTPValidate = require('../assets/validate.js');
const RTPAttachments = require('../assets/attachments.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = ['config.js', 'sha256.js', 'chain.js', 'validate.js', 'attachments.js', 'app.js'].map((file) =>
  fs.readFileSync(path.join(root, 'assets', file), 'utf8')
);

async function createApp() {
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => jsdomErrors.push(error));
  virtualConsole.on('error', (message) => jsdomErrors.push(new Error(String(message))));

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole
  });

  const { window } = dom;

  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
  window.TextEncoder = TextEncoder;
  window.TextDecoder = TextDecoder;
  window.ReadableStream = ReadableStream;
  window.CompressionStream = CompressionStream;
  window.DecompressionStream = DecompressionStream;
  window.URL.createObjectURL = () => 'blob:rtp-test';
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() {};

  const dialogProto = (window.HTMLDialogElement || window.HTMLElement).prototype;
  dialogProto.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  dialogProto.close = function close(value) {
    this.removeAttribute('open');
    if (value !== undefined) {
      this.returnValue = value;
    }
    this.dispatchEvent(new window.Event('close'));
  };

  let lastDownloadText = null;
  let lastDownloadParts = null;
  const RealBlob = window.Blob;
  window.Blob = class CapturingBlob extends RealBlob {
    constructor(parts, options) {
      super(parts, options);
      lastDownloadParts = parts;
      lastDownloadText = parts.map(String).join('');
    }
  };

  for (const script of scripts) {
    window.eval(script);
  }

  if (window.document.readyState === 'loading') {
    await new Promise((resolve) => {
      window.document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  return {
    window,
    document: window.document,
    errors: jsdomErrors,
    getDownloadText: () => lastDownloadText,
    getDownloadParts: () => lastDownloadParts
  };
}

function submit(window, form) {
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

function completeSetup(window, document) {
  document.getElementById('setup-student-id').value = 'e.romero';
  document.getElementById('setup-student-name').value = 'Eugenio Romero Ciudad';
  document.getElementById('setup-assignment-id').value = 'GSyA-2026-P1';
  document.getElementById('setup-course').value = '2026/27';
  document.getElementById('setup-assignment-title').value = 'Trabajo de prueba';
  document.getElementById('setup-declaration').checked = true;
  submit(window, document.getElementById('setup-form'));
}

function addEntry(window, document, options) {
  const settings = Object.assign(
    {
      occurred: '2021-02-01T10:00',
      model: 'GPT-4o',
      provider: 'OpenAI',
      access: 'free',
      prompt: 'Prompt de prueba.'
    },
    options || {}
  );

  document.getElementById('btn-new-entry').click();
  document.getElementById('entry-occurred').value = settings.occurred;
  document.getElementById('entry-model').value = settings.model;
  document.getElementById('entry-provider').value = settings.provider;
  const accessInput = document.querySelector(`input[name="access"][value="${settings.access}"]`);
  accessInput.checked = true;
  document.getElementById('entry-prompt').value = settings.prompt;
  submit(window, document.getElementById('entry-form'));
}

async function makePastRecord() {
  const record = {
    schema_version: '1.0.0',
    tool: { name: 'RTP', version: '1.0.0' },
    exported_at: '2021-01-03T10:00:00.000Z',
    student: { id: 'e.romero', name: 'Eugenio Romero Ciudad' },
    assignment: { id: 'GSyA-2026-P1', title: 'Trabajo de prueba', course: '2026/27' },
    declaration: { accepted: true, version: '1.0', accepted_at: '2020-01-01T09:00:00.000Z' },
    entries: [
      {
        id: 'e-0001',
        occurred_at: '2020-01-01T10:00:00+01:00',
        recorded_at: '2020-01-01T10:05:00+01:00',
        model: { name: 'GPT-4o', access: 'free', provider: 'OpenAI' },
        attachments: [],
        prompt: 'Primer prompt de prueba.'
      },
      {
        id: 'e-0002',
        occurred_at: '2020-01-02T10:00:00+01:00',
        recorded_at: '2020-01-02T10:05:00+01:00',
        model: { name: 'Claude 3.5 Sonnet', access: 'paid', provider: 'Anthropic' },
        attachments: [],
        prompt: 'Segundo prompt de prueba.'
      }
    ],
    audit_log: [
      { type: 'record_created', at: '2020-01-01T09:00:00.000Z' },
      { type: 'entry_created', at: '2020-01-01T10:05:00+01:00', entry_id: 'e-0001' },
      { type: 'entry_created', at: '2020-01-02T10:05:00+01:00', entry_id: 'e-0002' }
    ],
    integrity: {
      algorithm: 'SHA-256',
      canonicalization: 'json-sorted-keys-v1',
      entry_count: 2,
      chain_head: '',
      record_hash: ''
    }
  };

  record.entries = await RTPChain.computeChain(record.entries);
  record.integrity.chain_head = record.entries[record.entries.length - 1].hash;
  record.integrity.record_hash = await RTPChain.computeRecordHash(record);
  return record;
}

async function loadJsonFile(window, document, text, name) {
  const file = new window.File([text], name, { type: 'application/json' });
  const input = document.getElementById('import-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function acceptConfirm(window, document) {
  const confirm = document.getElementById('confirm-dialog');
  assert.equal(confirm.hasAttribute('open'), true, 'debe mostrarse el resumen antes de continuar');
  confirm.returnValue = 'ok';
  confirm.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
}

test('la interfaz arranca, crea una iteración y exporta un JSON verificable', async () => {
  const app = await createApp();
  const { window, document } = app;

  assert.equal(document.getElementById('view-setup').hidden, false);
  assert.equal(document.getElementById('view-main').hidden, true);

  document.getElementById('setup-student-id').value = 'e.romero';
  document.getElementById('setup-student-name').value = 'Eugenio Romero Ciudad';
  document.getElementById('setup-assignment-id').value = 'GSyA-2026-P1';
  document.getElementById('setup-course').value = '2026/27';
  document.getElementById('setup-assignment-title').value = 'Trabajo de prueba';
  document.getElementById('setup-declaration').checked = true;
  submit(window, document.getElementById('setup-form'));

  assert.equal(document.getElementById('view-setup').hidden, true);
  assert.equal(document.getElementById('view-main').hidden, false);
  assert.match(document.getElementById('record-context').textContent, /e\.romero/);

  document.getElementById('btn-new-entry').click();
  assert.equal(document.getElementById('entry-dialog').hasAttribute('open'), true);

  document.getElementById('entry-occurred').value = '2020-01-01T10:00';
  document.getElementById('entry-model').value = 'GPT-4o';
  document.getElementById('entry-provider').value = 'OpenAI';
  document.querySelector('input[name="access"][value="paid"]').checked = true;
  document.getElementById('entry-prompt').value = 'Prompt exacto de prueba.';

  const attachmentContent = 'contenido de prueba';
  const attachmentFile = new window.File([attachmentContent], 'apuntes.txt', { type: 'text/plain' });
  const fileInput = document.getElementById('entry-attachments');
  Object.defineProperty(fileInput, 'files', { value: [attachmentFile], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(document.getElementById('attachment-list').children.length, 1);
  assert.match(document.getElementById('attachment-list').textContent, /apuntes\.txt/);

  submit(window, document.getElementById('entry-form'));

  const timeline = document.getElementById('timeline');
  assert.equal(timeline.children.length, 1);
  assert.match(timeline.textContent, /GPT-4o/);
  assert.match(timeline.textContent, /Prompt exacto de prueba\./);
  assert.equal(document.getElementById('empty-state').hidden, true);

  const stored = JSON.parse(window.localStorage.getItem('rtp:v1:draft'));
  const expectedSha = createHash('sha256').update(attachmentContent).digest('hex');
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0].model.access, 'paid');
  assert.equal(stored.entries[0].prompt, 'Prompt exacto de prueba.');
  assert.equal(stored.entries[0].attachments.length, 1);
  assert.equal(stored.entries[0].attachments[0].name, 'apuntes.txt');
  assert.equal(stored.entries[0].attachments[0].size_bytes, Buffer.byteLength(attachmentContent));
  assert.equal(stored.entries[0].attachments[0].sha256, expectedSha);
  const storedContent = stored.entries[0].attachments[0].content;
  assert.ok(storedContent, 'el borrador debe incluir el contenido del adjunto');
  assert.equal(storedContent.encoding, 'base64');
  assert.ok(['gzip', 'none'].includes(storedContent.compression));
  if (storedContent.compression === 'none') {
    assert.equal(storedContent.compressed_sha256, stored.entries[0].attachments[0].sha256);
  }
  assert.equal(storedContent.original_size_bytes, Buffer.byteLength(attachmentContent));
  assert.equal(
    Buffer.from(storedContent.data, 'base64').length,
    storedContent.compressed_size_bytes
  );
  const recovered = await RTPAttachments.decodeAttachment(stored.entries[0].attachments[0]);
  assert.equal(recovered.valid, true);
  assert.equal(Buffer.from(recovered.bytes).toString('utf8'), attachmentContent);

  document.getElementById('btn-export').click();
  await new Promise((resolve) => setTimeout(resolve, 500));

  const text = app.getDownloadText();
  assert.ok(text, 'la exportación debe generar un Blob con el JSON');

  const exported = JSON.parse(text);
  assert.equal(exported.student.id, 'e.romero');
  assert.equal(exported.entries.length, 1);
  assert.equal(exported.integrity.entry_count, 1);
  assert.equal(exported.entries[0].hash, exported.integrity.chain_head);
  assert.equal(exported.entries[0].attachments.length, 1);
  assert.equal(exported.entries[0].attachments[0].sha256, expectedSha);
  assert.ok(exported.entries[0].attachments[0].content);
  assert.equal(exported.schema_version, '1.1.0');

  const validation = RTPValidate.validateRecord(exported);
  assert.deepEqual(validation.errors, []);

  const chain = await RTPChain.verifyChain(exported.entries);
  assert.equal(chain.valid, true);
  assert.equal(await RTPChain.verifyRecordHash(exported), true);

  const ui = JSON.parse(window.localStorage.getItem('rtp:v1:ui'));
  assert.equal(ui.dirtySinceExport, false);
  assert.ok(ui.lastExportAt);
  assert.match(document.getElementById('status-bar').textContent, /Última exportación/);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('importa un JSON válido y reconstruye la traza', async () => {
  const app = await createApp();
  const { window, document } = app;
  const exampleText = fs.readFileSync(path.join(root, 'examples', 'ejemplo-traza.json'), 'utf8');

  const file = new window.File([exampleText], 'ejemplo-traza.json', { type: 'application/json' });
  const input = document.getElementById('import-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  await new Promise((resolve) => setTimeout(resolve, 300));

  const confirm = document.getElementById('confirm-dialog');
  assert.equal(confirm.hasAttribute('open'), true);
  assert.match(document.getElementById('confirm-details').textContent, /ejemplo-traza\.json/);
  assert.match(document.getElementById('confirm-details').textContent, /Iteraciones: 3/);
  assert.match(document.getElementById('confirm-message').textContent, /Revisa el resumen/);
  confirm.returnValue = 'ok';
  confirm.close();
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(document.getElementById('view-main').hidden, false);
  assert.equal(document.getElementById('timeline').children.length, 3);
  assert.match(document.getElementById('record-context').textContent, /e\.romero/);
  assert.match(document.getElementById('status-bar').textContent, /cargado desde/i);
  assert.match(document.getElementById('status-bar').textContent, /ejemplo-traza\.json/);

  const stored = JSON.parse(window.localStorage.getItem('rtp:v1:draft'));
  assert.equal(stored.entries.length, 3);
  assert.equal(stored.entries[0].id, 'e-0001');

  const example = JSON.parse(exampleText);
  assert.equal(stored.entries[0].recorded_at, example.entries[0].recorded_at);

  const ui = JSON.parse(window.localStorage.getItem('rtp:v1:ui'));
  assert.equal(ui.loadedFromFile, true);
  assert.equal(ui.dirtySinceExport, false);
  assert.ok(ui.loadedAt);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('rechaza un JSON que no cumple el esquema', async () => {
  const app = await createApp();
  const { window, document } = app;
  const invalid = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'ejemplo-traza.json'), 'utf8'));
  invalid.student.id = '';

  const file = new window.File([JSON.stringify(invalid)], 'invalido.json', { type: 'application/json' });
  const input = document.getElementById('import-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(document.getElementById('errors-dialog').hasAttribute('open'), true);
  assert.match(document.getElementById('errors-list').textContent, /identificador del estudiante/);
  assert.equal(document.getElementById('timeline').children.length, 0);
  assert.equal(document.getElementById('view-setup').hidden, false);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('no importa por defecto un JSON con la cadena manipulada', async () => {
  const app = await createApp();
  const { window, document } = app;
  const tampered = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'ejemplo-traza.json'), 'utf8'));
  tampered.entries[0].prompt += ' (editado fuera de RTP)';

  const file = new window.File([JSON.stringify(tampered)], 'manipulado.json', { type: 'application/json' });
  const input = document.getElementById('import-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));

  await new Promise((resolve) => setTimeout(resolve, 250));

  const confirm = document.getElementById('confirm-dialog');
  assert.equal(confirm.hasAttribute('open'), true);
  assert.match(document.getElementById('confirm-message').textContent, /cadena de integridad|hash global/);

  confirm.returnValue = 'cancel';
  confirm.close();
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(document.getElementById('timeline').children.length, 0);
  assert.equal(document.getElementById('view-setup').hidden, false);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('el tema claro es el predeterminado y el selector persiste la elección', async () => {
  const app = await createApp();
  const { window, document } = app;

  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(document.getElementById('theme-select').value, 'light');

  const select = document.getElementById('theme-select');
  select.value = 'dark';
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(window.localStorage.getItem('rtp:v1:theme'), 'dark');

  select.value = 'system';
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(document.documentElement.getAttribute('data-theme'), 'system');
  assert.equal(window.localStorage.getItem('rtp:v1:theme'), 'system');

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('la vista previa JSON distingue borrador y registro válido, y copiar no marca como exportado', async () => {
  const app = await createApp();
  const { window, document } = app;

  document.getElementById('btn-view-json').click();
  await new Promise((resolve) => setTimeout(resolve, 500));

  assert.equal(document.getElementById('json-dialog').hasAttribute('open'), true);
  assert.match(document.getElementById('json-status').textContent, /Borrador/);
  assert.equal(document.getElementById('btn-copy-live-json').disabled, true);
  assert.equal(document.getElementById('btn-download-live-json').disabled, true);
  assert.ok(document.getElementById('json-text').value.length > 0);

  document.getElementById('json-dialog').close();
  await new Promise((resolve) => setTimeout(resolve, 100));

  completeSetup(window, document);
  addEntry(window, document, {
    occurred: '2021-02-01T10:00',
    model: 'GPT-4o',
    access: 'free',
    prompt: 'Prompt en vivo.'
  });

  document.getElementById('btn-view-json').click();
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(document.getElementById('btn-copy-live-json').disabled, false);
  assert.equal(document.getElementById('btn-download-live-json').disabled, false);
  assert.match(document.getElementById('json-status').textContent, /válida/i);

  const preview = JSON.parse(document.getElementById('json-text').value);
  assert.equal(preview.entries.length, 1);
  assert.equal(preview.entries[0].prompt, 'Prompt en vivo.');
  assert.deepEqual(RTPValidate.validateRecord(preview).errors, []);
  assert.equal(await RTPChain.verifyRecordHash(preview), true);

  document.getElementById('btn-copy-live-json').click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const afterCopy = JSON.parse(window.localStorage.getItem('rtp:v1:ui'));
  assert.equal(afterCopy.dirtySinceExport, true);
  assert.equal(afterCopy.lastExportAt, null);

  document.getElementById('btn-download-live-json').click();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(app.getDownloadText());
  const afterDownload = JSON.parse(window.localStorage.getItem('rtp:v1:ui'));
  assert.equal(afterDownload.dirtySinceExport, false);
  assert.ok(afterDownload.lastExportAt);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('cargar y continuar conserva los hashes y las fechas de registro originales', async () => {
  const app = await createApp();
  const { window, document } = app;
  const original = await makePastRecord();

  await loadJsonFile(window, document, JSON.stringify(original), 'traza-anterior.json');
  assert.match(document.getElementById('confirm-details').textContent, /traza-anterior\.json/);
  assert.match(document.getElementById('confirm-details').textContent, /Iteraciones: 2/);
  assert.match(document.getElementById('confirm-message').textContent, /Revisa el resumen/);
  await acceptConfirm(window, document);

  assert.match(document.getElementById('status-bar').textContent, /cargado desde/i);
  assert.match(document.getElementById('status-bar').textContent, /traza-anterior\.json/);

  addEntry(window, document, {
    occurred: '2021-03-01T09:30',
    model: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    access: 'paid',
    prompt: 'Iteración añadida tras cargar el archivo.'
  });

  assert.match(document.getElementById('status-bar').textContent, /cambios sin exportar/i);

  document.getElementById('btn-export').click();
  await new Promise((resolve) => setTimeout(resolve, 600));

  const exported = JSON.parse(app.getDownloadText());
  assert.equal(exported.entries.length, original.entries.length + 1);
  for (let i = 0; i < original.entries.length; i += 1) {
    assert.equal(exported.entries[i].hash, original.entries[i].hash, `hash de la entrada ${i + 1}`);
    assert.equal(exported.entries[i].recorded_at, original.entries[i].recorded_at);
  }
  assert.equal(exported.entries[exported.entries.length - 1].prompt, 'Iteración añadida tras cargar el archivo.');
  assert.equal((await RTPChain.verifyChain(exported.entries)).valid, true);
  assert.equal(await RTPChain.verifyRecordHash(exported), true);
  assert.deepEqual(RTPValidate.validateRecord(exported).errors, []);

  const importedEvent = exported.audit_log.find((event) => event.type === 'record_imported');
  assert.ok(importedEvent);
  assert.equal(importedEvent.chain_valid, true);
  assert.equal(importedEvent.record_hash_valid, true);

  const ui = JSON.parse(window.localStorage.getItem('rtp:v1:ui'));
  assert.equal(ui.loadedFromFile, false);
  assert.equal(ui.dirtySinceExport, false);
  assert.ok(ui.lastExportAt);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('cargar un JSON manipulado con confirmación explícita registra el incidente', async () => {
  const app = await createApp();
  const { window, document } = app;
  const tampered = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'ejemplo-traza.json'), 'utf8'));
  tampered.entries[0].prompt += ' (editado fuera de RTP)';

  await loadJsonFile(window, document, JSON.stringify(tampered), 'manipulado.json');
  assert.match(document.getElementById('confirm-message').textContent, /cadena de integridad|hash global/);
  assert.match(document.getElementById('confirm-details').textContent, /Integridad: no verificada/);
  await acceptConfirm(window, document);

  assert.equal(document.getElementById('view-main').hidden, false);
  assert.equal(document.getElementById('timeline').children.length, 3);

  const stored = JSON.parse(window.localStorage.getItem('rtp:v1:draft'));
  const importedEvent = stored.audit_log.find((event) => event.type === 'record_imported');
  assert.ok(importedEvent);
  assert.equal(importedEvent.chain_valid, false);
  assert.equal(importedEvent.record_hash_valid, false);
  assert.match(importedEvent.note, /integridad incompleta/i);

  const ui = JSON.parse(window.localStorage.getItem('rtp:v1:ui'));
  assert.equal(ui.loadedFromFile, true);
  assert.equal(ui.dirtySinceExport, false);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('carga un JSON desde la pantalla de configuración y recupera la declaración', async () => {
  const app = await createApp();
  const { window, document } = app;
  const exampleText = fs.readFileSync(path.join(root, 'examples', 'ejemplo-traza.json'), 'utf8');

  assert.equal(document.getElementById('view-setup').hidden, false);
  assert.equal(document.getElementById('btn-import-setup').hidden, false);

  const input = document.getElementById('import-input');
  let pickerOpened = false;
  input.click = () => {
    pickerOpened = true;
  };
  document.getElementById('btn-import-setup').click();
  assert.equal(pickerOpened, true, 'el botón de configuración debe abrir el selector de archivos');

  await loadJsonFile(window, document, exampleText, 'ejemplo-traza.json');
  assert.equal(document.getElementById('confirm-dialog').hasAttribute('open'), true);
  assert.match(document.getElementById('confirm-details').textContent, /Iteraciones: 3/);
  await acceptConfirm(window, document);

  assert.equal(document.getElementById('view-main').hidden, false);
  assert.equal(document.getElementById('timeline').children.length, 3);

  const stored = JSON.parse(window.localStorage.getItem('rtp:v1:draft'));
  assert.equal(stored.declaration.accepted, true);
  assert.ok(stored.declaration.accepted_at);
  assert.equal(stored.student.id, 'e.romero');

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('la nueva iteración empieza con el prompt vacío y prellena modelo y acceso', async () => {
  const app = await createApp();
  const { window, document } = app;

  completeSetup(window, document);
  addEntry(window, document, {
    occurred: '2021-02-01T10:00',
    model: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    access: 'paid',
    prompt: 'Primer prompt.'
  });

  document.getElementById('btn-new-entry').click();

  assert.equal(document.getElementById('entry-prompt').value, '');
  assert.equal(document.getElementById('entry-model').value, 'Claude 3.5 Sonnet');
  assert.equal(document.getElementById('entry-provider').value, 'Anthropic');
  assert.equal(document.querySelector('input[name="access"]:checked').value, 'paid');
  assert.equal(document.getElementById('attachment-list').children.length, 0);
  assert.equal(document.getElementById('draft-note').hidden, true);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('cerrar el diálogo sin guardar no arrastra el prompt a la siguiente iteración', async () => {
  const app = await createApp();
  const { window, document } = app;

  completeSetup(window, document);
  document.getElementById('btn-new-entry').click();
  document.getElementById('entry-model').value = 'GPT-4o';
  document.getElementById('entry-provider').value = 'OpenAI';
  document.querySelector('input[name="access"][value="free"]').checked = true;
  document.getElementById('entry-prompt').value = 'Prompt que no debe reaparecer.';
  document.getElementById('entry-prompt').dispatchEvent(new window.Event('input', { bubbles: true }));

  await new Promise((resolve) => setTimeout(resolve, 650));

  const draft = JSON.parse(window.localStorage.getItem('rtp:v1:form-draft'));
  assert.ok(draft);
  assert.equal(draft.prompt, undefined);
  assert.equal(draft.attachments, undefined);
  assert.equal(draft.occurred_at, undefined);
  assert.equal(draft.model_name, 'GPT-4o');

  document.getElementById('entry-dialog').close();
  await new Promise((resolve) => setTimeout(resolve, 150));

  document.getElementById('btn-new-entry').click();
  assert.equal(document.getElementById('entry-prompt').value, '');
  assert.equal(document.getElementById('entry-model').value, 'GPT-4o');
  assert.equal(document.querySelector('input[name="access"]:checked').value, 'free');
  assert.equal(document.getElementById('draft-note').hidden, false);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('duplicar conserva el prompt y los adjuntos', async () => {
  const app = await createApp();
  const { window, document } = app;

  completeSetup(window, document);
  document.getElementById('btn-new-entry').click();
  document.getElementById('entry-occurred').value = '2021-02-01T10:00';
  document.getElementById('entry-model').value = 'GPT-4o';
  document.getElementById('entry-provider').value = 'OpenAI';
  document.querySelector('input[name="access"][value="free"]').checked = true;
  document.getElementById('entry-prompt').value = 'Prompt original.';

  const file = new window.File(['contenido'], 'nota.txt', { type: 'text/plain' });
  const fileInput = document.getElementById('entry-attachments');
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  submit(window, document.getElementById('entry-form'));

  const duplicate = Array.from(document.querySelectorAll('#timeline .entry-actions button')).find(
    (button) => button.textContent === 'Duplicar'
  );
  assert.ok(duplicate);
  duplicate.click();

  assert.equal(document.getElementById('entry-dialog').hasAttribute('open'), true);
  assert.equal(document.getElementById('entry-prompt').value, 'Prompt original.');
  assert.equal(document.getElementById('attachment-list').children.length, 1);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('descarga el adjunto recuperado con su nombre y contenido originales', async () => {
  const app = await createApp();
  const { window, document } = app;

  completeSetup(window, document);
  document.getElementById('btn-new-entry').click();
  document.getElementById('entry-occurred').value = '2021-02-01T10:00';
  document.getElementById('entry-model').value = 'GPT-4o';
  document.getElementById('entry-provider').value = 'OpenAI';
  document.querySelector('input[name="access"][value="free"]').checked = true;
  document.getElementById('entry-prompt').value = 'Prompt con adjunto.';

  const content = 'Contenido recuperable del adjunto.';
  const file = new window.File([content], 'recuperable.txt', { type: 'text/plain' });
  const fileInput = document.getElementById('entry-attachments');
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
  fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.match(document.getElementById('attachment-list').textContent, /Recuperable/);
  submit(window, document.getElementById('entry-form'));

  const timeline = document.getElementById('timeline');
  assert.match(timeline.textContent, /Recuperable/);
  const download = Array.from(timeline.querySelectorAll('button')).find(
    (button) => button.textContent === 'Descargar'
  );
  assert.ok(download, 'debe haber un botón de descarga por adjunto');
  download.click();
  await new Promise((resolve) => setTimeout(resolve, 250));

  const parts = app.getDownloadParts();
  assert.ok(parts && parts.length > 0, 'la descarga debe generar un Blob');
  assert.equal(Buffer.from(parts[0]).toString('utf8'), content);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('un registro 1.0.0 se carga y marca los adjuntos sin contenido', async () => {
  const app = await createApp();
  const { window, document } = app;
  const record = await makePastRecord();
  record.entries[0].attachments = [
    {
      name: 'viejo.txt',
      size_bytes: 5,
      mime_type: 'text/plain',
      sha256: createHash('sha256').update('viejo').digest('hex')
    }
  ];
  record.entries = await RTPChain.computeChain(record.entries);
  record.integrity.chain_head = record.entries[record.entries.length - 1].hash;
  record.integrity.record_hash = await RTPChain.computeRecordHash(record);

  await loadJsonFile(window, document, JSON.stringify(record), 'registro-1.0.0.json');
  assert.match(document.getElementById('confirm-details').textContent, /0 recuperables, 1 solo huella/);
  await acceptConfirm(window, document);

  assert.equal(document.getElementById('view-main').hidden, false);
  assert.match(document.getElementById('timeline').textContent, /Solo huella/);
  assert.equal(
    Array.from(document.querySelectorAll('#timeline button')).some(
      (button) => button.textContent === 'Descargar'
    ),
    false
  );
  assert.match(document.getElementById('status-bar').textContent, /solo conservan la huella/);

  const stored = JSON.parse(window.localStorage.getItem('rtp:v1:draft'));
  assert.equal(stored.schema_version, '1.1.0');
  const importedEvent = stored.audit_log.find((event) => event.type === 'record_imported');
  assert.equal(importedEvent.attachments_valid, true);

  const exported = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'ejemplo-traza.json'), 'utf8'));
  assert.equal(RTPValidate.validateRecord(exported).valid, true);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});

test('importar con contenido de adjunto corrupto exige confirmación y lo audita', async () => {
  const app = await createApp();
  const { window, document } = app;
  const record = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'ejemplo-traza.json'), 'utf8'));
  const attachment = record.entries[0].attachments[0];
  attachment.content.data =
    (attachment.content.data[0] === 'A' ? 'B' : 'A') + attachment.content.data.slice(1);
  record.entries = await RTPChain.computeChain(record.entries);
  record.integrity.chain_head = record.entries[record.entries.length - 1].hash;
  record.integrity.record_hash = await RTPChain.computeRecordHash(record);

  await loadJsonFile(window, document, JSON.stringify(record), 'contenido-corrupto.json');
  assert.match(document.getElementById('confirm-message').textContent, /contenido de/i);
  assert.match(document.getElementById('confirm-details').textContent, /Contenido:/);
  await acceptConfirm(window, document);

  const stored = JSON.parse(window.localStorage.getItem('rtp:v1:draft'));
  const importedEvent = stored.audit_log.find((event) => event.type === 'record_imported');
  assert.equal(importedEvent.attachments_valid, false);
  assert.equal(importedEvent.chain_valid, true);
  assert.equal(importedEvent.record_hash_valid, true);

  assert.deepEqual(app.errors.map(String), []);
  window.close();
});
