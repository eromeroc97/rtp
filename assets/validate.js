(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RTPValidate = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  const HEX64 = /^[a-f0-9]{64}$/;
  const ENTRY_ID = /^e-[0-9]{4}$/;
  const SEMVER = /^\d+\.\d+\.\d+$/;
  const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
  const SUPPORTED_SCHEMA_VERSIONS = ['1.0.0', '1.1.0'];
  const CONTENT_SCHEMA_VERSION = '1.1.0';

  const AUDIT_TYPES = [
    'entry_created',
    'entry_updated',
    'entry_deleted',
    'entry_restored',
    'record_created',
    'record_updated',
    'record_imported',
    'record_reset'
  ];

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isInteger(value) {
    return typeof value === 'number' && Number.isInteger(value);
  }

  function isIsoDateTime(value) {
    return typeof value === 'string' && ISO_DATETIME.test(value) && !Number.isNaN(Date.parse(value));
  }

  function base64DecodedLength(value) {
    if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64.test(value)) {
      return null;
    }
    const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
    return (value.length / 4) * 3 - padding;
  }

  function checkUnknownKeys(obj, allowed, path, add) {
    for (const key of Object.keys(obj)) {
      if (!allowed.includes(key)) {
        add(path ? `${path}.${key}` : key, `Campo no permitido: «${key}».`);
      }
    }
  }

  function validateAttachmentContent(attachment, ap, add) {
    const content = attachment.content;
    const cp = `${ap}.content`;

    if (!isPlainObject(content)) {
      add(cp, 'El contenido del adjunto debe ser un objeto.');
      return;
    }

    checkUnknownKeys(
      content,
      [
        'encoding',
        'compression',
        'original_size_bytes',
        'compressed_size_bytes',
        'compressed_sha256',
        'data'
      ],
      cp,
      add
    );

    if (content.encoding !== 'base64') {
      add(`${cp}.encoding`, 'La codificación del contenido debe ser «base64».');
    }

    const compressionValid = content.compression === 'gzip' || content.compression === 'none';
    if (!compressionValid) {
      add(`${cp}.compression`, 'La compresión debe ser «gzip» o «none».');
    }

    if (!isInteger(content.original_size_bytes) || content.original_size_bytes < 0) {
      add(`${cp}.original_size_bytes`, 'El tamaño original debe ser un entero no negativo.');
    } else if (isInteger(attachment.size_bytes) && content.original_size_bytes !== attachment.size_bytes) {
      add(`${cp}.original_size_bytes`, 'El tamaño original no coincide con el del adjunto.');
    }

    if (!isInteger(content.compressed_size_bytes) || content.compressed_size_bytes < 0) {
      add(`${cp}.compressed_size_bytes`, 'El tamaño comprimido debe ser un entero no negativo.');
    }

    if (!HEX64.test(content.compressed_sha256 || '')) {
      add(`${cp}.compressed_sha256`, 'La huella del contenido comprimido debe ser hexadecimal de 64 caracteres.');
    }

    const decodedLength = base64DecodedLength(content.data);
    if (decodedLength === null) {
      add(`${cp}.data`, 'El contenido debe ser base64 válido.');
    } else if (isInteger(content.compressed_size_bytes) && decodedLength !== content.compressed_size_bytes) {
      add(`${cp}.data`, 'La longitud del contenido no coincide con el tamaño comprimido declarado.');
    }

    if (content.compression === 'none') {
      if (
        isInteger(attachment.size_bytes) &&
        isInteger(content.compressed_size_bytes) &&
        content.compressed_size_bytes !== attachment.size_bytes
      ) {
        add(
          `${cp}.compressed_size_bytes`,
          'Sin compresión, el tamaño almacenado debe coincidir con el tamaño original.'
        );
      }
      if (
        HEX64.test(attachment.sha256 || '') &&
        HEX64.test(content.compressed_sha256 || '') &&
        content.compressed_sha256 !== attachment.sha256
      ) {
        add(
          `${cp}.compressed_sha256`,
          'Sin compresión, la huella almacenada debe coincidir con la huella original.'
        );
      }
    }
  }

  function validateRecord(record) {
    const errors = [];
    const warnings = [];
    const add = (path, message) => errors.push({ path, message });
    const warn = (path, message) => warnings.push({ path, message });

    if (!isPlainObject(record)) {
      add('', 'El registro debe ser un objeto JSON.');
      return { valid: false, errors, warnings };
    }

    const topLevelKeys = [
      'schema_version',
      'tool',
      'exported_at',
      'student',
      'assignment',
      'declaration',
      'entries',
      'audit_log',
      'integrity'
    ];
    const required = topLevelKeys.slice();
    for (const key of required) {
      if (!(key in record)) {
        add(key, `Falta el campo obligatorio «${key}».`);
      }
    }
    checkUnknownKeys(record, topLevelKeys, '', add);

    if (!SUPPORTED_SCHEMA_VERSIONS.includes(record.schema_version)) {
      add('schema_version', 'La versión de esquema debe ser 1.0.0 o 1.1.0.');
    }

    if (isPlainObject(record.tool)) {
      checkUnknownKeys(record.tool, ['name', 'version'], 'tool', add);
      if (record.tool.name !== 'RTP') {
        add('tool.name', 'El nombre de la herramienta debe ser RTP.');
      }
      if (!SEMVER.test(record.tool.version || '')) {
        add('tool.version', 'La versión de la herramienta debe tener formato semver.');
      }
    } else {
      add('tool', 'El campo «tool» debe ser un objeto.');
    }

    if (!isIsoDateTime(record.exported_at)) {
      add('exported_at', 'La fecha de exportación debe ser ISO 8601.');
    }

    if (isPlainObject(record.student)) {
      checkUnknownKeys(record.student, ['id', 'name'], 'student', add);
      if (!isNonEmptyString(record.student.id)) {
        add('student.id', 'El identificador del estudiante es obligatorio.');
      } else if (record.student.id.length > 64) {
        add('student.id', 'El identificador del estudiante no puede superar 64 caracteres.');
      }
      if (record.student.name !== undefined) {
        if (typeof record.student.name !== 'string' || record.student.name.length > 120) {
          add('student.name', 'El nombre del estudiante no puede superar 120 caracteres.');
        }
      }
    } else {
      add('student', 'El campo «student» debe ser un objeto.');
    }

    if (isPlainObject(record.assignment)) {
      checkUnknownKeys(record.assignment, ['id', 'title', 'course'], 'assignment', add);
      if (!isNonEmptyString(record.assignment.id)) {
        add('assignment.id', 'El identificador del trabajo es obligatorio.');
      } else if (record.assignment.id.length > 64) {
        add('assignment.id', 'El identificador del trabajo no puede superar 64 caracteres.');
      }
      if (!isNonEmptyString(record.assignment.title)) {
        add('assignment.title', 'El título del trabajo es obligatorio.');
      } else if (record.assignment.title.length > 200) {
        add('assignment.title', 'El título del trabajo no puede superar 200 caracteres.');
      }
      if (!isNonEmptyString(record.assignment.course)) {
        add('assignment.course', 'El curso es obligatorio.');
      } else if (record.assignment.course.length > 20) {
        add('assignment.course', 'El curso no puede superar 20 caracteres.');
      }
    } else {
      add('assignment', 'El campo «assignment» debe ser un objeto.');
    }

    if (isPlainObject(record.declaration)) {
      checkUnknownKeys(record.declaration, ['accepted', 'version', 'accepted_at'], 'declaration', add);
      if (record.declaration.accepted !== true) {
        add('declaration.accepted', 'Debes aceptar la declaración de autoría y veracidad.');
      }
      if (!isNonEmptyString(record.declaration.version)) {
        add('declaration.version', 'La versión de la declaración es obligatoria.');
      }
      if (!isIsoDateTime(record.declaration.accepted_at)) {
        add('declaration.accepted_at', 'La fecha de aceptación debe ser ISO 8601.');
      }
    } else {
      add('declaration', 'El campo «declaration» debe ser un objeto.');
    }

    if (!Array.isArray(record.entries)) {
      add('entries', 'El campo «entries» debe ser un array.');
    } else if (record.entries.length === 0) {
      add('entries', 'Debe haber al menos una iteración registrada.');
    } else {
      const seenIds = new Set();
      let previousTime = null;

      record.entries.forEach((entry, index) => {
        const p = `entries[${index}]`;

        if (!isPlainObject(entry)) {
          add(p, 'La iteración debe ser un objeto.');
          return;
        }

        checkUnknownKeys(
          entry,
          ['id', 'sequence', 'occurred_at', 'recorded_at', 'model', 'attachments', 'prompt', 'prev_hash', 'hash'],
          p,
          add
        );

        if (!ENTRY_ID.test(entry.id || '')) {
          add(`${p}.id`, 'El identificador debe tener el formato e-0001.');
        } else if (seenIds.has(entry.id)) {
          add(`${p}.id`, `El identificador ${entry.id} está duplicado.`);
        } else {
          seenIds.add(entry.id);
        }

        if (!isInteger(entry.sequence) || entry.sequence < 1) {
          add(`${p}.sequence`, 'La secuencia debe ser un entero positivo.');
        } else if (entry.sequence !== index + 1) {
          add(`${p}.sequence`, `La secuencia debe ser ${index + 1}.`);
        }

        if (!isIsoDateTime(entry.occurred_at)) {
          add(`${p}.occurred_at`, 'La fecha de la interacción debe ser ISO 8601 con zona horaria.');
        }
        if (!isIsoDateTime(entry.recorded_at)) {
          add(`${p}.recorded_at`, 'La fecha de registro debe ser ISO 8601.');
        }

        if (isIsoDateTime(entry.occurred_at) && isIsoDateTime(entry.recorded_at)) {
          const occurred = Date.parse(entry.occurred_at);
          const recorded = Date.parse(entry.recorded_at);
          if (recorded + 5 * 60 * 1000 < occurred) {
            add(`${p}.recorded_at`, 'La fecha de registro no puede ser anterior a la interacción.');
          }
          if (previousTime !== null && occurred < previousTime) {
            add(`${p}.occurred_at`, 'Las iteraciones deben estar ordenadas cronológicamente.');
          }
          previousTime = occurred;
        }

        if (isPlainObject(entry.model)) {
          checkUnknownKeys(entry.model, ['provider', 'name', 'access'], `${p}.model`, add);
          if (!isNonEmptyString(entry.model.name)) {
            add(`${p}.model.name`, 'El modelo es obligatorio.');
          } else if (entry.model.name.length > 120) {
            add(`${p}.model.name`, 'El nombre del modelo no puede superar 120 caracteres.');
          }
          if (entry.model.provider !== undefined) {
            if (typeof entry.model.provider !== 'string' || entry.model.provider.length > 80) {
              add(`${p}.model.provider`, 'El proveedor no puede superar 80 caracteres.');
            }
          }
          if (entry.model.access !== 'free' && entry.model.access !== 'paid') {
            add(`${p}.model.access`, 'El acceso debe ser «free» o «paid».');
          }
        } else {
          add(`${p}.model`, 'El campo «model» debe ser un objeto.');
        }

        if (!Array.isArray(entry.attachments)) {
          add(`${p}.attachments`, 'El campo «attachments» debe ser un array.');
        } else {
          if (entry.attachments.length > 20) {
            add(`${p}.attachments`, 'No puede haber más de 20 adjuntos por iteración.');
          }
          entry.attachments.forEach((attachment, attachmentIndex) => {
            const ap = `${p}.attachments[${attachmentIndex}]`;
            if (!isPlainObject(attachment)) {
              add(ap, 'El adjunto debe ser un objeto.');
              return;
            }
            const allowsContent = record.schema_version === CONTENT_SCHEMA_VERSION;
            checkUnknownKeys(
              attachment,
              allowsContent
                ? ['name', 'size_bytes', 'mime_type', 'sha256', 'content']
                : ['name', 'size_bytes', 'mime_type', 'sha256'],
              ap,
              add
            );
            if (!isNonEmptyString(attachment.name)) {
              add(`${ap}.name`, 'El nombre del adjunto es obligatorio.');
            } else if (attachment.name.length > 255) {
              add(`${ap}.name`, 'El nombre del adjunto no puede superar 255 caracteres.');
            }
            if (!isInteger(attachment.size_bytes) || attachment.size_bytes < 0) {
              add(`${ap}.size_bytes`, 'El tamaño debe ser un entero no negativo.');
            }
            if (!isNonEmptyString(attachment.mime_type)) {
              add(`${ap}.mime_type`, 'El tipo MIME es obligatorio.');
            } else if (attachment.mime_type.length > 120) {
              add(`${ap}.mime_type`, 'El tipo MIME no puede superar 120 caracteres.');
            }
            if (!HEX64.test(attachment.sha256 || '')) {
              add(`${ap}.sha256`, 'La huella SHA-256 debe ser hexadecimal de 64 caracteres.');
            }
            if (attachment.content !== undefined) {
              if (!allowsContent) {
                add(
                  `${ap}.content`,
                  'El contenido de los adjuntos requiere la versión de esquema 1.1.0.'
                );
              } else {
                validateAttachmentContent(attachment, ap, add);
              }
            }
          });
        }

        if (!isNonEmptyString(entry.prompt)) {
          add(`${p}.prompt`, 'El texto del prompt es obligatorio.');
        } else if (entry.prompt.length > 100000) {
          add(`${p}.prompt`, 'El prompt no puede superar 100.000 caracteres.');
        }

        if (!/^(GENESIS|[a-f0-9]{64})$/.test(entry.prev_hash || '')) {
          add(`${p}.prev_hash`, 'El hash previo no es válido.');
        }
        if (!HEX64.test(entry.hash || '')) {
          add(`${p}.hash`, 'El hash de la entrada no es válido.');
        }
      });
    }

    if (!Array.isArray(record.audit_log)) {
      add('audit_log', 'El campo «audit_log» debe ser un array.');
    } else {
      record.audit_log.forEach((event, index) => {
        const p = `audit_log[${index}]`;
        if (!isPlainObject(event)) {
          add(p, 'El evento de auditoría debe ser un objeto.');
          return;
        }
        checkUnknownKeys(
          event,
          [
            'type',
            'at',
            'entry_id',
            'changed_fields',
            'source',
            'chain_valid',
            'record_hash_valid',
            'attachments_valid',
            'note'
          ],
          p,
          add
        );
        if (!AUDIT_TYPES.includes(event.type)) {
          add(`${p}.type`, 'Tipo de evento de auditoría no válido.');
        }
        if (!isIsoDateTime(event.at)) {
          add(`${p}.at`, 'La fecha del evento debe ser ISO 8601.');
        }
        if (event.entry_id !== undefined && !ENTRY_ID.test(event.entry_id)) {
          add(`${p}.entry_id`, 'El identificador de entrada no es válido.');
        }
        if (event.changed_fields !== undefined) {
          if (!Array.isArray(event.changed_fields) || event.changed_fields.some((field) => typeof field !== 'string')) {
            add(`${p}.changed_fields`, '«changed_fields» debe ser un array de cadenas.');
          }
        }
        if (event.source !== undefined && typeof event.source !== 'string') {
          add(`${p}.source`, '«source» debe ser una cadena.');
        }
        if (event.chain_valid !== undefined && typeof event.chain_valid !== 'boolean') {
          add(`${p}.chain_valid`, '«chain_valid» debe ser booleano.');
        }
        if (event.record_hash_valid !== undefined && typeof event.record_hash_valid !== 'boolean') {
          add(`${p}.record_hash_valid`, '«record_hash_valid» debe ser booleano.');
        }
        if (event.attachments_valid !== undefined && typeof event.attachments_valid !== 'boolean') {
          add(`${p}.attachments_valid`, '«attachments_valid» debe ser booleano.');
        }
        if (event.note !== undefined && typeof event.note !== 'string') {
          add(`${p}.note`, '«note» debe ser una cadena.');
        }
      });
    }

    if (isPlainObject(record.integrity)) {
      checkUnknownKeys(
        record.integrity,
        ['algorithm', 'canonicalization', 'entry_count', 'chain_head', 'record_hash'],
        'integrity',
        add
      );
      if (record.integrity.algorithm !== 'SHA-256') {
        add('integrity.algorithm', 'El algoritmo debe ser SHA-256.');
      }
      if (record.integrity.canonicalization !== 'json-sorted-keys-v1') {
        add('integrity.canonicalization', 'La canonicalización debe ser json-sorted-keys-v1.');
      }
      if (!isInteger(record.integrity.entry_count) || record.integrity.entry_count < 1) {
        add('integrity.entry_count', 'El número de entradas debe ser un entero positivo.');
      } else if (Array.isArray(record.entries) && record.integrity.entry_count !== record.entries.length) {
        add('integrity.entry_count', 'El número de entradas no coincide con «entries».');
      }
      if (!HEX64.test(record.integrity.chain_head || '')) {
        add('integrity.chain_head', 'El «chain_head» no es válido.');
      }
      if (!HEX64.test(record.integrity.record_hash || '')) {
        add('integrity.record_hash', 'El «record_hash» no es válido.');
      }
    } else {
      add('integrity', 'El campo «integrity» debe ser un objeto.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  return {
    validateRecord,
    isIsoDateTime,
    SUPPORTED_SCHEMA_VERSIONS
  };
});
