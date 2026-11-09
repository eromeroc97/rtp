# RTP — Registro de Trazabilidad de Prompts

Herramienta web estática para documentar, iteración a iteración, el proceso de colaboración con herramientas de inteligencia artificial generativa (IAG) durante la elaboración de un trabajo académico.

RTP no evalúa el resultado: registra el **proceso**. Cada interacción conserva el modelo utilizado, el tipo de acceso, los adjuntos y el texto exacto del prompt. Al terminar, la herramienta exporta un JSON validado y sellado con una cadena de hashes SHA-256 que permite detectar modificaciones posteriores.

La aplicación funciona sin backend, sin instalación y sin conexión a red. Puede abrirse directamente desde el sistema de archivos o publicarse en GitHub Pages.

---

## Inicio rápido

### Abrir en local

Abre `index.html` en un navegador moderno. No hace falta compilar nada.

También puedes servir la carpeta con:

```bash
npm run serve
```

y visitar <http://localhost:8080>.

### Publicar en GitHub Pages

1. Crea un repositorio con el contenido de esta carpeta como raíz.
2. Sube el proyecto a la rama `main` o `master`.
3. En **Settings → Pages**, selecciona **GitHub Actions** como origen.
4. El flujo `.github/workflows/pages.yml` publicará solo `index.html` y `assets/`.
5. La URL resultante será `https://<usuario>.github.io/<repositorio>/`.

---

## Cómo se usa

1. **Datos del trabajo.** Identificador del estudiante, nombre opcional, identificador y título del trabajo, curso y aceptación de la declaración de autoría.
2. **Nueva iteración.** Fecha y hora de la interacción, modelo, proveedor opcional, acceso gratuito o de pago, adjuntos y prompt exacto. El prompt y los adjuntos empiezan vacíos; el modelo, el proveedor y el acceso se precargan desde la última iteración guardada.
3. **Exportar JSON.** Genera el archivo definitivo, calcula la cadena de integridad y valida el resultado contra el esquema.
4. **Cargar JSON.** Disponible tanto en la pantalla de configuración como en la vista del registro. Valida el esquema, la cadena y el `record_hash`, muestra un resumen y reemplaza el registro actual —incluidos los datos del trabajo y la declaración— para seguir añadiendo iteraciones.

Cada navegador mantiene **un único registro activo**. Para trabajar con otro trabajo, exporta el actual y carga el nuevo. Los datos se guardan en `localStorage` con las claves `rtp:v1:draft`, `rtp:v1:ui`, `rtp:v1:form-draft` (modelo, proveedor y acceso del último formulario) y `rtp:v1:theme` (preferencia de tema).

El borrador automático del formulario **nunca guarda el prompt ni los adjuntos**: al abrir una nueva iteración esos campos aparecen vacíos. Solo se conservan el modelo, el proveedor y el tipo de acceso.

La app avisa antes de cerrar la pestaña si hay cambios sin exportar. Aun así, `localStorage` puede borrarse al limpiar el navegador: el entregable es el JSON exportado.

### Tema y vista previa del JSON

La interfaz arranca en **tema claro**. El selector de la cabecera permite elegir **Claro**, **Oscuro** o **Sistema**; la preferencia se conserva en `rtp:v1:theme`.

El botón **Ver JSON** abre una vista previa en vivo que se actualiza automáticamente al modificar el registro. Si el registro aún no es válido, el JSON se muestra como borrador y las acciones de copiar y descargar quedan deshabilitadas. **Copiar no marca el registro como exportado; Descargar sí.**

### Cargar un registro anterior

**Cargar JSON** —disponible en la pantalla de configuración y en la vista del registro— valida el esquema, la cadena de integridad y el `record_hash` antes de mostrar un resumen del archivo. Al confirmar, el registro actual se reemplaza y se conservan `recorded_at`, la declaración y la auditoría originales.

El estado «cargado desde archivo» se mantiene hasta la primera edición o hasta que se exporte de nuevo. Las entradas antiguas conservan sus hashes al añadir nuevas iteraciones. Cargar un archivo **no fusiona** dos trazas: sustituye el registro activo.

