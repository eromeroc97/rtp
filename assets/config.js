(function (root, factory) {
  const config = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = config;
  } else {
    root.RTP_CONFIG = config;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    appName: 'RTP',
    appFullName: 'Registro de Trazabilidad de Prompts',
    version: '1.0.0',
    schemaVersion: '1.0.0',
    defaultCourse: '2026/27',
    defaultAssignment: {
      id: '',
      title: ''
    },
    models: [
      { provider: 'OpenAI', name: 'GPT-4o' },
      { provider: 'OpenAI', name: 'GPT-4.1' },
      { provider: 'Anthropic', name: 'Claude 3.5 Sonnet' },
      { provider: 'Anthropic', name: 'Claude 3.7 Sonnet' },
      { provider: 'Google', name: 'Gemini 1.5 Pro' },
      { provider: 'Google', name: 'Gemini 2.0 Flash' },
      { provider: 'Meta', name: 'Llama 3.1' },
      { provider: 'Mistral', name: 'Mistral Large' },
      { provider: 'DeepSeek', name: 'DeepSeek-V3' }
    ],
    declaration: {
      version: '1.0',
      text: 'Declaro que este registro recoge de forma cronológica y fiel las interacciones con herramientas de IAG utilizadas para la elaboración del trabajo, y que el texto de los prompts es exacto. Entiendo que la ausencia de interacciones o la manipulación del registro puede afectar a la evaluación del proceso.'
    },
    limits: {
      maxPromptChars: 100000,
      maxAttachmentMB: 100,
      maxAttachmentsPerEntry: 20
    }
  };
});
