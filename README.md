# RTP — Registro de Trazabilidad de Prompts

Herramienta web estática para documentar, iteración a iteración, el proceso de colaboración con herramientas de inteligencia artificial generativa (IAG) durante la elaboración de un trabajo académico.

RTP no evalúa el resultado: registra el **proceso**. Cada interacción conserva el modelo utilizado, el tipo de acceso, los adjuntos —con su contenido comprimido y recuperable— y el texto exacto del prompt. Al terminar, la herramienta exporta un JSON validado y sellado con una cadena de hashes SHA-256 que permite detectar modificaciones posteriores.

La aplicación funciona sin backend, sin instalación y sin conexión a red. Puede abrirse directamente desde el sistema de archivos o publicarse en GitHub Pages.

Para el uso paso a paso, consulta la [guía de uso](GUIA.md).

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

La aplicación es estática, así que GitHub Pages puede publicarla directamente desde la rama, sin ejecutar GitHub Actions.

1. Crea un repositorio con el contenido de esta carpeta como raíz.
2. Sube el proyecto a la rama `main` o `master`.
3. En **Settings → Pages**, en **Source**, elige **Deploy from a branch**.
4. Selecciona la rama (`main` o `master`) y la carpeta `/ (root)`.
5. Guarda. GitHub publica el contenido de la raíz y el archivo `.nojekyll` evita que Jekyll procese el sitio.
6. La URL resultante será `https://<usuario>.github.io/<repositorio>/`.

Cada `push` a esa rama actualiza la web automáticamente.

> **Alternativa con GitHub Actions.** El flujo `.github/workflows/pages.yml` publica solo `index.html` y `assets/`. Está limitado a ejecución manual (`workflow_dispatch`) porque requiere que la cuenta tenga Actions operativo y que **Settings → Pages → Source** sea **GitHub Actions**. Para volver a usarlo, cambia el origen a **GitHub Actions** y añade `push` al disparador del flujo.

---

## Cómo se usa

1. **Datos del trabajo.** Identificador del estudiante, nombre opcional, identificador y título del trabajo, curso y aceptación de la declaración de autoría.
2. **Nueva iteración.** Fecha y hora de la interacción, modelo, proveedor opcional, acceso gratuito o de pago, adjuntos y prompt exacto. El prompt y los adjuntos empiezan vacíos; el modelo, el proveedor y el acceso se precargan desde la última iteración guardada.
3. **Exportar JSON.** Genera el archivo definitivo, calcula la cadena de integridad y valida el resultado contra el esquema.
4. **Cargar JSON.** Disponible tanto en la pantalla de configuración como en la vista del registro. Valida el esquema, la cadena, el `record_hash` y el contenido de los adjuntos, muestra un resumen y reemplaza el registro actual —incluidos los datos del trabajo y la declaración— para seguir añadiendo iteraciones.

Cada navegador mantiene **un único registro activo**. Para trabajar con otro trabajo, exporta el actual y carga el nuevo. Los datos se guardan en `localStorage` con las claves `rtp:v1:draft`, `rtp:v1:ui`, `rtp:v1:form-draft` (modelo, proveedor y acceso del último formulario) y `rtp:v1:theme` (preferencia de tema).

El borrador automático del formulario **nunca guarda el prompt ni los adjuntos**: al abrir una nueva iteración esos campos aparecen vacíos. Solo se conservan el modelo, el proveedor y el tipo de acceso.

El borrador del registro sí intenta conservar el contenido de los adjuntos. Si supera el espacio disponible en `localStorage`, se guardan solo los metadatos, se avisa en la interfaz y los adjuntos afectados se marcan como «Solo huella». El registro en memoria y el JSON exportado mantienen el contenido completo mientras la pestaña siga abierta.

La app avisa antes de cerrar la pestaña si hay cambios sin exportar. Aun así, `localStorage` puede borrarse al limpiar el navegador: el entregable es el JSON exportado.

### Tema y vista previa del JSON

La interfaz arranca en **tema claro**. El selector de la cabecera permite elegir **Claro**, **Oscuro** o **Sistema**; la preferencia se conserva en `rtp:v1:theme`.

El botón **Ver JSON** abre una vista previa en vivo que se actualiza automáticamente al modificar el registro. Si el registro aún no es válido, el JSON se muestra como borrador y las acciones de copiar y descargar quedan deshabilitadas. **Copiar no marca el registro como exportado; Descargar sí.**

### Cargar un registro anterior