### Adjuntos

De cada archivo se guardan únicamente:

- nombre,
- tamaño en bytes,
- tipo MIME,
- huella SHA-256.

El contenido se lee en local solo para calcular la huella y **no se almacena ni se envía a ningún servidor**.

---

## Estructura del JSON

El archivo exportado cumple el esquema [`schema/trace.schema.json`](schema/trace.schema.json), basado en JSON Schema 2020-12.

```json
{
  "schema_version": "1.0.0",
  "tool": { "name": "RTP", "version": "1.0.0" },
  "exported_at": "2026-11-09T18:42:11.000Z",
  "student": { "id": "e.romero", "name": "Eugenio Romero Ciudad" },
  "assignment": {
    "id": "GSyA-2026-P1",
    "title": "Trabajo de investigación teórica",
    "course": "2026/27"
  },
  "declaration": {
    "accepted": true,
    "version": "1.0",
    "accepted_at": "2026-11-09T17:00:00.000Z"
  },
  "entries": [
    { "id": "e-0001", "sequence": 1, "…": "…" }
  ],
  "audit_log": [
    { "type": "record_created", "at": "2026-11-09T17:00:00.000Z" }
  ],
  "integrity": {
    "algorithm": "SHA-256",
    "canonicalization": "json-sorted-keys-v1",
    "entry_count": 3,
    "chain_head": "…",
    "record_hash": "…"
  }
}
```

Cada entrada de `entries` contiene:

| Campo | Descripción |
| --- | --- |
| `id` | Identificador estable con formato `e-0001`. |
| `sequence` | Posición cronológica dentro de la traza. |
| `occurred_at` | Momento de la interacción, en ISO 8601 con zona horaria. |
| `recorded_at` | Momento en que la entrada se registró en RTP. |
| `model` | Proveedor opcional, nombre del modelo y acceso `free`/`paid`. |
| `attachments` | Lista de metadatos y huellas SHA-256. |
| `prompt` | Texto exacto enviado a la IAG. |
| `prev_hash` | Hash de la entrada anterior o `GENESIS`. |
| `hash` | Hash SHA-256 de la entrada. |

La separación entre `occurred_at` y `recorded_at` permite detectar registros introducidos con posterioridad. La app rechaza fechas de interacción futuras y, al editar, no permite fijar una interacción posterior al momento en que se registró originalmente.

El campo `audit_log` conserva eventos como creación, edición, borrado, restauración, importación o reinicio del registro.

Puedes ver un ejemplo completo en [`examples/ejemplo-traza.json`](examples/ejemplo-traza.json).

---

## Integridad

La integridad se calcula **al exportar**, no en cada edición.

1. Cada entrada se serializa con las claves ordenadas (`json-sorted-keys-v1`).
2. Se calcula su SHA-256 incluyendo `sequence` y `prev_hash`.
3. La primera entrada enlaza con `GENESIS`; cada una enlaza con el hash de la anterior.
4. El `record_hash` cubre el registro completo **excepto** `exported_at` e `integrity`.

Al cargar un JSON, RTP verifica la cadena y el hash global antes de mostrar el resumen. Si algo no cuadra, rechaza la carga por defecto. Existe una opción avanzada para cargar de todos modos, pero el incidente queda registrado en `audit_log` con `chain_valid` y `record_hash_valid` a `false`.

La vista previa en vivo vuelve a calcular la cadena y el `record_hash` antes de habilitar la descarga, de modo que el archivo que se descarga es el mismo registro que se está viendo.

Esta comprobación es **tamper-evident**, no tamper-proof: permite detectar ediciones accidentales o manipulaciones simples, pero no impide que alguien con conocimientos técnicos reconstruya la cadena desde cero. No sustituye a una firma digital, a un sello de tiempo de una autoridad certificadora ni a la revisión docente.

---

## Privacidad

