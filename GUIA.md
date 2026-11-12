# Guía de uso de RTP

RTP (**Registro de Trazabilidad de Prompts**) sirve para dejar constancia, iteración a iteración, de cómo has utilizado herramientas de inteligencia artificial generativa para elaborar un trabajo académico.

No evalúa el resultado: registra el **proceso**. De cada interacción se guarda el modelo, el tipo de acceso, los adjuntos —con su contenido comprimido para poder recuperarlos— y el texto exacto del prompt. Al terminar, la herramienta genera un archivo JSON con una cadena de hashes SHA-256 que permite detectar modificaciones posteriores.

Esta guía está pensada para quien va a usar la web. Si buscas detalles técnicos del formato o del código, consulta el [README](README.md).

## Flujo en cuatro pasos

1. **Configura** los datos del trabajo y acepta la declaración.
2. **Registra** cada interacción con la IA: modelo, acceso, adjuntos y prompt exacto.
3. **Revisa** la línea de tiempo y corrige lo que haga falta.
4. **Exporta** el JSON y guárdalo junto con la memoria del trabajo.

---

## 1. Antes de empezar

### Qué necesitas

- Un navegador moderno (Chrome, Edge, Firefox o Safari actualizados).
- Los datos del trabajo: identificador del estudiante, identificador y título del trabajo, y curso.
- Los prompts **exactos** que has enviado a la IA. Si aún no los tienes, ve registrando cada interacción en el momento.
- Opcionalmente, los archivos que adjuntaste en cada consulta.

### Cómo abrir la herramienta

- **En línea:** <https://eromeroc97.github.io/rtp/>
- **En local:** abre el archivo `index.html` en el navegador. No hace falta instalar nada ni tener conexión.

No hay que crear ninguna cuenta ni iniciar sesión.

> **Importante:** RTP guarda el trabajo en el navegador, no en la nube. El entregable es el **JSON exportado**, no lo que queda en pantalla. Si limpias los datos del navegador o usas otro equipo, el registro no viaja contigo.

---

## 2. Configurar el registro

La primera vez que abres la herramienta verás la pantalla **Configura tu registro**.

Rellena estos campos:

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Identificador del estudiante | Sí | Expediente, correo o identificador que use tu profesorado. Máximo 64 caracteres. |
| Nombre y apellidos | No | Máximo 120 caracteres. |
| Identificador del trabajo | Sí | Por ejemplo, `GSyA-2026-P1`. Máximo 64 caracteres. |
| Curso | Sí | Por ejemplo, `2026/27`. Máximo 20 caracteres. |
| Título del trabajo | Sí | Máximo 200 caracteres. |

Después, **lee la declaración y marca la casilla de aceptación**. Sin aceptarla no se puede continuar.

Pulsa **Guardar y continuar**.

