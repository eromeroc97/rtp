(function () {
  'use strict';

  const CONFIG = window.RTP_CONFIG;
  const Chain = window.RTPChain;
  const Validate = window.RTPValidate;
  const Attachments = window.RTPAttachments;

  const STORAGE_KEY = 'rtp:v1:draft';
  const UI_KEY = 'rtp:v1:ui';
  const FORM_DRAFT_KEY = 'rtp:v1:form-draft';
  const THEME_KEY = 'rtp:v1:theme';
  const THEMES = ['light', 'dark', 'system'];
  const DRAFT_CONTENT_BUDGET = CONFIG.limits.maxDraftContentMB * 1024 * 1024;
  const LIVE_JSON_BUDGET = CONFIG.limits.maxLiveJsonMB * 1024 * 1024;

  const state = {
    record: null,
    view: 'setup',
    setupMode: 'create',
    editingEntryId: null,
    currentAttachments: [],
    lastExportAt: null,
    dirtySinceExport: false,
    loadedFromFile: false,
    loadedFileName: '',
    loadedAt: null,
    storageAvailable: true,
    formDraftTimer: null,
    toastTimer: null,
    skipDraftOnClose: false,
    prefillMode: false,
    hashing: false,
    jsonLive: false,
    jsonRefreshTimer: null,
    jsonRefreshToken: 0,
    liveJsonRecord: null,
    liveJsonValid: false,
    draftContentOmitted: false,
    draftFallbackNotified: false
  };

  const els = {};
  const dateFormatter = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    const attributes = attrs || {};
    for (const key of Object.keys(attributes)) {
      const value = attributes[key];
      if (key === 'class') {
        node.className = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else if (value !== false && value != null) {
        node.setAttribute(key, value);
      }
    }
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child == null) {
        continue;
      }
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function cacheElements() {
    const ids = [
      'view-setup',
      'setup-title',
      'setup-form',
      'setup-student-id',
      'setup-student-name',
      'setup-assignment-id',
      'setup-course',
      'setup-assignment-title',
      'declaration-text',
      'setup-declaration',
      'setup-errors',
      'btn-setup-cancel',
      'btn-import-setup',
      'view-main',
      'record-context',
      'status-bar',
      'stats',
      'btn-new-entry',
      'btn-import',
      'btn-reset',
      'timeline',
      'empty-state',
      'entry-dialog',
      'entry-form',
      'entry-dialog-title',
      'entry-occurred',
      'entry-model',
      'model-options',
      'entry-provider',
      'provider-options',
      'entry-attachments',
      'attachment-status',
      'attachment-list',
      'entry-prompt',
      'prompt-count',
      'draft-note',
      'entry-errors',
      'btn-save-entry',
      'confirm-dialog',
      'confirm-title',
      'confirm-message',
      'confirm-details',
      'confirm-ok',
      'errors-dialog',
      'errors-title',
      'errors-summary',
      'errors-list',
      'json-dialog',
      'json-note',
      'json-status',
      'json-text',
      'btn-select-json',
      'btn-copy-live-json',
      'btn-download-live-json',
      'help-dialog',
      'toast',
      'import-input',
      'btn-help',
      'btn-edit-setup',
      'btn-view-json',
      'theme-select',
      'btn-copy',
      'btn-export'
    ];

    for (const id of ids) {
      els[id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = $(id);
    }
  }

  function init() {
    cacheElements();
    initTheme();
    populateDatalists();
    bindEvents();
    testStorage();
    loadState();
    els.declarationText.textContent = CONFIG.declaration.text;
    els.entryPrompt.maxLength = CONFIG.limits.maxPromptChars;
    render();
    if (!state.storageAvailable) {
      showToast(
        'El almacenamiento local no está disponible. El registro solo se conservará en esta pestaña; exporta el JSON antes de cerrar.',
        'warning',
        10000
      );
    }
  }

  function testStorage() {
    try {
      const key = 'rtp:v1:__test__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      state.storageAvailable = true;
    } catch (err) {
      state.storageAvailable = false;
    }
  }

  function getStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (THEMES.includes(stored)) {
        return stored;
      }
    } catch (err) {
      // Sin almacenamiento: tema claro por defecto.
    }
    return 'light';
  }

  function initTheme() {
    const theme = getStoredTheme();
    document.documentElement.setAttribute('data-theme', theme);
    els.themeSelect.value = theme;
  }

  function handleThemeChange() {
    const theme = THEMES.includes(els.themeSelect.value) ? els.themeSelect.value : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      // El tema se aplica igualmente durante esta sesión.
    }
  }

  function createEmptyRecord() {
    return {
      schema_version: CONFIG.schemaVersion,
      tool: { name: CONFIG.appName, version: CONFIG.version },
      student: { id: '', name: '' },
      assignment: {
        id: CONFIG.defaultAssignment.id,
        title: CONFIG.defaultAssignment.title,
        course: CONFIG.defaultCourse
      },
      declaration: {
        accepted: false,
        version: CONFIG.declaration.version,
        accepted_at: null
      },
      entries: [],
      audit_log: []
    };
  }

  function loadState() {
    let storedRecord = null;
    let storedUi = null;

    if (state.storageAvailable) {
      try {
        storedRecord = localStorage.getItem(STORAGE_KEY);
        storedUi = localStorage.getItem(UI_KEY);
      } catch (err) {
        state.storageAvailable = false;
      }
    }

    if (storedUi) {
      try {
        const parsedUi = JSON.parse(storedUi);
        state.lastExportAt = parsedUi.lastExportAt || null;
        state.dirtySinceExport = Boolean(parsedUi.dirtySinceExport);
        state.loadedFromFile = Boolean(parsedUi.loadedFromFile);
        state.loadedFileName = typeof parsedUi.loadedFileName === 'string' ? parsedUi.loadedFileName : '';
        state.loadedAt = typeof parsedUi.loadedAt === 'string' ? parsedUi.loadedAt : null;
        state.draftContentOmitted = Boolean(parsedUi.draftContentOmitted);
      } catch (err) {
        // Ignoramos un estado de UI corrupto.
      }
    }

    if (storedRecord) {
      try {
        const parsed = JSON.parse(storedRecord);
        const supported = CONFIG.supportedSchemaVersions || [CONFIG.schemaVersion];
        if (parsed && supported.includes(parsed.schema_version)) {
          state.record = normalizeInternalRecord(parsed);
          state.view = isSetupComplete(state.record) ? 'main' : 'setup';
          state.setupMode = state.view === 'setup' ? 'edit' : 'create';
          return;
        }
        showToast('El borrador guardado pertenece a otra versión del esquema. Se ha iniciado un registro nuevo.', 'warning', 8000);
      } catch (err) {
        showToast('No se pudo leer el borrador guardado. Se ha iniciado un registro nuevo.', 'warning', 8000);
      }
    }

    state.record = createEmptyRecord();
    state.view = 'setup';
    state.setupMode = 'create';
  }

  function normalizeInternalRecord(parsed) {
    const record = createEmptyRecord();

    if (parsed.student && typeof parsed.student === 'object') {
      record.student.id = typeof parsed.student.id === 'string' ? parsed.student.id : '';
      record.student.name = typeof parsed.student.name === 'string' ? parsed.student.name : '';
    }

    if (parsed.assignment && typeof parsed.assignment === 'object') {
      record.assignment.id = typeof parsed.assignment.id === 'string' ? parsed.assignment.id : '';
      record.assignment.title = typeof parsed.assignment.title === 'string' ? parsed.assignment.title : '';
      record.assignment.course = typeof parsed.assignment.course === 'string' ? parsed.assignment.course : CONFIG.defaultCourse;
    }

    if (parsed.declaration && typeof parsed.declaration === 'object') {
      record.declaration.accepted = parsed.declaration.accepted === true;
      record.declaration.version = typeof parsed.declaration.version === 'string' ? parsed.declaration.version : CONFIG.declaration.version;
      record.declaration.accepted_at = typeof parsed.declaration.accepted_at === 'string' ? parsed.declaration.accepted_at : null;
    }

    record.audit_log = Array.isArray(parsed.audit_log)
      ? parsed.audit_log.filter((event) => event && typeof event === 'object').map((event) => Object.assign({}, event))
      : [];

    record.entries = Array.isArray(parsed.entries)
      ? parsed.entries
          .filter((entry) => entry && typeof entry === 'object')
          .map(normalizeInternalEntry)
          .filter((entry) => entry.id && entry.occurred_at && entry.prompt)
      : [];

    record.entries = sortEntries(record.entries);
    return record;
  }

  function normalizeInternalEntry(entry) {
    const model = entry.model && typeof entry.model === 'object' ? entry.model : {};
    const normalized = {
      id: typeof entry.id === 'string' ? entry.id : '',
      occurred_at: typeof entry.occurred_at === 'string' ? entry.occurred_at : '',
      recorded_at: typeof entry.recorded_at === 'string' ? entry.recorded_at : new Date().toISOString(),
      model: {
        name: typeof model.name === 'string' ? model.name : '',
        access: model.access === 'paid' ? 'paid' : 'free'
      },
      attachments: Array.isArray(entry.attachments)
        ? entry.attachments
            .filter((attachment) => attachment && typeof attachment === 'object')
            .map(normalizeInternalAttachment)
        : [],
      prompt: typeof entry.prompt === 'string' ? entry.prompt : ''
    };

    if (typeof model.provider === 'string' && model.provider.trim()) {
      normalized.model.provider = model.provider;
    }

    return normalized;
  }

  function normalizeInternalAttachment(attachment) {
    const normalized = {
      name: typeof attachment.name === 'string' ? attachment.name : '',
      size_bytes: Number.isInteger(attachment.size_bytes) ? attachment.size_bytes : 0,
      mime_type: typeof attachment.mime_type === 'string' ? attachment.mime_type : 'application/octet-stream',
      sha256: typeof attachment.sha256 === 'string' ? attachment.sha256 : ''
    };

    if (attachment.content && typeof attachment.content === 'object') {
      const content = attachment.content;
      normalized.content = {
        encoding: typeof content.encoding === 'string' ? content.encoding : '',
        compression: typeof content.compression === 'string' ? content.compression : '',
        original_size_bytes: Number.isInteger(content.original_size_bytes) ? content.original_size_bytes : 0,
        compressed_size_bytes: Number.isInteger(content.compressed_size_bytes)
          ? content.compressed_size_bytes
          : 0,
        compressed_sha256: typeof content.compressed_sha256 === 'string' ? content.compressed_sha256 : '',
        data: typeof content.data === 'string' ? content.data : ''
      };
    }

    return normalized;
  }

  function cloneAttachment(attachment) {
    return normalizeInternalAttachment(attachment);
  }

  function attachmentContentChars(entries) {
    let total = 0;
    if (!Array.isArray(entries)) {
      return total;
    }
    for (const entry of entries) {
      if (!entry || !Array.isArray(entry.attachments)) {
        continue;
      }
      for (const attachment of entry.attachments) {
        if (attachment && attachment.content && typeof attachment.content.data === 'string') {
          total += attachment.content.data.length;
        }
      }
    }
    return total;
  }

  function recordWithoutAttachmentContent(record) {
    return Object.assign({}, record, {
      entries: (record.entries || []).map((entry) =>
        Object.assign({}, entry, {
          attachments: (entry.attachments || []).map((attachment) => {
            const copy = Object.assign({}, attachment);
            delete copy.content;
            return copy;
          })
        })
      )
    });
  }

  function buildUiState() {
    return {
      lastExportAt: state.lastExportAt,
      dirtySinceExport: state.dirtySinceExport,
      loadedFromFile: state.loadedFromFile,
      loadedFileName: state.loadedFileName,
      loadedAt: state.loadedAt,
      draftContentOmitted: state.draftContentOmitted
    };
  }

  function isSetupComplete(record) {
    return Boolean(
      record &&
        record.student &&
        record.student.id.trim() &&
        record.assignment &&
        record.assignment.id.trim() &&
        record.assignment.title.trim() &&
        record.assignment.course.trim() &&
        record.declaration &&
        record.declaration.accepted === true &&
        record.declaration.accepted_at
    );
  }

  function saveState() {
    if (!state.storageAvailable) {
      return;
    }

    const contentChars = attachmentContentChars(state.record.entries);
    const overBudget = contentChars > DRAFT_CONTENT_BUDGET;
    const previousOmitted = state.draftContentOmitted;
    const ui = buildUiState();

    const persist = (record, omitted) => {
      state.draftContentOmitted = omitted;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
      localStorage.setItem(UI_KEY, JSON.stringify(Object.assign({}, ui, { draftContentOmitted: omitted })));
    };

    try {
      if (overBudget) {
        persist(recordWithoutAttachmentContent(state.record), true);
      } else {
        persist(state.record, false);
      }
    } catch (err) {
      try {
        persist(recordWithoutAttachmentContent(state.record), true);
      } catch (fallbackErr) {
        state.storageAvailable = false;
        showToast(
          'No se pudo guardar en el navegador. Exporta el JSON antes de cerrar la pestaña.',
          'error',
          10000
        );
        renderStatus();
        return;
      }
    }

    if (state.draftContentOmitted && !previousOmitted && !state.draftFallbackNotified) {
      state.draftFallbackNotified = true;
      showToast(
        'El borrador del navegador no incluye el contenido de todos los adjuntos por falta de espacio. El registro sigue en memoria y el JSON exportado sí los incluirá; exporta antes de cerrar.',
        'warning',
        12000
      );
    }

    renderStatus();
  }

  function setDirty() {
    state.dirtySinceExport = true;
    state.loadedFromFile = false;
    state.loadedFileName = '';
    state.loadedAt = null;
    saveState();
    renderStatus();
    scheduleLiveJsonRefresh();
  }

  function render() {
    if (!state.record) {
      state.record = createEmptyRecord();
    }

    const setupComplete = isSetupComplete(state.record);
    if (state.view === 'setup' || !setupComplete) {
      state.view = 'setup';
      els.viewSetup.hidden = false;
      els.viewMain.hidden = true;
      renderSetup();
    } else {
      state.view = 'main';
      els.viewSetup.hidden = true;
      els.viewMain.hidden = false;
      renderMain();
    }

    scheduleLiveJsonRefresh();
  }

  function renderSetup() {
    els.setupTitle.textContent = state.setupMode === 'edit' ? 'Datos del trabajo' : 'Configura tu registro';
    els.btnImportSetup.hidden = state.setupMode === 'edit';
    els.setupStudentId.value = state.record.student.id || '';
    els.setupStudentName.value = state.record.student.name || '';
    els.setupAssignmentId.value = state.record.assignment.id || '';
    els.setupCourse.value = state.record.assignment.course || CONFIG.defaultCourse;
    els.setupAssignmentTitle.value = state.record.assignment.title || '';
    els.setupDeclaration.checked = state.record.declaration.accepted === true;
    els.btnSetupCancel.hidden = state.setupMode !== 'edit';
    clearSetupErrors();
  }

  function renderMain() {
    const student = state.record.student;
    const assignment = state.record.assignment;
    const parts = [student.id];
    if (student.name) {
      parts.push(student.name);
    }
    parts.push(assignment.id, assignment.title, `Curso ${assignment.course}`);
    els.recordContext.textContent = parts.join(' · ');

    renderStats();
    renderStatus();
    renderTimeline();
  }

  function renderStats() {
    els.stats.replaceChildren();
    const entries = state.record.entries;
    if (entries.length === 0) {
      return;
    }

    const models = new Set(entries.map((entry) => entry.model.name));
    const free = entries.filter((entry) => entry.model.access === 'free').length;
    const paid = entries.filter((entry) => entry.model.access === 'paid').length;
    const attachments = entries.reduce((total, entry) => total + entry.attachments.length, 0);
    const attachmentSummary = Attachments
      ? Attachments.summarizeAttachments(entries)
      : { recoverable: 0, withoutContent: 0 };

    const chips = [
      ['Iteraciones', entries.length],
      ['Modelos', models.size],
      ['Gratuito', free],
      ['De pago', paid],
      ['Adjuntos', attachments]
    ];

    if (attachments > 0) {
      chips.push(['Recuperables', attachmentSummary.recoverable]);
    }

    for (const [label, value] of chips) {
      els.stats.append(
        el('span', { class: 'stat-chip' }, [el('strong', { text: String(value) }), label])
      );
    }

    const first = entries[0].occurred_at;
    const last = entries[entries.length - 1].occurred_at;
    if (first && last) {
      els.stats.append(
        el('span', { class: 'stat-chip' }, [
          el('strong', { text: `${entries.length}` }),
          `interacciones entre ${formatDate(first)} y ${formatDate(last)}`
        ])
      );
    }
  }

  function renderStatus() {
    els.statusBar.classList.remove('is-warning', 'is-success', 'is-info');
    const entries = state.record.entries;

    if (entries.length === 0) {
      els.statusBar.textContent = 'Aún no has registrado ninguna iteración.';
    } else if (state.dirtySinceExport) {
      els.statusBar.textContent = 'Hay cambios sin exportar. Exporta el JSON para generar una copia verificable.';
      els.statusBar.classList.add('is-warning');
    } else if (state.loadedFromFile) {
      const source = state.loadedFileName ? `«${state.loadedFileName}»` : 'un archivo';
      const when = state.loadedAt ? ` el ${formatDate(state.loadedAt)}` : '';
      els.statusBar.textContent = `Registro cargado desde ${source}${when}. Puedes seguir añadiendo iteraciones.`;
      els.statusBar.classList.add('is-info');
    } else if (state.lastExportAt) {
      els.statusBar.textContent = `Última exportación: ${formatDate(state.lastExportAt)}. Sin cambios desde entonces.`;
      els.statusBar.classList.add('is-success');
    } else {
      els.statusBar.textContent = 'Registro en curso. Exporta el JSON cuando termines.';
    }

    if (state.draftContentOmitted) {
      els.statusBar.textContent +=
        ' Aviso: el borrador guardado en el navegador no incluye el contenido de todos los adjuntos. El JSON exportado sí los incluye; expórtalo antes de cerrar.';
      els.statusBar.classList.add('is-warning');
    }

    const attachmentSummary = Attachments ? Attachments.summarizeAttachments(entries) : null;
    if (attachmentSummary && attachmentSummary.withoutContent > 0) {
      els.statusBar.textContent += ` ${attachmentSummary.withoutContent} adjunto(s) solo conservan la huella y no se pueden descargar.`;
      els.statusBar.classList.add('is-warning');
    }

    if (!state.storageAvailable) {
      els.statusBar.textContent += ' Aviso: el almacenamiento local no está disponible; guarda el JSON antes de cerrar.';
      els.statusBar.classList.add('is-warning');
    }
  }

  function renderTimeline() {
    els.timeline.replaceChildren();
    const entries = state.record.entries;
    els.emptyState.hidden = entries.length > 0;

    entries.forEach((entry, index) => {
      const card = el('li', { class: 'entry-card' });
      const header = el('div', { class: 'entry-header' }, [
        el('span', { class: 'entry-seq', text: `#${index + 1}` }),
        el('time', { class: 'entry-time', datetime: entry.occurred_at, text: formatDate(entry.occurred_at) }),
        el('span', {
          class: `badge badge-access ${entry.model.access}`,
          text: entry.model.access === 'free' ? 'Gratuito' : 'De pago'
        }),
        el('span', { class: 'badge', text: entry.model.name })
      ]);

      if (entry.model.provider) {
        header.append(el('span', { class: 'badge', text: entry.model.provider }));
      }
      if (entry.attachments.length > 0) {
        header.append(
          el('span', {
            class: 'badge',
            text: `${entry.attachments.length} adjunto${entry.attachments.length === 1 ? '' : 's'}`
          })
        );
      }

      const prompt = el('p', { class: 'entry-prompt', text: truncate(entry.prompt, 240) });
      const details = el('details', { class: 'entry-details' }, [
        el('summary', { text: 'Ver prompt completo' }),
        el('pre', { class: 'prompt-full', text: entry.prompt })
      ]);

      if (entry.attachments.length > 0) {
        const attachmentList = el('ul', { class: 'entry-attachments' });
        for (const attachment of entry.attachments) {
          attachmentList.append(renderTimelineAttachment(attachment));
        }
        details.append(el('h3', { class: 'details-title', text: 'Adjuntos' }), attachmentList);
      }

      const actions = el('div', { class: 'entry-actions' }, [
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: 'Editar',
          onclick: () => openEntryDialog(entry.id)
        }),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: 'Duplicar',
          onclick: () => duplicateEntry(entry.id)
        }),
        el('button', {
          type: 'button',
          class: 'btn btn-danger-ghost btn-sm',
          text: 'Eliminar',
          onclick: () => deleteEntry(entry.id)
        })
      ]);

      card.append(header, prompt, details, actions);
      els.timeline.append(card);
    });
  }

  function formatAttachmentMeta(attachment) {
    const parts = [formatBytes(attachment.size_bytes), attachment.mime_type];
    if (attachment.content) {
      const content = attachment.content;
      const algorithm = content.compression === 'gzip' ? 'gzip' : 'sin compresión';
      parts.push(`${algorithm} · ${formatBytes(content.compressed_size_bytes)}`);
      if (content.compression === 'gzip' && attachment.size_bytes > 0) {
        const ratio = Math.round((content.compressed_size_bytes / attachment.size_bytes) * 100);
        parts.push(`${ratio}% del original`);
      }
    }
    parts.push(`SHA-256 ${attachment.sha256.slice(0, 12)}…`);
    return parts.join(' · ');
  }

  function renderTimelineAttachment(attachment) {
    const recoverable = Boolean(attachment.content);
    const info = el('div', { class: 'attachment-entry-info' }, [
      el('span', { class: 'attachment-name', text: attachment.name }),
      el('span', { class: 'attachment-meta', text: formatAttachmentMeta(attachment) })
    ]);

    const actions = el('div', { class: 'attachment-entry-actions' }, [
      el('span', {
        class: `badge attachment-badge ${recoverable ? 'is-recoverable' : 'is-hash-only'}`,
        text: recoverable ? 'Recuperable' : 'Solo huella'
      })
    ]);

    if (recoverable) {
      actions.append(
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: 'Descargar',
          onclick: () => downloadAttachment(attachment)
        })
      );
    }

    return el('li', { class: 'attachment-entry' }, [info, actions]);
  }

  async function downloadAttachment(attachment) {
    if (!Attachments) {
      showToast('La recuperación de adjuntos no está disponible.', 'error');
      return;
    }
    try {
      const result = await Attachments.decodeAttachment(attachment);
      if (!result.valid) {
        showToast(
          `No se pudo recuperar «${attachment.name}»: ${Attachments.translateReason(result.reason)}.`,
          'error',
          8000
        );
        return;
      }
      downloadBytes(attachment.name, result.bytes, attachment.mime_type);
      showToast(`Adjunto «${attachment.name}» descargado.`, 'success');
    } catch (err) {
      showToast(`No se pudo recuperar «${attachment.name}».`, 'error', 8000);
    }
  }

  function downloadBytes(name, bytes, mimeType) {
    const blob = new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name || 'adjunto';
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function renderAttachmentList() {
    els.attachmentList.replaceChildren();
    state.currentAttachments.forEach((attachment, index) => {
      els.attachmentList.append(
        el('li', { class: 'attachment-item' }, [
          el('span', { class: 'attachment-name', text: attachment.name }),
          el('span', {
            class: 'attachment-meta',
            text: formatAttachmentMeta(attachment)
          }),
          el('span', {
            class: `badge attachment-badge ${attachment.content ? 'is-recoverable' : 'is-hash-only'}`,
            text: attachment.content ? 'Recuperable' : 'Solo huella'
          }),
          el('button', {
            type: 'button',
            class: 'btn-icon',
            'aria-label': `Quitar ${attachment.name}`,
            text: '×',
            onclick: () => {
              state.currentAttachments.splice(index, 1);
              renderAttachmentList();
              saveFormDraftSoon();
            }
          })
        ])
      );
    });
  }

  function populateDatalists() {
    els.modelOptions.replaceChildren();
    for (const model of CONFIG.models) {
      els.modelOptions.append(el('option', { value: model.name, label: model.provider }));
    }

    els.providerOptions.replaceChildren();
    const providers = Array.from(new Set(CONFIG.models.map((model) => model.provider))).sort();
    for (const provider of providers) {
      els.providerOptions.append(el('option', { value: provider }));
    }
  }

  function bindEvents() {
    els.setupForm.addEventListener('submit', handleSetupSubmit);
    els.setupForm.addEventListener('input', clearSetupErrors);
    els.setupForm.addEventListener('change', clearSetupErrors);
    els.btnSetupCancel.addEventListener('click', cancelSetup);

    els.btnEditSetup.addEventListener('click', () => openSetup('edit'));
    els.btnImportSetup.addEventListener('click', triggerImport);
    els.btnNewEntry.addEventListener('click', () => openEntryDialog(null));
    els.btnExport.addEventListener('click', handleExport);
    els.btnCopy.addEventListener('click', handleCopy);
    els.btnViewJson.addEventListener('click', openLiveJsonPanel);
    els.themeSelect.addEventListener('change', handleThemeChange);
    els.btnImport.addEventListener('click', triggerImport);
    els.importInput.addEventListener('change', handleImportFile);
    els.btnReset.addEventListener('click', resetRecord);
    els.btnHelp.addEventListener('click', () => els.helpDialog.showModal());
    els.btnSelectJson.addEventListener('click', () => {
      els.jsonText.focus();
      els.jsonText.select();
    });
    els.btnCopyLiveJson.addEventListener('click', handleLiveCopy);
    els.btnDownloadLiveJson.addEventListener('click', handleLiveDownload);
    els.jsonDialog.addEventListener('close', handleJsonDialogClose);

    els.entryForm.addEventListener('submit', handleEntrySubmit);
    els.entryForm.addEventListener('input', () => {
      updatePromptCount();
      saveFormDraftSoon();
    });
    els.entryForm.addEventListener('change', saveFormDraftSoon);
    els.entryModel.addEventListener('input', autofillProvider);
    els.entryAttachments.addEventListener('change', handleAttachmentChange);
    els.entryDialog.addEventListener('close', handleEntryDialogClose);
    els.entryForm.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        els.entryForm.requestSubmit();
      }
    });

    for (const button of document.querySelectorAll('[data-close-dialog]')) {
      button.addEventListener('click', () => {
        const dialog = button.closest('dialog');
        if (dialog) {
          dialog.close();
        }
      });
    }

    window.addEventListener('beforeunload', (event) => {
      if (state.dirtySinceExport && state.record && state.record.entries.length > 0) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  function autofillProvider() {
    const value = els.entryModel.value.trim().toLowerCase();
    if (!value || els.entryProvider.value.trim()) {
      return;
    }
    const match = CONFIG.models.find((model) => model.name.toLowerCase() === value);
    if (match) {
      els.entryProvider.value = match.provider;
    }
  }

  function openSetup(mode) {
    state.setupMode = mode;
    state.view = 'setup';
    render();
    els.setupStudentId.focus();
  }

  function cancelSetup() {
    if (state.setupMode === 'edit' && isSetupComplete(state.record)) {
      state.view = 'main';
      render();
    }
  }

  function handleSetupSubmit(event) {
    event.preventDefault();
    clearSetupErrors();

    const studentId = els.setupStudentId.value.trim();
    const studentName = els.setupStudentName.value.trim();
    const assignmentId = els.setupAssignmentId.value.trim();
    const course = els.setupCourse.value.trim();
    const assignmentTitle = els.setupAssignmentTitle.value.trim();
    const accepted = els.setupDeclaration.checked;

    const errors = [];
    if (!studentId) {
      errors.push({ field: 'student_id', message: 'El identificador del estudiante es obligatorio.' });
    } else if (studentId.length > 64) {
      errors.push({ field: 'student_id', message: 'El identificador no puede superar 64 caracteres.' });
    }
    if (!assignmentId) {
      errors.push({ field: 'assignment_id', message: 'El identificador del trabajo es obligatorio.' });
    } else if (assignmentId.length > 64) {
      errors.push({ field: 'assignment_id', message: 'El identificador del trabajo no puede superar 64 caracteres.' });
    }
    if (!assignmentTitle) {
      errors.push({ field: 'assignment_title', message: 'El título del trabajo es obligatorio.' });
    } else if (assignmentTitle.length > 200) {
      errors.push({ field: 'assignment_title', message: 'El título no puede superar 200 caracteres.' });
    }
    if (!course) {
      errors.push({ field: 'course', message: 'El curso es obligatorio.' });
    } else if (course.length > 20) {
      errors.push({ field: 'course', message: 'El curso no puede superar 20 caracteres.' });
    }
    if (!accepted) {
      errors.push({ field: 'declaration', message: 'Debes aceptar la declaración para continuar.' });
    }

    if (errors.length > 0) {
      renderFormErrors(els.setupErrors, errors);
      focusFirstError(errors);
      return;
    }

    const now = new Date().toISOString();
    const wasEditing = state.setupMode === 'edit';
    const changedFields = [];

    if (wasEditing) {
      if (state.record.student.id !== studentId) changedFields.push('student.id');
      if (state.record.student.name !== studentName) changedFields.push('student.name');
      if (state.record.assignment.id !== assignmentId) changedFields.push('assignment.id');
      if (state.record.assignment.title !== assignmentTitle) changedFields.push('assignment.title');
      if (state.record.assignment.course !== course) changedFields.push('assignment.course');
      if (!state.record.declaration.accepted) changedFields.push('declaration.accepted');
    }

    state.record.student.id = studentId;
    state.record.student.name = studentName;
    state.record.assignment.id = assignmentId;
    state.record.assignment.title = assignmentTitle;
    state.record.assignment.course = course;

    if (!state.record.declaration.accepted) {
      state.record.declaration.accepted = true;
      state.record.declaration.accepted_at = now;
      state.record.declaration.version = CONFIG.declaration.version;
    }

    if (wasEditing) {
      if (changedFields.length > 0) {
        state.record.audit_log.push({
          type: 'record_updated',
          at: now,
          changed_fields: changedFields
        });
      }
    } else {
      state.record.audit_log.push({ type: 'record_created', at: now });
    }

    state.setupMode = 'create';
    state.view = 'main';
    if (!wasEditing || changedFields.length > 0) {
      setDirty();
    } else {
      saveState();
    }
    render();
    showToast(
      wasEditing
        ? changedFields.length > 0
          ? 'Datos del trabajo actualizados.'
          : 'No había cambios en los datos del trabajo.'
        : 'Registro creado. Ya puedes añadir iteraciones.',
      wasEditing && changedFields.length === 0 ? 'info' : 'success'
    );
  }

  function applyLastEntryDefaults() {
    const entries = state.record.entries;
    if (entries.length === 0) {
      return;
    }
    const last = entries[entries.length - 1];
    if (!last || !last.model) {
      return;
    }
    if (last.model.name) {
      els.entryModel.value = last.model.name;
    }
    els.entryProvider.value = last.model.provider || '';
    const accessInput = els.entryForm.querySelector(`input[name="access"][value="${last.model.access}"]`);
    if (accessInput) {
      accessInput.checked = true;
    }
  }

  function openEntryDialog(entryId, prefill) {
    state.editingEntryId = entryId || null;
    state.skipDraftOnClose = false;
    state.prefillMode = Boolean(prefill);
    clearEntryErrors();
    els.entryForm.reset();
    els.entryAttachments.value = '';
    els.attachmentStatus.textContent = '';
    els.draftNote.hidden = true;
    state.currentAttachments = [];

    if (entryId) {
      const entry = state.record.entries.find((item) => item.id === entryId);
      if (!entry) {
        showToast('No se encontró la iteración seleccionada.', 'error');
        return;
      }
      els.entryDialogTitle.textContent = 'Editar iteración';
      els.entryOccurred.value = isoToLocalInput(entry.occurred_at);
      els.entryModel.value = entry.model.name;
      els.entryProvider.value = entry.model.provider || '';
      const accessInput = els.entryForm.querySelector(`input[name="access"][value="${entry.model.access}"]`);
      if (accessInput) {
        accessInput.checked = true;
      }
      els.entryPrompt.value = entry.prompt;
      state.currentAttachments = entry.attachments.map((attachment) => cloneAttachment(attachment));
    } else {
      els.entryDialogTitle.textContent = 'Nueva iteración';
      els.entryOccurred.value = isoToLocalInput(new Date().toISOString());
      applyLastEntryDefaults();

      if (prefill) {
        els.entryModel.value = prefill.model.name;
        els.entryProvider.value = prefill.model.provider || '';
        const accessInput = els.entryForm.querySelector(`input[name="access"][value="${prefill.model.access}"]`);
        if (accessInput) {
          accessInput.checked = true;
        }
        els.entryPrompt.value = prefill.prompt;
        state.currentAttachments = prefill.attachments.map((attachment) => cloneAttachment(attachment));
      } else {
        const restored = restoreFormDraft();
        if (restored) {
          els.draftNote.hidden = false;
        }
      }
    }

    renderAttachmentList();
    updatePromptCount();
    els.entryDialog.showModal();
    els.entryModel.focus();
  }

  function closeEntryDialog() {
    els.entryDialog.close();
  }

  function handleEntryDialogClose() {
    cancelFormDraftTimer();
    if (state.skipDraftOnClose) {
      state.skipDraftOnClose = false;
      clearFormDraft();
    } else if (!state.editingEntryId && !state.prefillMode) {
      saveFormDraftNow();
    }
    state.prefillMode = false;
    state.editingEntryId = null;
    els.entryAttachments.value = '';
    els.attachmentStatus.textContent = '';
  }

  function handleEntrySubmit(event) {
    event.preventDefault();
    clearEntryErrors();

    if (state.hashing) {
      showToast('Espera a que termine el cálculo de la huella de los adjuntos.', 'warning');
      return;
    }

    const occurredInput = els.entryOccurred.value;
    const occurredAt = occurredInput ? localInputToIso(occurredInput) : null;
    const modelName = els.entryModel.value.trim();
    const provider = els.entryProvider.value.trim();
    const accessInput = els.entryForm.querySelector('input[name="access"]:checked');
    const access = accessInput ? accessInput.value : '';
    const prompt = els.entryPrompt.value;
    const errors = [];

    let entryId = state.editingEntryId;
    const existing = entryId ? state.record.entries.find((entry) => entry.id === entryId) : null;

    if (!occurredAt) {
      errors.push({ field: 'occurred_at', message: 'Indica una fecha y hora válidas.' });
    } else if (Date.parse(occurredAt) > Date.now() + 5 * 60 * 1000) {
      errors.push({ field: 'occurred_at', message: 'La fecha de la interacción no puede estar en el futuro.' });
    } else if (existing && Date.parse(occurredAt) > Date.parse(existing.recorded_at) + 5 * 60 * 1000) {
      errors.push({
        field: 'occurred_at',
        message: 'La fecha de la interacción no puede ser posterior al momento en que se registró originalmente.'
      });
    }
    if (!modelName) {
      errors.push({ field: 'model_name', message: 'Indica el modelo de IA utilizado.' });
    } else if (modelName.length > 120) {
      errors.push({ field: 'model_name', message: 'El nombre del modelo no puede superar 120 caracteres.' });
    }
    if (provider.length > 80) {
      errors.push({ field: 'model_provider', message: 'El proveedor no puede superar 80 caracteres.' });
    }
    if (access !== 'free' && access !== 'paid') {
      errors.push({ field: 'access', message: 'Selecciona el tipo de acceso.' });
    }
    if (!prompt.trim()) {
      errors.push({ field: 'prompt', message: 'El texto del prompt es obligatorio.' });
    } else if (prompt.length > CONFIG.limits.maxPromptChars) {
      errors.push({
        field: 'prompt',
        message: `El prompt no puede superar ${CONFIG.limits.maxPromptChars.toLocaleString('es-ES')} caracteres.`
      });
    }
    if (state.currentAttachments.length > CONFIG.limits.maxAttachmentsPerEntry) {
      errors.push({ field: 'attachments', message: 'Hay demasiados adjuntos en esta iteración.' });
    }

    if (errors.length > 0) {
      renderFormErrors(els.entryErrors, errors);
      focusFirstError(errors);
      return;
    }

    if (!entryId) {
      try {
        entryId = nextEntryId();
      } catch (err) {
        showToast(err.message, 'error');
        return;
      }
    }

    const now = new Date().toISOString();
    const entry = {
      id: entryId,
      occurred_at: occurredAt,
      recorded_at: existing ? existing.recorded_at : now,
      model: {
        name: modelName,
        access
      },
      attachments: state.currentAttachments.map((attachment) => cloneAttachment(attachment)),
      prompt
    };
    if (provider) {
      entry.model.provider = provider;
    }

    if (existing) {
      const changedFields = [];
      if (existing.occurred_at !== entry.occurred_at) changedFields.push('occurred_at');
      if (existing.prompt !== entry.prompt) changedFields.push('prompt');
      if (existing.model.name !== entry.model.name) changedFields.push('model.name');
      if ((existing.model.provider || '') !== (entry.model.provider || '')) changedFields.push('model.provider');
      if (existing.model.access !== entry.model.access) changedFields.push('model.access');
      if (!attachmentsEquivalent(existing.attachments, entry.attachments)) changedFields.push('attachments');

      const index = state.record.entries.findIndex((item) => item.id === entryId);
      state.record.entries[index] = entry;
      state.record.audit_log.push({
        type: 'entry_updated',
        at: now,
        entry_id: entryId,
        changed_fields: changedFields
      });
    } else {
      state.record.entries.push(entry);
      state.record.audit_log.push({ type: 'entry_created', at: now, entry_id: entryId });
    }

    state.record.entries = sortEntries(state.record.entries);
    setDirty();
    cancelFormDraftTimer();
    state.skipDraftOnClose = true;
    els.entryDialog.close();
    render();
    showToast(existing ? 'Iteración actualizada.' : 'Iteración guardada.', 'success');
  }

  function duplicateEntry(entryId) {
    const entry = state.record.entries.find((item) => item.id === entryId);
    if (!entry) {
      showToast('No se encontró la iteración seleccionada.', 'error');
      return;
    }

    openEntryDialog(null, entry);
  }

  function deleteEntry(entryId) {
    const index = state.record.entries.findIndex((entry) => entry.id === entryId);
    if (index === -1) {
      return;
    }
    const [removed] = state.record.entries.splice(index, 1);
    const now = new Date().toISOString();
    state.record.audit_log.push({ type: 'entry_deleted', at: now, entry_id: entryId });
    setDirty();
    render();

    showToast('Iteración eliminada.', 'info', 8000, {
      label: 'Deshacer',
      onClick: () => {
        state.record.entries.splice(Math.min(index, state.record.entries.length), 0, removed);
        state.record.entries = sortEntries(state.record.entries);
        state.record.audit_log.push({
          type: 'entry_restored',
          at: new Date().toISOString(),
          entry_id: removed.id
        });
        setDirty();
        render();
        showToast('Iteración restaurada.', 'success');
      }
    });
  }

  function nextEntryId() {
    let max = 0;
    for (const entry of state.record.entries) {
      const match = /^e-(\d{4})$/.exec(entry.id);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
    for (const event of state.record.audit_log) {
      const match = /^e-(\d{4})$/.exec(event.entry_id || '');
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
    if (max >= 9999) {
      throw new Error('Se ha alcanzado el máximo de iteraciones para este registro.');
    }
    return `e-${String(max + 1).padStart(4, '0')}`;
  }

  function sortEntries(entries) {
    return entries.slice().sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  }

  function attachmentSignature(attachment) {
    return JSON.stringify([
      attachment.name,
      attachment.size_bytes,
      attachment.mime_type,
      attachment.sha256,
      attachment.content ? attachment.content.compression : null,
      attachment.content ? attachment.content.compressed_sha256 : null
    ]);
  }

  function attachmentsEquivalent(first, second) {
    const a = Array.isArray(first) ? first : [];
    const b = Array.isArray(second) ? second : [];
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (attachmentSignature(a[i]) !== attachmentSignature(b[i])) {
        return false;
      }
    }
    return true;
  }

  async function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) {
      return;
    }

    if (!Attachments) {
      showToast('La compresión de adjuntos no está disponible en este navegador.', 'error');
      return;
    }

    const maxBytes = CONFIG.limits.maxAttachmentMB * 1024 * 1024;
    const maxTotalBytes = CONFIG.limits.maxTotalAttachmentMB * 1024 * 1024;
    const remaining = CONFIG.limits.maxAttachmentsPerEntry - state.currentAttachments.length;
    if (remaining <= 0) {
      showToast(`No puedes añadir más de ${CONFIG.limits.maxAttachmentsPerEntry} adjuntos por iteración.`, 'error');
      return;
    }

    const selected = files.slice(0, remaining);
    if (files.length > remaining) {
      showToast(`Solo se añadirán ${remaining} archivo(s); se alcanzó el límite de adjuntos.`, 'warning');
    }

    const otherEntriesBytes = state.record.entries.reduce((total, entry) => {
      if (entry.id === state.editingEntryId) {
        return total;
      }
      return total + entry.attachments.reduce((sum, attachment) => sum + (attachment.size_bytes || 0), 0);
    }, 0);
    let totalBytes =
      otherEntriesBytes +
      state.currentAttachments.reduce((sum, attachment) => sum + (attachment.size_bytes || 0), 0);

    state.hashing = true;
    els.btnSaveEntry.disabled = true;
    els.attachmentStatus.textContent = 'Comprimiendo y calculando huellas SHA-256…';

    try {
      for (const file of selected) {
        if (file.size > maxBytes) {
          showToast(`«${file.name}» supera el límite de ${CONFIG.limits.maxAttachmentMB} MB y se ha omitido.`, 'error', 6000);
          continue;
        }
        if (totalBytes + file.size > maxTotalBytes) {
          showToast(
            `«${file.name}» supera el límite total de ${CONFIG.limits.maxTotalAttachmentMB} MB por registro y se ha omitido.`,
            'error',
            7000
          );
          continue;
        }

        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const encoded = await Attachments.encodeAttachment({
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            bytes
          });
          state.currentAttachments.push(encoded);
          totalBytes += encoded.size_bytes;
        } catch (err) {
          showToast(`No se pudo procesar «${file.name}».`, 'error', 6000);
        }
      }
      renderAttachmentList();
      saveFormDraftSoon();
    } finally {
      state.hashing = false;
      els.btnSaveEntry.disabled = false;
      els.attachmentStatus.textContent = '';
    }
  }

  function updatePromptCount() {
    const length = els.entryPrompt.value.length;
    const max = CONFIG.limits.maxPromptChars;
    els.promptCount.textContent = `${length.toLocaleString('es-ES')} / ${max.toLocaleString('es-ES')} caracteres`;
    els.promptCount.parentElement.classList.toggle('over-limit', length > max);
  }

  function restoreFormDraft() {
    if (!state.storageAvailable) {
      return false;
    }
    try {
      const raw = localStorage.getItem(FORM_DRAFT_KEY);
      if (!raw) {
        return false;
      }
      const draft = JSON.parse(raw);
      const supported = CONFIG.supportedSchemaVersions || [CONFIG.schemaVersion];
      if (!draft || !supported.includes(draft.version)) {
        return false;
      }
      let restored = false;
      if (draft.model_name) {
        els.entryModel.value = draft.model_name;
        restored = true;
      }
      if (draft.model_provider) {
        els.entryProvider.value = draft.model_provider;
        restored = true;
      }
      if (draft.access === 'free' || draft.access === 'paid') {
        const accessInput = els.entryForm.querySelector(`input[name="access"][value="${draft.access}"]`);
        if (accessInput) {
          accessInput.checked = true;
          restored = true;
        }
      }
      return restored;
    } catch (err) {
      return false;
    }
  }

  function cancelFormDraftTimer() {
    if (state.formDraftTimer) {
      clearTimeout(state.formDraftTimer);
      state.formDraftTimer = null;
    }
  }

  function saveFormDraftSoon() {
    if (state.editingEntryId || state.prefillMode || !state.storageAvailable) {
      return;
    }
    cancelFormDraftTimer();
    state.formDraftTimer = setTimeout(() => {
      state.formDraftTimer = null;
      saveFormDraftNow();
    }, 500);
  }

  function saveFormDraftNow() {
    if (state.editingEntryId || state.prefillMode || !state.storageAvailable) {
      return;
    }
    const accessInput = els.entryForm.querySelector('input[name="access"]:checked');
    const access = accessInput ? accessInput.value : '';
    const modelName = els.entryModel.value.trim();
    const provider = els.entryProvider.value.trim();
    if (!modelName && !provider && !access) {
      clearFormDraft();
      return;
    }
    const draft = {
      version: CONFIG.schemaVersion,
      model_name: els.entryModel.value,
      model_provider: els.entryProvider.value,
      access
    };
    try {
      localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
    } catch (err) {
      // Silencioso: el borrador es una comodidad, no el entregable.
    }
  }

  function clearFormDraft() {
    if (!state.storageAvailable) {
      return;
    }
    try {
      localStorage.removeItem(FORM_DRAFT_KEY);
    } catch (err) {
      // Silencioso.
    }
  }

  async function buildExportRecord() {
    const chainedEntries = await Chain.computeChain(state.record.entries);
    const student = { id: state.record.student.id };
    if (state.record.student.name) {
      student.name = state.record.student.name;
    }

    const record = {
      schema_version: CONFIG.schemaVersion,
      tool: { name: CONFIG.appName, version: CONFIG.version },
      exported_at: new Date().toISOString(),
      student,
      assignment: Object.assign({}, state.record.assignment),
      declaration: Object.assign({}, state.record.declaration),
      entries: chainedEntries,
      audit_log: state.record.audit_log.map((event) => Object.assign({}, event)),
      integrity: {
        algorithm: Chain.ALGORITHM,
        canonicalization: Chain.CANONICALIZATION,
        entry_count: chainedEntries.length,
        chain_head: chainedEntries.length > 0 ? chainedEntries[chainedEntries.length - 1].hash : '',
        record_hash: ''
      }
    };

    record.integrity.record_hash = await Chain.computeRecordHash(record);
    return record;
  }

  async function prepareExport() {
    if (!isSetupComplete(state.record)) {
      showToast('Completa los datos del trabajo y la declaración antes de exportar.', 'error');
      openSetup('edit');
      return null;
    }
    if (state.record.entries.length === 0) {
      showToast('Registra al menos una iteración antes de exportar.', 'error');
      return null;
    }

    if (Attachments) {
      const attachmentCheck = await Attachments.verifyRecordAttachments(state.record.entries);
      if (!attachmentCheck.valid) {
        showErrorsDialog(
          'Los adjuntos no se pueden recuperar',
          'El contenido incrustado de uno o más adjuntos no supera la verificación. Corrige o vuelve a adjuntar los archivos antes de exportar.',
          attachmentCheck.issues
        );
        return null;
      }
    }

    const record = await buildExportRecord();
    const validation = Validate.validateRecord(record);
    if (!validation.valid) {
      showErrorsDialog(
        'El registro no es válido',
        'Corrige los siguientes problemas antes de exportar el JSON.',
        validation.errors
      );
      return null;
    }

    const chainResult = await Chain.verifyChain(record.entries);
    if (!chainResult.valid) {
      showToast('La cadena de integridad generada no es válida. Contacta con el profesorado.', 'error', 8000);
      return null;
    }

    const recordHashValid = await Chain.verifyRecordHash(record);
    if (!recordHashValid) {
      showToast('El hash global generado no es válido. Contacta con el profesorado.', 'error', 8000);
      return null;
    }

    return record;
  }

  async function exportRecord() {
    const record = await prepareExport();
    if (!record) {
      return null;
    }
    downloadJson(record);
    state.lastExportAt = record.exported_at;
    state.dirtySinceExport = false;
    state.loadedFromFile = false;
    state.loadedFileName = '';
    state.loadedAt = null;
    saveState();
    renderStatus();
    scheduleLiveJsonRefresh();
    return record;
  }

  async function handleExport() {
    try {
      const record = await exportRecord();
      if (record) {
        const summary = Attachments ? Attachments.summarizeAttachments(record.entries) : null;
        if (summary && summary.withoutContent > 0) {
          showToast(
            `JSON exportado. ${summary.withoutContent} adjunto(s) solo conservan la huella y no se podrán recuperar del archivo.`,
            'warning',
            9000
          );
        } else {
          showToast('JSON exportado correctamente.', 'success');
        }
      }
    } catch (err) {
      showToast('No se pudo generar el JSON. Inténtalo de nuevo.', 'error', 8000);
    }
  }

  async function handleCopy() {
    try {
      const record = await prepareExport();
      if (!record) {
        return;
      }
      if (attachmentContentChars(record.entries) > LIVE_JSON_BUDGET) {
        showToast(
          'El registro es demasiado grande para copiarlo al portapapeles. Usa «Exportar JSON» para descargarlo.',
          'warning',
          9000
        );
        return;
      }
      const text = JSON.stringify(record, null, 2);
      if (text.length > LIVE_JSON_BUDGET) {
        showToast(
          'El registro es demasiado grande para copiarlo al portapapeles. Usa «Exportar JSON» para descargarlo.',
          'warning',
          9000
        );
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showToast('JSON copiado al portapapeles.', 'success');
      } else {
        showJsonDialog(text);
      }
    } catch (err) {
      if (attachmentContentChars(state.record.entries) > LIVE_JSON_BUDGET) {
        showToast(
          'El registro es demasiado grande para mostrarlo o copiarlo. Usa «Exportar JSON» para descargarlo.',
          'warning',
          9000
        );
        return;
      }
      showToast('No se pudo copiar el JSON. Se muestra en una ventana para copiarlo manualmente.', 'warning', 6000);
      try {
        const record = await buildExportRecord();
        showJsonDialog(JSON.stringify(record, null, 2));
      } catch (innerErr) {
        // Sin más acciones.
      }
    }
  }

  function downloadJson(record) {
    const text = JSON.stringify(record, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildFilename(record);
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function buildFilename(record) {
    const stamp = record.exported_at
      .replace(/\.\d+Z$/, '')
      .replace(/[-:]/g, '')
      .replace('T', '-');
    return `rtp_${safeFilenamePart(record.student.id)}_${safeFilenamePart(record.assignment.id)}_${stamp}.json`;
  }

  function safeFilenamePart(value) {
    return String(value || 'sin-id')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sin-id';
  }

  function triggerImport() {
    els.importInput.value = '';
    els.importInput.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    let parsed;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch (err) {
      showErrorsDialog('JSON no válido', 'El archivo no contiene un JSON bien formado.', [
        { path: file.name, message: 'No se pudo interpretar el archivo como JSON.' }
      ]);
      return;
    }

    const validation = Validate.validateRecord(parsed);
    if (!validation.valid) {
      showErrorsDialog(
        'El archivo no cumple el esquema',
        'El JSON no tiene la estructura esperada. No se ha importado nada.',
        validation.errors
      );
      return;
    }

    const chainResult = await Chain.verifyChain(parsed.entries);
    const recordHashValid = await Chain.verifyRecordHash(parsed);
    const attachmentResult = Attachments
      ? await Attachments.verifyRecordAttachments(parsed.entries)
      : { valid: true, issues: [], total: 0, recoverable: 0, withoutContent: 0 };
    const integrityValid = chainResult.valid && recordHashValid && attachmentResult.valid;

    const hasCurrentData = state.record.entries.length > 0 || state.dirtySinceExport;
    const integrityWarnings = [];
    if (!chainResult.valid) {
      integrityWarnings.push(
        `La cadena de integridad falla en la entrada ${chainResult.index + 1} (${translateChainReason(chainResult.reason)}).`
      );
    }
    if (!recordHashValid) {
      integrityWarnings.push('El hash global del registro no coincide.');
    }
    if (!attachmentResult.valid) {
      integrityWarnings.push(
        `El contenido de ${attachmentResult.issues.length} adjunto(s) no supera la verificación.`
      );
    }

    let message;
    if (!integrityValid) {
      message = `${integrityWarnings.join(' ')} Esto puede indicar que el archivo se editó fuera de RTP.`;
      if (hasCurrentData) {
        message +=
          ' Además, se reemplazará el registro que tienes abierto; si necesitas conservarlo, cancela y expórtalo antes de cargar.';
      }
      message += ' Si continúas, el incidente quedará registrado en el historial de auditoría.';
    } else if (hasCurrentData) {
      message =
        'Se reemplazará el registro que tienes abierto. Si necesitas conservarlo, cancela y expórtalo antes de cargar.';
    } else {
      message =
        'Revisa el resumen antes de cargar el registro. Se conservarán las fechas de registro, la auditoría y la declaración originales.';
    }

    const proceed = await confirmDialog({
      title: !integrityValid
        ? 'Integridad no verificada'
        : hasCurrentData
          ? 'Reemplazar el registro actual'
          : 'Cargar registro desde archivo',
      message,
      details: buildImportSummary(parsed, file.name, integrityValid, attachmentResult),
      okLabel: !integrityValid
        ? 'Cargar de todos modos'
        : hasCurrentData
          ? 'Reemplazar y continuar'
          : 'Cargar y continuar',
      danger: !integrityValid || hasCurrentData
    });
    if (!proceed) {
      return;
    }

    const imported = normalizeInternalRecord(parsed);
    imported.audit_log.push({
      type: 'record_imported',
      at: new Date().toISOString(),
      source: 'file',
      chain_valid: chainResult.valid,
      record_hash_valid: recordHashValid,
      attachments_valid: attachmentResult.valid,
      ...(integrityValid
        ? {}
        : { note: 'Importado con verificación de integridad incompleta mediante confirmación explícita.' })
    });

    state.record = imported;
    state.lastExportAt = null;
    state.dirtySinceExport = false;
    state.loadedFromFile = true;
    state.loadedFileName = file.name;
    state.loadedAt = new Date().toISOString();
    state.view = isSetupComplete(imported) ? 'main' : 'setup';
    state.setupMode = state.view === 'setup' ? 'edit' : 'create';
    saveState();
    render();
    showToast(`Registro cargado desde «${file.name}». Puedes seguir añadiendo iteraciones.`, 'success', 6000);
  }

  function buildImportSummary(record, fileName, integrityValid, attachmentResult) {
    const entries = Array.isArray(record.entries) ? record.entries : [];
    const models = Array.from(
      new Set(entries.map((entry) => entry && entry.model && entry.model.name).filter(Boolean))
    );
    const attachments = entries.reduce(
      (total, entry) => total + (entry && Array.isArray(entry.attachments) ? entry.attachments.length : 0),
      0
    );
    const student = record.student && record.student.id ? record.student.id : '—';
    const studentName = record.student && record.student.name ? ` (${record.student.name})` : '';
    const assignment = record.assignment || {};
    const attachmentInfo = attachmentResult || { recoverable: 0, withoutContent: attachments, issues: [] };

    const lines = [
      `Archivo: ${fileName}`,
      `Estudiante: ${student}${studentName}`,
      `Trabajo: ${assignment.id || '—'} · ${assignment.title || '—'} · Curso ${assignment.course || '—'}`,
      `Iteraciones: ${entries.length}`,
      `Modelos: ${models.length > 0 ? models.join(', ') : '—'}`,
      `Adjuntos: ${attachments} (${attachmentInfo.recoverable} recuperables, ${attachmentInfo.withoutContent} solo huella)`,
      `Exportado: ${record.exported_at ? formatDate(record.exported_at) : 'sin fecha'}`,
      `Integridad: ${integrityValid ? 'cadena y hash global verificados' : 'no verificada'}`
    ];

    if (attachmentInfo.issues && attachmentInfo.issues.length > 0) {
      for (const issue of attachmentInfo.issues.slice(0, 3)) {
        lines.push(`Contenido: ${issue.message}`);
      }
      if (attachmentInfo.issues.length > 3) {
        lines.push(`Contenido: y ${attachmentInfo.issues.length - 3} incidencia(s) más.`);
      }
    }

    return lines;
  }

  function translateChainReason(reason) {
    switch (reason) {
      case 'sequence':
        return 'secuencia incorrecta';
      case 'prev_hash':
        return 'enlace roto con la entrada anterior';
      case 'hash':
        return 'contenido modificado';
      case 'not-array':
        return 'lista de entradas inválida';
      case 'not-object':
        return 'entrada inválida';
      default:
        return 'verificación fallida';
    }
  }

  async function resetRecord() {
    const proceed = await confirmDialog({
      title: 'Nuevo registro',
      message:
        'Se borrará el registro actual de este navegador. Si quieres conservarlo, cancela y exporta el JSON antes de continuar.',
      okLabel: 'Borrar y empezar de nuevo',
      danger: true
    });
    if (!proceed) {
      return;
    }

    if (state.storageAvailable) {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(UI_KEY);
        localStorage.removeItem(FORM_DRAFT_KEY);
      } catch (err) {
        // Silencioso.
      }
    }

    state.record = createEmptyRecord();
    state.view = 'setup';
    state.setupMode = 'create';
    state.editingEntryId = null;
    state.currentAttachments = [];
    state.lastExportAt = null;
    state.dirtySinceExport = false;
    state.loadedFromFile = false;
    state.loadedFileName = '';
    state.loadedAt = null;
    state.liveJsonRecord = null;
    state.liveJsonValid = false;
    state.draftContentOmitted = false;
    state.draftFallbackNotified = false;
    render();
    showToast('Registro borrado. Puedes empezar uno nuevo.', 'success');
  }

  function confirmDialog(options) {
    const settings = Object.assign(
      {
        title: 'Confirmar acción',
        message: '',
        details: [],
        okLabel: 'Continuar',
        danger: false
      },
      options || {}
    );

    return new Promise((resolve) => {
      els.confirmTitle.textContent = settings.title;
      els.confirmMessage.textContent = settings.message;
      els.confirmDetails.replaceChildren();
      const details = Array.isArray(settings.details) ? settings.details : [];
      if (details.length > 0) {
        for (const detail of details) {
          els.confirmDetails.append(el('li', { text: String(detail) }));
        }
        els.confirmDetails.hidden = false;
      } else {
        els.confirmDetails.hidden = true;
      }
      els.confirmOk.textContent = settings.okLabel;
      els.confirmOk.className = `btn ${settings.danger ? 'btn-danger' : 'btn-primary'}`;
      els.confirmDialog.returnValue = '';

      if (els.confirmDialog.open) {
        els.confirmDialog.close();
      }

      const onClose = () => {
        els.confirmDialog.removeEventListener('close', onClose);
        resolve(els.confirmDialog.returnValue === 'ok');
      };
      els.confirmDialog.addEventListener('close', onClose);
      els.confirmDialog.showModal();
    });
  }

  function showErrorsDialog(title, summary, errors) {
    els.errorsTitle.textContent = title;
    els.errorsSummary.textContent = summary;
    els.errorsList.replaceChildren();

    const limit = 50;
    errors.slice(0, limit).forEach((error) => {
      els.errorsList.append(
        el('li', {}, [
          el('span', { text: error.message }),
          error.path ? el('span', { class: 'error-path', text: ` (${error.path})` }) : null
        ])
      );
    });

    if (errors.length > limit) {
      els.errorsList.append(
        el('li', { text: `Y ${errors.length - limit} problema(s) más. Corrige los anteriores y vuelve a intentarlo.` })
      );
    }

    if (els.errorsDialog.open) {
      els.errorsDialog.close();
    }
    els.errorsDialog.showModal();
  }

  function handleJsonDialogClose() {
    state.jsonLive = false;
    state.jsonRefreshToken += 1;
    if (state.jsonRefreshTimer) {
      clearTimeout(state.jsonRefreshTimer);
      state.jsonRefreshTimer = null;
    }
  }

  function setLiveJsonButtons(enabled) {
    els.btnCopyLiveJson.disabled = !enabled;
    els.btnDownloadLiveJson.disabled = !enabled;
  }

  function showJsonDialog(text) {
    if (els.jsonDialog.open) {
      els.jsonDialog.close();
    }
    state.jsonLive = false;
    state.liveJsonRecord = null;
    state.liveJsonValid = false;
    els.jsonNote.textContent =
      'Copia este contenido y guárdalo como archivo .json si la descarga automática no funciona.';
    els.jsonStatus.className = 'json-status';
    els.jsonStatus.textContent = 'Vista estática. Abre «Ver JSON» para actualizarla mientras editas.';
    setLiveJsonButtons(false);
    els.jsonText.value = text;
    els.jsonDialog.showModal();
    els.jsonText.focus();
    els.jsonText.select();
  }

  function openLiveJsonPanel() {
    if (els.jsonDialog.open) {
      els.jsonDialog.close();
    }
    state.jsonLive = true;
    state.liveJsonRecord = null;
    state.liveJsonValid = false;
    els.jsonNote.textContent =
      'Vista previa en vivo. Se actualiza automáticamente al modificar el registro. «Copiar» no marca el registro como exportado; «Descargar» sí.';
    els.jsonStatus.className = 'json-status';
    els.jsonStatus.textContent = 'Generando vista previa…';
    els.jsonText.value = '';
    setLiveJsonButtons(false);
    els.jsonDialog.showModal();
    refreshLiveJson();
  }

  function scheduleLiveJsonRefresh() {
    if (!state.jsonLive || !els.jsonDialog.open) {
      return;
    }
    if (state.jsonRefreshTimer) {
      clearTimeout(state.jsonRefreshTimer);
    }
    state.jsonRefreshTimer = setTimeout(() => {
      state.jsonRefreshTimer = null;
      refreshLiveJson();
    }, 400);
  }

  async function refreshLiveJson() {
    if (!state.jsonLive || !els.jsonDialog.open) {
      return;
    }

    const token = state.jsonRefreshToken + 1;
    state.jsonRefreshToken = token;

    try {
      const record = await buildExportRecord();
      const validation = Validate.validateRecord(record);
      let chainValid = true;
      let hashValid = true;
      if (validation.valid) {
        const chainResult = await Chain.verifyChain(record.entries);
        chainValid = chainResult.valid;
        hashValid = await Chain.verifyRecordHash(record);
      }
      if (token !== state.jsonRefreshToken || !state.jsonLive) {
        return;
      }

      state.liveJsonRecord = record;
      state.liveJsonValid = validation.valid && chainValid && hashValid;
      const contentChars = attachmentContentChars(record.entries);
      if (contentChars > LIVE_JSON_BUDGET) {
        els.jsonText.value = '';
        setLiveJsonButtons(false);
        if (state.liveJsonValid) {
          els.btnDownloadLiveJson.disabled = false;
        }
        els.jsonStatus.className = 'json-status is-warning';
        els.jsonStatus.textContent =
          'El registro incluye adjuntos demasiado grandes para mostrarlos en la vista previa. Puedes descargarlo con «Descargar» o «Exportar JSON».';
        return;
      }
      els.jsonText.value = JSON.stringify(record, null, 2);

      if (state.liveJsonValid) {
        setLiveJsonButtons(true);
        els.jsonStatus.className = 'json-status is-success';
        els.jsonStatus.textContent = 'Vista previa válida. Puedes copiarla o descargarla.';
      } else {
        setLiveJsonButtons(false);
        els.jsonStatus.className = 'json-status is-warning';
        const count = validation.errors.length;
        if (count > 0) {
          els.jsonStatus.textContent = `Borrador: el registro aún no es válido (${count} problema${count === 1 ? '' : 's'}). Corrige los datos para poder copiar o descargar.`;
        } else {
          els.jsonStatus.textContent =
            'Borrador: la verificación de integridad no ha pasado. Corrige los datos para poder copiar o descargar.';
        }
      }
    } catch (err) {
      if (token !== state.jsonRefreshToken || !state.jsonLive) {
        return;
      }
      state.liveJsonRecord = null;
      state.liveJsonValid = false;
      setLiveJsonButtons(false);
      els.jsonStatus.className = 'json-status is-warning';
      els.jsonStatus.textContent = 'No se pudo generar la vista previa del JSON.';
    }
  }

  async function handleLiveCopy() {
    if (!state.liveJsonValid || !state.liveJsonRecord) {
      return;
    }
    const text = els.jsonText.value;
    if (!text) {
      return;
    }
    if (text.length > LIVE_JSON_BUDGET) {
      showToast(
        'La vista previa es demasiado grande para copiarla. Usa «Exportar JSON» para descargarla.',
        'warning',
        9000
      );
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        showToast('JSON copiado al portapapeles. No se ha marcado como exportado.', 'success');
      } else {
        els.jsonText.focus();
        els.jsonText.select();
        showToast(
          'No se pudo copiar automáticamente. El texto está seleccionado para copiarlo a mano.',
          'info',
          6000
        );
      }
    } catch (err) {
      els.jsonText.focus();
      els.jsonText.select();
      showToast(
        'No se pudo copiar automáticamente. El texto está seleccionado para copiarlo a mano.',
        'warning',
        6000
      );
    }
  }

  async function handleLiveDownload() {
    if (!state.liveJsonValid || !state.liveJsonRecord) {
      return;
    }
    try {
      const record = await exportRecord();
      if (record) {
        const summary = Attachments ? Attachments.summarizeAttachments(record.entries) : null;
        if (summary && summary.withoutContent > 0) {
          showToast(
            `JSON exportado. ${summary.withoutContent} adjunto(s) solo conservan la huella y no se podrán recuperar del archivo.`,
            'warning',
            9000
          );
        } else {
          showToast('JSON exportado correctamente.', 'success');
        }
      }
    } catch (err) {
      showToast('No se pudo generar el JSON. Inténtalo de nuevo.', 'error', 8000);
    }
  }

  function renderFormErrors(container, errors) {
    container.replaceChildren();
    const list = el('ul');
    for (const error of errors) {
      list.append(el('li', { text: error.message }));
    }
    container.append(el('strong', { text: 'Revisa los siguientes campos:' }), list);
    container.hidden = false;
  }

  function clearSetupErrors() {
    els.setupErrors.hidden = true;
    els.setupErrors.replaceChildren();
    for (const input of els.setupForm.querySelectorAll('[aria-invalid="true"]')) {
      input.removeAttribute('aria-invalid');
    }
  }

  function clearEntryErrors() {
    els.entryErrors.hidden = true;
    els.entryErrors.replaceChildren();
    for (const input of els.entryForm.querySelectorAll('[aria-invalid="true"]')) {
      input.removeAttribute('aria-invalid');
    }
  }

  function focusFirstError(errors) {
    if (!errors || errors.length === 0) {
      return;
    }
    const field = errors[0].field;
    const map = {
      student_id: els.setupStudentId,
      assignment_id: els.setupAssignmentId,
      assignment_title: els.setupAssignmentTitle,
      course: els.setupCourse,
      declaration: els.setupDeclaration,
      occurred_at: els.entryOccurred,
      model_name: els.entryModel,
      model_provider: els.entryProvider,
      access: els.entryForm.querySelector('input[name="access"]'),
      prompt: els.entryPrompt,
      attachments: els.entryAttachments
    };
    const target = map[field];
    if (target) {
      target.setAttribute('aria-invalid', 'true');
      target.focus();
    }
  }

  function showToast(message, type, duration, action) {
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }

    els.toast.className = `toast toast-${type || 'info'}`;
    els.toast.replaceChildren(el('span', { class: 'toast-message', text: message }));

    if (action) {
      els.toast.append(
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm toast-action',
          text: action.label,
          onclick: () => {
            hideToast();
            action.onClick();
          }
        })
      );
    }

    els.toast.hidden = false;
    const timeout = typeof duration === 'number' ? duration : 4500;
    if (timeout > 0) {
      state.toastTimer = setTimeout(hideToast, timeout);
    }
  }

  function hideToast() {
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    els.toast.hidden = true;
    els.toast.replaceChildren();
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return dateFormatter.format(date);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '—';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function truncate(text, max) {
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, max - 1).trimEnd()}…`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function localInputToIso(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const absolute = Math.abs(offset);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  }

  function isoToLocalInput(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
