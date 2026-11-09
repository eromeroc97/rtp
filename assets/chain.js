(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sha256.js'));
  } else {
    root.RTPChain = factory(root.RTPHash);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (hashLib) {
  'use strict';

  const GENESIS = 'GENESIS';
  const ALGORITHM = 'SHA-256';
  const CANONICALIZATION = 'json-sorted-keys-v1';

  function sortValue(value) {
    if (Array.isArray(value)) {
      return value.map(sortValue);
    }
    if (value !== null && typeof value === 'object') {
      const out = {};
      const keys = Object.keys(value).sort();
      for (const key of keys) {
        out[key] = sortValue(value[key]);
      }
      return out;
    }
    return value;
  }

  function canonicalize(value) {
    return JSON.stringify(sortValue(value));
  }

  function entryPayload(entry, prevHash) {
    const copy = Object.assign({}, entry);
    delete copy.hash;
    copy.prev_hash = prevHash;
    return copy;
  }

  async function hashEntry(entry, prevHash) {
    return hashLib.sha256Hex(canonicalize(entryPayload(entry, prevHash)));
  }

  async function computeChain(entries) {
    const result = [];
    let prevHash = GENESIS;

    for (let i = 0; i < entries.length; i += 1) {
      const entry = Object.assign({}, entries[i], {
        sequence: i + 1,
        prev_hash: prevHash
      });
      delete entry.hash;
      const hash = await hashLib.sha256Hex(canonicalize(entry));
      entry.hash = hash;
      result.push(entry);
      prevHash = hash;
    }

    return result;
  }

  async function verifyChain(entries) {
    if (!Array.isArray(entries)) {
      return { valid: false, index: -1, reason: 'not-array' };
    }

    let prevHash = GENESIS;

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];

      if (!entry || typeof entry !== 'object') {
        return { valid: false, index: i, reason: 'not-object' };
      }
      if (entry.sequence !== i + 1) {
        return { valid: false, index: i, reason: 'sequence' };
      }
      if (entry.prev_hash !== prevHash) {
        return { valid: false, index: i, reason: 'prev_hash' };
      }

      const expected = await hashEntry(entry, prevHash);
      if (entry.hash !== expected) {
        return { valid: false, index: i, reason: 'hash' };
      }

      prevHash = entry.hash;
    }

    return { valid: true, chain_head: prevHash };
  }

  async function computeRecordHash(record) {
    const copy = Object.assign({}, record);
    delete copy.exported_at;
    delete copy.integrity;
    return hashLib.sha256Hex(canonicalize(copy));
  }

  async function verifyRecordHash(record) {
    if (!record || !record.integrity || typeof record.integrity.record_hash !== 'string') {
      return false;
    }
    const expected = await computeRecordHash(record);
    return expected === record.integrity.record_hash;
  }

  return {
    GENESIS,
    ALGORITHM,
    CANONICALIZATION,
    canonicalize,
    computeChain,
    verifyChain,
    computeRecordHash,
    verifyRecordHash,
    hashEntry
  };
});