- No hay backend, llamadas de red ni telemetría.
- Todo el estado vive en el navegador.
- Los archivos adjuntos no se suben: solo se calcula su huella en local.
- Los prompts pueden contener datos personales o confidenciales. RTP no los envía a ningún sitio, pero conviene revisar el JSON antes de compartirlo y evitar usar equipos compartidos.
- En un equipo compartido, cualquiera con acceso al navegador puede ver el registro guardado.

---

## Configuración

El catálogo de modelos, el curso por defecto, el texto de la declaración y los límites se editan en [`assets/config.js`](assets/config.js):

```js
models: [
  { provider: 'OpenAI', name: 'GPT-4o' },
  { provider: 'Anthropic', name: 'Claude 3.5 Sonnet' }
],
defaultCourse: '2026/27',
limits: {
  maxPromptChars: 100000,
  maxAttachmentMB: 100,
  maxAttachmentsPerEntry: 20
}
```

El catálogo solo alimenta las sugerencias del formulario: el estudiante puede escribir cualquier modelo o proveedor.

Si se modifica el esquema, hay que mantener sincronizados:

- `schema/trace.schema.json` (contrato),
- `assets/validate.js` (validador de la app),
- `scripts/generate-example.cjs` y `examples/ejemplo-traza.json`.

---

## Pruebas

```bash
npm install
npm test
```

Las pruebas cubren:

- vectores conocidos de SHA-256,
- canonicalización estable,
- generación y verificación de la cadena,
- detección de prompts modificados, entradas reordenadas y `prev_hash` manipulados,
- verificación del `record_hash`,
- validación del ejemplo con el validador propio y con Ajv,
- arranque de la interfaz con jsdom: creación del registro, alta de una iteración con adjunto, exportación de un JSON verificable, carga de un registro válido y rechazo de archivos inválidos o manipulados,
- carga de un JSON desde la pantalla de configuración, recuperando datos del trabajo y declaración,
- nueva iteración con prompt y adjuntos vacíos, y modelo/proveedor/acceso precargados de la última iteración,
- borrador del formulario que no arrastra el prompt ni los adjuntos,
- duplicado de una iteración que conserva prompt y adjuntos,
- tema claro por defecto y persistencia de la preferencia,
- vista previa JSON en vivo, distinguiendo borrador y registro válido, y comprobando que copiar no marca el registro como exportado,
- carga de un registro anterior con resumen, conservación de hashes y `recorded_at` al continuar la traza.

El ejemplo se regenera con:

```bash
npm run example
```

---

## Estructura del proyecto

```text
.
├── index.html                  # Interfaz completa
├── assets/
│   ├── app.js                  # Estado, CRUD, exportación e importación
│   ├── chain.js                # Canonicalización y cadena SHA-256
│   ├── config.js               # Configuración editable
│   ├── sha256.js               # SHA-256 con Web Crypto y fallback
│   ├── styles.css              # Estilos, temas y vista previa JSON
│   └── validate.js             # Validador del esquema
├── schema/trace.schema.json    # JSON Schema 2020-12
├── examples/ejemplo-traza.json # Registro de ejemplo válido
├── scripts/generate-example.cjs
├── tests/                      # Pruebas con node:test
├── .github/workflows/pages.yml # Publicación en GitHub Pages
└── package.json
```

---

## Limitaciones

- Un registro activo por navegador.
- El borrador depende de `localStorage`; si se limpia, se pierde.
- El autoguardado no escribe archivos en disco: para conservar una copia verificable hay que descargar el JSON.
- Cargar un JSON reemplaza el registro activo; no fusiona dos trazas.
- La cadena detecta manipulaciones, pero no las impide.
- La carga con integridad inválida requiere una confirmación explícita y queda auditada.
- La herramienta documenta el proceso; no decide si un uso de la IAG es adecuado. Esa valoración corresponde al estudiante y al profesorado.

---

## Contexto

RTP se desarrolló como soporte para la evaluación procesal automatizada descrita en el artículo de referencia (JENUI-X). El objetivo es que el registro de interacciones sea comparable, verificable y fácil de entregar junto con la memoria del trabajo.
