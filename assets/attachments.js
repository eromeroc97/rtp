(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sha256.js'));
  } else {
    root.RTPAttachments = factory(root.RTPHash);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (hashLib) {
  'use strict';

  const MAX_HARD_ATTACHMENT_BYTES = 100 * 1024 * 1024;
  const BASE64_CHUNK = 0x2000;
  const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

  function bytesToBase64(bytes) {
    if (!bytes || bytes.length === 0) {
      return '';
    }
    if (typeof globalThis.btoa !== 'function') {
      throw new Error('base64-unavailable');
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK));
    }
    return globalThis.btoa(binary);
  }

  function base64ToBytes(base64) {
    if (typeof base64 !== 'string' || base64.length % 4 !== 0 || !BASE64_RE.test(base64)) {
      throw new Error('base64-invalid');
    }
    if (base64.length === 0) {
      return new Uint8Array(0);
    }
    if (typeof globalThis.atob !== 'function') {
      throw new Error('base64-unavailable');
    }
    const binary = globalThis.atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  function streamFromBytes(bytes) {
    const Stream = globalThis.ReadableStream;
    if (typeof Stream !== 'function') {
      throw new Error('stream-unavailable');
    }
    return new Stream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });
  }

  async function collectStream(stream, maxBytes) {
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.length;
        if (total > maxBytes) {
          try {
            await reader.cancel();
          } catch (err) {
            // Sin más acciones: el error de tamaño es el relevante.
          }
          throw new Error('stream-too-large');
        }
        chunks.push(chunk);
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (err) {
        // Ignoramos errores al liberar el lector.
      }
    }

    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  async function gzipBytes(bytes) {
    const Compression = globalThis.CompressionStream;
    if (typeof Compression !== 'function') {
      throw new Error('compression-unavailable');
    }
    const stream = streamFromBytes(bytes).pipeThrough(new Compression('gzip'));
    return collectStream(stream, Number.MAX_SAFE_INTEGER);
  }

  async function gunzipBytes(bytes, maxBytes) {
    const Decompression = globalThis.DecompressionStream;
    if (typeof Decompression !== 'function') {
      throw new Error('decompression-unavailable');
    }
    const stream = streamFromBytes(bytes).pipeThrough(new Decompression('gzip'));
    return collectStream(stream, maxBytes);
  }

  async function encodeAttachment(input) {
    const settings = input || {};
    const source = settings.bytes == null ? new Uint8Array(0) : settings.bytes;
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const name = typeof settings.name === 'string' ? settings.name : '';
    const mimeType =
      typeof settings.mimeType === 'string' && settings.mimeType
        ? settings.mimeType
        : 'application/octet-stream';

    const sha256 = await hashLib.sha256Hex(bytes);
    let stored = bytes;
    let compression = 'none';

    if (bytes.length > 0) {
      try {
        const compressed = await gzipBytes(bytes);
        if (compressed.length < bytes.length) {
          stored = compressed;
          compression = 'gzip';
        }
      } catch (err) {
        // Si el navegador no puede comprimir, guardamos el contenido sin comprimir.
      }
    }

    const compressedSha256 = compression === 'gzip' ? await hashLib.sha256Hex(stored) : sha256;

    return {
      name,
      size_bytes: bytes.length,
      mime_type: mimeType,
      sha256,
      content: {
        encoding: 'base64',
        compression,
        original_size_bytes: bytes.length,
        compressed_size_bytes: stored.length,
        compressed_sha256: compressedSha256,
        data: bytesToBase64(stored)
      }
    };
  }

  async function decodeAttachment(attachment, options) {
    const settings = options || {};
    const hardMax = Number.isInteger(settings.maxBytes) ? settings.maxBytes : MAX_HARD_ATTACHMENT_BYTES;

    if (!attachment || typeof attachment !== 'object' || !attachment.content || typeof attachment.content !== 'object') {
      return { valid: false, reason: 'missing-content' };
    }

    const content = attachment.content;
    if (content.encoding !== 'base64') {
      return { valid: false, reason: 'encoding' };
    }
    if (content.compression !== 'gzip' && content.compression !== 'none') {
      return { valid: false, reason: 'compression' };
    }
    if (!Number.isInteger(attachment.size_bytes) || attachment.size_bytes < 0) {
      return { valid: false, reason: 'size' };
    }
    if (attachment.size_bytes > hardMax) {
      return { valid: false, reason: 'original-too-large' };
    }
    if (
      !Number.isInteger(content.original_size_bytes) ||
      content.original_size_bytes !== attachment.size_bytes
    ) {
      return { valid: false, reason: 'original-size' };
    }
    if (!Number.isInteger(content.compressed_size_bytes) || content.compressed_size_bytes < 0) {
      return { valid: false, reason: 'compressed-size' };
    }
    if (content.compressed_size_bytes > hardMax) {
      return { valid: false, reason: 'compressed-too-large' };
    }

    let stored;
    try {
      stored = base64ToBytes(content.data);
    } catch (err) {
      return { valid: false, reason: 'base64' };
    }

    if (stored.length !== content.compressed_size_bytes) {
      return { valid: false, reason: 'compressed-size' };
    }

    const storedHash = await hashLib.sha256Hex(stored);
    if (storedHash !== content.compressed_sha256) {
      return { valid: false, reason: 'compressed-hash' };
    }

    let bytes;
    if (content.compression === 'gzip') {
      try {
        bytes = await gunzipBytes(stored, attachment.size_bytes);
      } catch (err) {
        const reason =
          err && err.message === 'stream-too-large' ? 'decompressed-too-large' : 'decompression';
        return { valid: false, reason };
      }
    } else {
      if (content.compressed_size_bytes !== attachment.size_bytes) {
        return { valid: false, reason: 'compressed-size' };
      }
      bytes = stored;
    }

    if (bytes.length !== attachment.size_bytes) {
      return { valid: false, reason: 'original-size' };
    }

    const originalHash = await hashLib.sha256Hex(bytes);
    if (originalHash !== attachment.sha256) {
      return { valid: false, reason: 'original-hash' };
    }

    return { valid: true, bytes };
  }

  async function verifyAttachment(attachment, options) {
    const result = await decodeAttachment(attachment, options);
    return { valid: result.valid, reason: result.reason || null };
  }

  function summarizeAttachments(entries) {
    const summary = {
      total: 0,
      recoverable: 0,
      withoutContent: 0,
      originalBytes: 0,
      storedBytes: 0
    };

    if (!Array.isArray(entries)) {
      return summary;
    }

    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.attachments)) {
        continue;
      }
      for (const attachment of entry.attachments) {
        summary.total += 1;
        if (attachment && Number.isInteger(attachment.size_bytes)) {
          summary.originalBytes += attachment.size_bytes;
        }
        if (attachment && attachment.content) {
          summary.recoverable += 1;
          if (Number.isInteger(attachment.content.compressed_size_bytes)) {
            summary.storedBytes += attachment.content.compressed_size_bytes;
          }
        } else {
          summary.withoutContent += 1;
        }
      }
    }

    return summary;
  }

  async function verifyRecordAttachments(entries, options) {
    const summary = summarizeAttachments(entries);
    const issues = [];

    if (!Array.isArray(entries)) {
      return Object.assign(summary, {
        valid: false,
        issues: [{ path: 'entries', message: 'La lista de entradas no es válida.' }]
      });
    }

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const attachments = entry && Array.isArray(entry.attachments) ? entry.attachments : [];
      for (let j = 0; j < attachments.length; j += 1) {
        const attachment = attachments[j];
        if (!attachment || !attachment.content) {
          continue;
        }
        const result = await decodeAttachment(attachment, options);
        if (!result.valid) {
          issues.push({
            path: `entries[${i}].attachments[${j}]`,
            message: `No se pudo verificar «${attachment.name || 'adjunto'}»: ${translateReason(
              result.reason
            )}.`
          });
        }
      }
    }

    return Object.assign(summary, { valid: issues.length === 0, issues });
  }

  function translateReason(reason) {
    switch (reason) {
      case 'missing-content':
        return 'no incluye contenido recuperable';
      case 'encoding':
        return 'codificación no soportada';
      case 'compression':
        return 'algoritmo de compresión no soportado';
      case 'size':
        return 'tamaño original inválido';
      case 'original-size':
        return 'el tamaño original no coincide';
      case 'compressed-size':
        return 'el tamaño comprimido no coincide';
      case 'compressed-too-large':
        return 'el contenido comprimido supera el máximo permitido';
      case 'original-too-large':
        return 'el contenido original supera el máximo permitido';
      case 'base64':
        return 'el contenido no es base64 válido';
      case 'compressed-hash':
        return 'la huella del contenido comprimido no coincide';
      case 'decompression':
        return 'no se pudo descomprimir';
      case 'decompressed-too-large':
        return 'el contenido descomprimido supera el tamaño declarado';
      case 'original-hash':
        return 'la huella del archivo original no coincide';
      case 'compression-unavailable':
        return 'el navegador no soporta la compresión';
      case 'decompression-unavailable':
        return 'el navegador no soporta la descompresión';
      default:
        return 'verificación fallida';
    }
  }

  return {
    MAX_HARD_ATTACHMENT_BYTES,
    bytesToBase64,
    base64ToBytes,
    gzipBytes,
    gunzipBytes,
    encodeAttachment,
    decodeAttachment,
    verifyAttachment,
    summarizeAttachments,
    verifyRecordAttachments,
    translateReason
  };
});
