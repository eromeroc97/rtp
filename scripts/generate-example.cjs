'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RTPChain = require('../assets/chain.js');
const RTPValidate = require('../assets/validate.js');
const RTPAttachments = require('../assets/attachments.js');
const CONFIG = require('../assets/config.js');

const EXPORTED_AT = '2026-11-09T18:42:11.000Z';

async function main() {
  const attachmentBytes = new TextEncoder().encode(
    [
      '%PDF-1.4',
      '% Ejemplo didáctico de RTP: contenido mínimo recuperable.',
      '1 0 obj',
      '<< /Type /Catalog /Pages 2 0 R >>',
      'endobj',
      '2 0 obj',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      'endobj',
      '3 0 obj',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
      'endobj',
      'trailer',
      '<< /Root 1 0 R >>',
      '%%EOF'
    ].join('\n')
  );
  const attachment = await RTPAttachments.encodeAttachment({
    name: 'apuntes_tema3.pdf',
    mimeType: 'application/pdf',
    bytes: attachmentBytes
  });

  const entries = [
    {
      id: 'e-0001',
      sequence: 1,
      occurred_at: '2026-11-09T17:05:00+01:00',
      recorded_at: '2026-11-09T17:05:31.000Z',
      model: { provider: 'OpenAI', name: 'GPT-4o', access: 'paid' },
      attachments: [attachment],
      prompt:
        'Actúa como revisor académico. A partir de estos apuntes, identifica las tres ideas principales sobre evaluación procesal y señala qué evidencias faltan para sostener cada una.'
    },
    {
      id: 'e-0002',
      sequence: 2,
      occurred_at: '2026-11-09T17:12:00+01:00',
      recorded_at: '2026-11-09T17:12:40.000Z',
      model: { provider: 'OpenAI', name: 'GPT-4o', access: 'paid' },
      attachments: [],
      prompt:
        'La afirmación anterior sobre la validez de los detectores de IA es demasiado general. Corrige el argumento y cita al menos dos limitaciones metodológicas que deberían aparecer en la memoria.'
    },
    {
      id: 'e-0003',
      sequence: 3,
      occurred_at: '2026-11-09T17:20:00+01:00',
      recorded_at: '2026-11-09T17:20:22.000Z',
      model: { provider: 'Anthropic', name: 'Claude 3.5 Sonnet', access: 'free' },
      attachments: [],
      prompt:
        'Compara las dos posturas anteriores y propone una síntesis de 120 palabras que pueda incluirse en el apartado de discusión, manteniendo las referencias y sin añadir afirmaciones nuevas.'
    }
  ];

  const chained = await RTPChain.computeChain(entries);

  const record = {
    schema_version: CONFIG.schemaVersion,
    tool: { name: CONFIG.appName, version: CONFIG.version },
    exported_at: EXPORTED_AT,
    student: { id: 'e.romero', name: 'Eugenio Romero Ciudad' },
    assignment: {
      id: 'GSyA-2026-P1',
      title: 'Trabajo de investigación teórica',
      course: '2026/27'
    },
    declaration: {
      accepted: true,
      version: CONFIG.declaration.version,
      accepted_at: '2026-11-09T17:00:00.000Z'
    },
    entries: chained,
    audit_log: [
      { type: 'record_created', at: '2026-11-09T17:00:00.000Z' },
      { type: 'entry_created', at: '2026-11-09T17:05:31.000Z', entry_id: 'e-0001' },
      { type: 'entry_created', at: '2026-11-09T17:12:40.000Z', entry_id: 'e-0002' },
      { type: 'entry_created', at: '2026-11-09T17:20:22.000Z', entry_id: 'e-0003' }
    ],
    integrity: {
      algorithm: RTPChain.ALGORITHM,
      canonicalization: RTPChain.CANONICALIZATION,
      entry_count: chained.length,
      chain_head: chained[chained.length - 1].hash,
      record_hash: ''
    }
  };

  record.integrity.record_hash = await RTPChain.computeRecordHash(record);

  const result = RTPValidate.validateRecord(record);
  if (!result.valid) {
    console.error('El ejemplo generado no es válido:');
    console.error(result.errors);
    process.exitCode = 1;
    return;
  }

  const outPath = path.join(__dirname, '..', 'examples', 'ejemplo-traza.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
  console.log('Ejemplo generado en', outPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