**Cargar JSON** —disponible en la pantalla de configuración y en la vista del registro— valida el esquema, la cadena de integridad y el `record_hash` antes de mostrar un resumen del archivo. Al confirmar, el registro actual se reemplaza y se conservan `recorded_at`, la declaración y la auditoría originales.

El estado «cargado desde archivo» se mantiene hasta la primera edición o hasta que se exporte de nuevo. Las entradas antiguas conservan sus hashes al añadir nuevas iteraciones. Cargar un archivo **no fusiona** dos trazas: sustituye el registro activo.

### Adjuntos

Cada archivo se comprime en local con gzip (`CompressionStream`) y se incrusta en el JSON en base64. De cada adjunto se guarda:

- nombre,
- tamaño original en bytes,
- tipo MIME,
- huella SHA-256 del archivo original,
- contenido comprimido, con su tamaño, su propia huella SHA-256 y la codificación.

Si el navegador no soporta `CompressionStream` o la compresión no reduce el tamaño, el contenido se guarda sin comprimir (`compression: "none"`).

Los límites son **10 MB por archivo** y **50 MB por registro** (sumando los tamaños originales). No se aplican a registros antiguos ya cargados, para no romper la compatibilidad.

Desde la línea de tiempo, cada adjunto recuperable muestra el botón **Descargar**. RTP decodifica, descomprime y verifica las dos huellas antes de entregar el archivo. Los adjuntos de registros 1.0.0 o los que se perdieron del borrador por falta de espacio se muestran como **Solo huella**.

> **El contenido no se cifra.** Cualquiera que tenga el JSON puede extraer los archivos. La compresión reduce el tamaño, no protege la confidencialidad.

---

## Estructura del JSON

El archivo exportado cumple el esquema [`schema/trace.schema.json`](schema/trace.schema.json), basado en JSON Schema 2020-12. El esquema actual es **1.1.0**. La app sigue aceptando registros **1.0.0**: los carga en memoria y, al volver a exportar, escribe la versión 1.1.0.

```json
{
  "schema_version": "1.1.0",
  "tool": { "name": "RTP", "version": "1.1.0" },
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
| `attachments` | Lista de adjuntos con metadatos, huella original y, si está disponible, contenido comprimido recuperable. |
| `prompt` | Texto exacto enviado a la IAG. |
| `prev_hash` | Hash de la entrada anterior o `GENESIS`. |
| `hash` | Hash SHA-256 de la entrada. |

La separación entre `occurred_at` y `recorded_at` permite detectar registros introducidos con posterioridad. La app rechaza fechas de interacción futuras y, al editar, no permite fijar una interacción posterior al momento en que se registró originalmente.

Cada adjunto con contenido tiene esta forma:

```json
{
  "name": "apuntes.pdf",
  "size_bytes": 182734,
  "mime_type": "application/pdf",
  "sha256": "<sha256 del archivo original>",
  "content": {
    "encoding": "base64",
    "compression": "gzip",
    "original_size_bytes": 182734,
    "compressed_size_bytes": 48123,
    "compressed_sha256": "<sha256 del contenido comprimido>",
    "data": "<base64 del contenido comprimido>"
  }
}
```

La cadena de transformación se deduce de los metadatos: `sha256` original → `compression` → `compressed_sha256` → `encoding: base64` → `data`. Si `compression` es `"none"`, `compressed_sha256` coincide con `sha256` y `compressed_size_bytes` con `size_bytes`. `content` es opcional para poder cargar registros 1.0.0 y borradores que perdieron el contenido.

El campo `audit_log` conserva eventos como creación, edición, borrado, restauración, importación o reinicio del registro. Los eventos de importación incluyen `attachments_valid` junto a `chain_valid` y `record_hash_valid`.

Puedes ver un ejemplo completo en [`examples/ejemplo-traza.json`](examples/ejemplo-traza.json).

---

## Integridad

La integridad se calcula **al exportar**, no en cada edición.

1. Cada entrada se serializa con las claves ordenadas (`json-sorted-keys-v1`).
2. Se calcula su SHA-256 incluyendo `sequence` y `prev_hash`.
3. La primera entrada enlaza con `GENESIS`; cada una enlaza con el hash de la anterior.
4. El `record_hash` cubre el registro completo **excepto** `exported_at` e `integrity`.

El contenido incrustado y los metadatos de compresión forman parte de la entrada, así que la cadena y el `record_hash` cubren también los archivos.

Al cargar un JSON, RTP verifica la cadena, el hash global y, para cada adjunto con contenido, la decodificación base64, los tamaños, la huella del contenido comprimido, la descompresión con límite y la huella del archivo original. Si algo no cuadra, rechaza la carga por defecto. Existe una opción avanzada para cargar de todos modos, pero el incidente queda registrado en `audit_log` con `chain_valid`, `record_hash_valid` y `attachments_valid` a `false`.

La vista previa en vivo vuelve a calcular la cadena y el `record_hash` antes de habilitar la descarga, de modo que el archivo que se descarga es el mismo registro que se está viendo.

Esta comprobación es **tamper-evident**, no tamper-proof: permite detectar ediciones accidentales o manipulaciones simples, pero no impide que alguien con conocimientos técnicos reconstruya la cadena desde cero. No sustituye a una firma digital, a un sello de tiempo de una autoridad certificadora ni a la revisión docente.

---

## Privacidad

- No hay backend, llamadas de red ni telemetría.
- Todo el estado vive en el navegador.
- Los archivos adjuntos no se suben: se comprimen y se incrustan en el JSON en local. **No se cifran**, así que cualquiera con el archivo puede extraerlos.
- Un JSON con adjuntos puede ser mucho más grande que el archivo original. La codificación base64 añade aproximadamente un 33 % y los archivos ya comprimidos pueden no reducirse.
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
  maxAttachmentMB: 10,
  maxTotalAttachmentMB: 50,
  maxAttachmentsPerEntry: 20,
  maxDraftContentMB: 4,
  maxLiveJsonMB: 8
}
```