Si ya tenías un registro exportado y quieres seguir trabajando con él, usa **Cargar JSON existente** en lugar de rellenar los datos (ver [sección 7](#7-continuar-un-registro-existente)).

Puedes cambiar estos datos más adelante con el botón **Datos del trabajo** de la cabecera.

---

## 3. Registrar una iteración

Una **iteración** es una interacción con la IA: una consulta y su respuesta, aunque después hagas varias pruebas dentro del mismo hilo. Lo importante es que quede registrado el prompt exacto de cada envío.

En la pantalla principal pulsa **+ Nueva iteración** y completa el formulario:

| Campo | Obligatorio | Notas |
| --- | --- | --- |
| Fecha y hora de la interacción | Sí | No puede ser futura. Al editar una iteración, tampoco puede ser posterior al momento en que se registró originalmente. |
| Modelo | Sí | Puedes elegirlo de la lista o escribir otro. Máximo 120 caracteres. |
| Proveedor | No | Se rellena solo al elegir un modelo conocido. Máximo 80 caracteres. |
| Tipo de acceso | Sí | **Gratuito** o **De pago**. |
| Archivos adjuntos | No | Hasta 20 archivos por iteración, de 10 MB como máximo cada uno y 50 MB en total por registro. |
| Prompt exacto | Sí | El texto literal enviado a la IA. Máximo 100 000 caracteres. |

Pulsa **Guardar iteración**. La iteración aparece en la línea de tiempo, ordenada por fecha.

### Sobre los adjuntos

RTP guarda de cada archivo su **nombre, tamaño, tipo, huella SHA-256 y contenido comprimido**. El contenido se comprime en tu equipo con gzip y se incrusta en el JSON en base64 para que puedas recuperarlo más adelante. Si el navegador no puede comprimir o la compresión no reduce el tamaño, se guarda sin comprimir, y el JSON lo indica.

Los límites son:

- **10 MB por archivo.**
- **50 MB en total por registro**, sumando los tamaños originales de todos los adjuntos.

Si un archivo supera el límite, se omite y verás un aviso. Si intentas añadir más de 20 en una iteración, solo se añadirán los que quepan.

Desde la línea de tiempo, cada adjunto recuperable muestra el botón **Descargar**. RTP comprueba las huellas y descomprime el contenido antes de entregarte el archivo original. Los adjuntos que solo conservan la huella —por ejemplo, los de registros antiguos— se marcan como **Solo huella** y no se pueden descargar.

> **El contenido no se cifra.** La compresión reduce el tamaño, pero cualquiera que tenga el JSON puede extraer los archivos. No adjuntes documentación confidencial que no compartirías por otros medios.

### Consejos prácticos

- Registra cada interacción **cuando ocurre**, no al final del trabajo: así no se pierden prompts ni fechas.
- Copia el prompt **tal cual**, incluidos errores, saltos de línea y formato.
- Si repites una consulta parecida, usa **Duplicar** y cambia solo lo necesario.
- El formulario recuerda el modelo, el proveedor y el tipo de acceso de la última iteración, pero **nunca** guarda el prompt ni los adjuntos anteriores: empiezan vacíos a propósito.

---

## 4. Revisar y corregir iteraciones

Cada tarjeta de la línea de tiempo muestra la fecha, el modelo, el proveedor, el tipo de acceso, el número de adjuntos y un resumen del prompt. Pulsa **Ver prompt completo** para desplegarlo.

En los adjuntos, cada archivo indica si es **Recuperable** o si solo conserva la huella. Los recuperables incluyen un botón **Descargar** para extraer el archivo original.

Cada iteración tiene tres acciones:

- **Editar:** corrige la fecha, el modelo, el acceso, los adjuntos o el prompt. Los cambios quedan anotados en el historial de auditoría.
- **Duplicar:** abre una nueva iteración con la fecha actual y los mismos datos, adjuntos y prompt, para modificar solo lo que cambie.
- **Eliminar:** borra la iteración. Aparece un aviso con **Deshacer** durante unos segundos; si lo pulsas, se restaura. La eliminación y la restauración también quedan registradas.

Las iteraciones se ordenan automáticamente por la fecha de la interacción. El número `#1`, `#2`… refleja ese orden.

---

## 5. Barra de estado y resumen

En la parte superior de la pantalla principal verás un resumen con el número de iteraciones, modelos distintos, interacciones gratuitas y de pago, adjuntos, adjuntos recuperables y el rango de fechas.

La barra de estado te dice en qué situación está el registro:

- **«Aún no has registrado ninguna iteración»**: todavía no hay nada que exportar.
- **«Hay cambios sin exportar»**: has añadido o modificado algo después de la última exportación.
- **«Registro cargado desde…»**: estás continuando un JSON importado.
- **«Última exportación: … Sin cambios desde entonces»**: el JSON descargado coincide con lo que hay en pantalla.

Si el navegador no permite guardar datos locales, la barra lo avisa: en ese caso exporta el JSON antes de cerrar.

La barra también advierte cuando algún adjunto solo conserva la huella o cuando el borrador del navegador no ha podido guardar todo el contenido por falta de espacio.

---

## 6. Ver el JSON y exportar

### Ver JSON

El botón **Ver JSON** abre una vista previa en vivo del archivo que se exportaría. Se actualiza sola al cambiar el registro.

- Si el registro aún no es válido, verás un **borrador** y los botones de copiar y descargar estarán desactivados, con el número de problemas detectados.
- Si es válido, podrás **Copiar** o **Descargar** desde la propia ventana.
- Si el registro incluye adjuntos muy grandes, la vista previa y el copiado se desactivan para no bloquear el navegador. El botón **Descargar** y **Exportar JSON** siguen disponibles.

### Copiar JSON

El botón **Copiar JSON** de la cabecera copia el contenido al portapapeles. **Copiar no marca el registro como exportado**: solo la descarga lo hace.

### Exportar JSON

Pulsa **Exportar JSON** cuando hayas terminado (o cuando quieras una copia de seguridad). Para que se genere el archivo deben cumplirse estas condiciones:

1. Los datos del trabajo están completos y la declaración aceptada.
2. Hay al menos una iteración registrada.
3. El registro cumple el esquema y la cadena de integridad se verifica.
4. El contenido incrustado de los adjuntos supera la verificación de tamaño y huellas.

Si algo falla, la herramienta muestra qué problemas hay que corregir.

El archivo se descarga con un nombre del estilo:

```
rtp_e.romero_GSyA-2026-P1_20261109-184211.json
```

Es decir: `rtp_<estudiante>_<trabajo>_<fecha-hora>.json`.

Un JSON con adjuntos puede ocupar bastante más que los archivos originales: la codificación base64 añade aproximadamente un 33 % y los archivos ya comprimidos (PDF, imágenes, ZIP) pueden no reducirse. Es normal.

> **Cada exportación genera un archivo nuevo.** Guarda la copia que vayas a entregar y no la edites a mano: cualquier cambio fuera de RTP hará que la verificación de integridad falle.

---

## 7. Continuar un registro existente

Si tienes que seguir trabajando en otro momento o en otro equipo:

1. Pulsa **Cargar JSON** (en la pantalla principal) o **Cargar JSON existente** (en la pantalla de configuración).
2. Selecciona el archivo `.json` exportado previamente.
3. RTP valida el esquema, la cadena de integridad, el hash global y el contenido de los adjuntos, y muestra un resumen: estudiante, trabajo, número de iteraciones, modelos, adjuntos recuperables y fecha de exportación.
4. Confirma la carga.

Ten en cuenta:

- **La carga reemplaza el registro que tengas abierto**; no fusiona dos trazas. Si necesitas conservar el actual, cancélala y expórtalo antes.
- Se conservan las fechas de registro originales, la declaración y el historial de auditoría.
- Las iteraciones antiguas mantienen sus hashes; las nuevas se añaden a continuación.
- Los registros de la versión 1.0.0 se cargan sin problema, pero sus adjuntos solo conservan la huella y aparecen como **Solo huella**.
- Si la integridad o el contenido de los adjuntos no se pueden verificar, RTP lo avisa y solo permite continuar con una confirmación explícita. Ese incidente queda registrado en la auditoría con `chain_valid`, `record_hash_valid` y `attachments_valid` a `false`.

---

## 8. Empezar un registro nuevo

El botón **Nuevo registro** borra el registro guardado en este navegador y vuelve a la pantalla de configuración.

Antes de usarlo, **exporta el JSON si quieres conservar lo que hay**. La confirmación te lo recuerda.

---

## 9. Cambiar los datos del trabajo

El botón **Datos del trabajo** de la cabecera permite corregir el identificador del estudiante, el nombre, el identificador y título del trabajo, o el curso.

- La declaración debe seguir aceptada para poder guardar.
- Si cambias algún dato, queda anotado en el historial de auditoría.
- Si abres esta pantalla y no quieres cambiar nada, pulsa **Cancelar**.

---

## 10. Apariencia

El selector de la cabecera permite elegir **Claro**, **Oscuro** o **Sistema**. La preferencia se guarda en el navegador y se aplica la próxima vez que abras la herramienta.

El botón **Ayuda** muestra un recordatorio breve del flujo de trabajo.

---

## 11. Privacidad y almacenamiento

- RTP **no tiene backend, no hace llamadas de red y no recoge telemetría**.
- Todo el estado vive en el `localStorage` de tu navegador.
- Los adjuntos no se suben a ningún servidor: se comprimen y se incrustan en el JSON en local. **No se cifran**, así que cualquiera con el archivo puede extraerlos.
- El borrador automático del formulario **no guarda el prompt ni los adjuntos**; solo el modelo, el proveedor y el tipo de acceso.
- El borrador del registro intenta conservar el contenido de los adjuntos. Si no cabe en el espacio disponible del navegador, guarda solo los metadatos, avisa y marca esos adjuntos como **Solo huella**. El registro en memoria y el JSON exportado mantienen el contenido completo mientras la pestaña siga abierta.
- Los prompts pueden contener datos personales o confidenciales. RTP no los envía a ningún sitio, pero revisa el JSON antes de compartirlo y evita usar equipos compartidos.
- En un equipo compartido, cualquiera con acceso al navegador puede ver el registro guardado.

Claves que usa el navegador: `rtp:v1:draft` (registro), `rtp:v1:ui` (estado de la interfaz), `rtp:v1:form-draft` (último modelo y acceso) y `rtp:v1:theme` (tema).

---

## 12. Preguntas frecuentes

**¿Se guarda automáticamente si cierro la pestaña?**
Sí, mientras uses el mismo navegador y no borres sus datos. Aun así, el entregable es el JSON: exporta con frecuencia.

**¿Puedo trabajar desde otro ordenador?**
Sí, exportando el JSON y cargándolo en el otro equipo.

**¿Puedo tener dos trabajos abiertos a la vez?**
No. Cada navegador mantiene un único registro activo. Exporta uno y carga el otro.

**¿Por qué no me deja exportar?**
Revisa que los datos del trabajo estén completos, que hayas aceptado la declaración, que exista al menos una iteración y que el contenido de los adjuntos supere la verificación. Si el registro tiene problemas de validación, la herramienta los enumera.

**Me dice que la fecha no puede ser futura.**
Corrige la fecha de la interacción. Al editar una iteración, tampoco puede ser posterior al momento en que se registró originalmente.

**¿Puedo recuperar los archivos que adjunté?**
Sí, si aparecen marcados como **Recuperable**. Pulsa **Descargar** junto al adjunto en la línea de tiempo: RTP comprueba el contenido, lo descomprime y lo entrega con su nombre original. Los adjuntos marcados como **Solo huella** no se pueden recuperar.

**¿Los adjuntos van cifrados dentro del JSON?**
No. Se comprimen con gzip para ocupar menos, pero no se cifran. Cualquiera que tenga el JSON puede extraerlos.

**Se ha omitido un adjunto.**
Supera el límite de 10 MB, haría que el registro pasara de 50 MB en total o ya habías alcanzado los 20 adjuntos en esa iteración.

**¿Por qué el JSON ocupa tanto?**
Porque incluye los adjuntos. La codificación base64 añade aproximadamente un 33 % y los archivos ya comprimidos pueden no reducirse al comprimirlos de nuevo.

**Al cargar un JSON me avisa de que la integridad no se verifica.**
El archivo se modificó fuera de RTP, está dañado o el contenido de algún adjunto no supera la verificación. Puedes cargarlo igualmente, pero el incidente quedará registrado en la auditoría. Lo recomendable es localizar la copia original.

**He editado una iteración después de exportar. ¿Qué pasa?**
Nada grave: vuelve a exportar. El nuevo JSON tendrá hashes nuevos y reflejará los cambios. La auditoría conserva el rastro de la edición.

**¿Se suben mis archivos o mis prompts a algún servidor?**
No. Todo se procesa y se guarda en tu navegador.

**¿Funciona sin internet?**
Sí, si abres `index.html` en local. La versión publicada en GitHub Pages necesita conexión para cargarse.

**He limpiado los datos del navegador y he perdido el registro.**
El registro local no se puede recuperar. Solo se puede restaurar desde un JSON exportado previamente.

**¿La cadena de hashes impide que alguien manipule el archivo?**
No. Permite **detectar** modificaciones, pero no impedirlas. No sustituye a una firma digital ni a una revisión docente.

---

## 13. Lista de comprobación antes de entregar

- [ ] Los datos del estudiante y del trabajo son correctos.
- [ ] La declaración está aceptada.
- [ ] Están registradas **todas** las interacciones, con su fecha real.
- [ ] Cada prompt es el texto exacto que se envió.
- [ ] Los adjuntos relevantes están añadidos y aparecen como **Recuperable**.
- [ ] El JSON no incluye documentación confidencial que no quieras compartir (no está cifrado).
- [ ] Has pulsado **Exportar JSON** y la barra indica que no hay cambios sin exportar.
- [ ] El archivo descargado se llama `rtp_…json` y se abre correctamente.
- [ ] Guardas una copia del JSON junto con la memoria del trabajo.

---

## Atajos y detalles útiles

- **Ctrl + Enter** (o **Cmd + Enter** en macOS) guarda la iteración desde el formulario.
- **Esc** cierra los diálogos abiertos.
- La app avisa antes de cerrar la pestaña si hay cambios sin exportar.
- El botón **Ver JSON** es la forma más rápida de comprobar que el registro es válido antes de exportar.