`maxDraftContentMB` es el presupuesto de contenido que se intenta guardar en `localStorage`; si se supera, el borrador conserva solo los metadatos. `maxLiveJsonMB` limita la vista previa y el copiado para no bloquear el navegador con registros grandes.

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
- detección de modificaciones en el contenido de un adjunto,
- verificación del `record_hash`,
- codificación y recuperación de adjuntos (texto, binario, vacío, `compression: none`),
- detección de base64 inválido, huellas manipuladas y límites de descompresión,
- validación del ejemplo con el validador propio y con Ajv,
- compatibilidad con registros 1.0.0 y rechazo de `content` en esa versión,
- arranque de la interfaz con jsdom: creación del registro, alta de una iteración con adjunto, exportación de un JSON verificable, carga de un registro válido y rechazo de archivos inválidos o manipulados,
- descarga de un adjunto recuperado desde la línea de tiempo,
- importación de un registro 1.0.0 con adjuntos marcados como «Solo huella»,
- importación con contenido corrupto, confirmación explícita y auditoría con `attachments_valid: false`,
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
│   ├── attachments.js          # Compresión gzip, base64 y recuperación de adjuntos
│   ├── chain.js                # Canonicalización y cadena SHA-256
│   ├── config.js               # Configuración editable
│   ├── sha256.js               # SHA-256 con Web Crypto y fallback
│   ├── styles.css              # Estilos, temas y vista previa JSON
│   └── validate.js             # Validador del esquema
├── schema/trace.schema.json    # JSON Schema 2020-12
├── examples/ejemplo-traza.json # Registro de ejemplo válido
├── scripts/generate-example.cjs
├── tests/                      # Pruebas con node:test
├── GUIA.md                     # Guía de uso para el alumnado
├── .nojekyll                   # Evita el procesado Jekyll en GitHub Pages
├── .github/workflows/pages.yml # Publicación alternativa con GitHub Actions
└── package.json
```

---

## Limitaciones

- Un registro activo por navegador.
- El borrador depende de `localStorage`; si se limpia, se pierde. Si el contenido de los adjuntos no cabe, el borrador conserva solo los metadatos y lo advierte.
- El autoguardado no escribe archivos en disco: para conservar una copia verificable hay que descargar el JSON.
- Los adjuntos se comprimen, no se cifran. La confidencialidad depende de cómo se comparta el JSON.
- Los registros 1.0.0 no contienen el contenido de los adjuntos: solo conservan la huella.
- Cargar un JSON reemplaza el registro activo; no fusiona dos trazas.
- La cadena detecta manipulaciones, pero no las impide.
- La carga con integridad inválida requiere una confirmación explícita y queda auditada.
- La herramienta documenta el proceso; no decide si un uso de la IAG es adecuado. Esa valoración corresponde al estudiante y al profesorado.

---

## Contexto

RTP se desarrolló como soporte para la evaluación procesal automatizada descrita en el artículo de referencia (JENUI-X). El objetivo es que el registro de interacciones sea comparable, verificable y fácil de entregar junto con la memoria del trabajo.
