# Kizuna Tracker — documento de diseño

Fecha: 2026-11-22 (v1). Revisión v2: 2026-11-23, tras la ronda de diseño en Figma. Nombre: **Kizuna Tracker** (corto: **Kizuna**, 絆, "lazo"). El nombre de trabajo anterior era "Konjo"; el archivo conserva su ruta.

## Intención

App web pensada para el celular (PWA) para medir rachas de hábitos (gimnasio, tomar agua, estudiar, comer bien, etc.) y motivarse entre amigos con retos. Si uno falla, le debe una multa al otro. **La app no mueve dinero**: solo registra quién le debe cuánto a quién; el pago ocurre fuera de la app.

Público: adultos jóvenes que entrenan y estudian con amigos.

## Objetivos

- Registrar hábitos diarios o semanales (de una lista de hábitos predefinidos o propios) y ver la racha.
- Hábitos con lista de pasos del día (ej. Comer bien: Desayuno, Almuerzo, Once, Cena).
- Exigir foto en vivo como prueba en los hábitos que lo requieran (gimnasio) y celebrar el entrenamiento cumplido.
- Agregar amigos, ver su actividad y crear retos 1 a 1 con multa por falla.
- Llevar un saldo neto de deudas entre amigos.
- Metas por hábito (semanales o de total acumulado).
- Perfil público opcional con rachas de los hábitos marcados como públicos.
- Mostrar un resumen con gráficas.
- Funcionar y verse bien en el teléfono; instalable en la pantalla de inicio.

## No objetivos (primera versión)

- Cobros, pagos, retención de fondos o cualquier movimiento de dinero.
- Retos grupales, comodines para congelar rachas, comentarios y reacciones, resumen semanal por correo.
- Inicio de sesión con Google, link mágico, confirmación de correo y recuperación de contraseña (ver Brechas conocidas).
- App nativa en tiendas.

## Antiobjetivos

- Que se perciba como app de apuestas: no usar las palabras "apuesta", "bet" ni "pozo". Usar "reto", "multa", "deuda".
- Fotos visibles para desconocidos: solo las ven tus amigos aceptados. **Las fotos nunca son públicas**, ni siquiera en un hábito público.
- Estética genérica de bienestar en tonos pastel, o una interfaz que se vea hecha por IA (degradados de color, héroes vacíos, chips de relleno, cifras redondas de ejemplo).

## Restricciones

- Web móvil (PWA). En iPhone, las notificaciones push solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o superior). La app debe invitar a instalarla y funcionar igual sin push.
- No existe anti-trampa perfecto en web. La defensa es la foto en vivo, la hora del servidor y el rechazo del rival.
- Datos personales: Ley 21.719 de Chile (vigencia prevista diciembre 2026; verificar). Fotos en almacenamiento privado, sin metadatos GPS, borradas de verdad al eliminar la cuenta. El perfil público requiere revisión legal antes de lanzar.
- Edad mínima: 18 años, calculada desde la fecha de nacimiento declarada en el registro.
- Moneda: pesos chilenos (CLP) por defecto, montos enteros.
- Textos de la interfaz en español latinoamericano neutro, tratando de **tú** (nunca voseo): "debes", "tienes", "inténtalo de nuevo".

## Enfoques considerados

1. **Next.js + Supabase en Vercel (elegido).** Supabase da login, Postgres, almacenamiento de fotos, reglas de acceso (RLS) y tareas programadas en un solo lugar. Deudas y rachas son datos relacionales y encajan en Postgres. Contra: dependencia de Supabase y RLS exige cuidado.
2. **Next.js + piezas separadas** (Neon, Better Auth, Cloudflare R2, Inngest). Más control, pero cuatro servicios que integrar sin beneficio visible. Descartado.
3. **Firebase.** Push y login maduros, pero su base no relacional complica saldos netos y rachas. Descartado.

El dueño eligió el enfoque 1.

## Diseño visual

Fuente de verdad: archivo Figma `ASUwZ8Ervs6LkHtR7IA0sw`, página **Kizuna Tracker** `789:2` (informe con ids de nodos en `.superpowers/sdd/2026-11-22-konjo/figma-design-report.md`). Cada pantalla de la app implementa un frame de esa página.

Estilo **Calm Utility** de Fuzz, tal como está en la página de Figma:
- Colores: paper `#FAFAFA`, surface `#FFFFFF`, line `#E6E6E6`, outline-strong `#8D8D8D`, ink `#111111`, muted `#6F6F6F`, field `#F0F0F0`, accent `#5A5AC2` (hover `#4C4CA5`, suave `#EFEFF9`), accent2 `#2E3A5E`, alerta `#E5484D` (suave `#FDECEC`), crema `#F6EBD8` (solo pesas del gato).
- **Shu `#C73E2E` solo dentro del sello 絆 del logo.** En ningún otro lugar.
- Tipografía Inter; Geist Mono para números, etiquetas y **encabezados de sección en mayúsculas** (Geist Mono 13, +10 % de espaciado). Esta excepción la decidió el dueño y prevalece sobre la regla "No all-caps labels" de `DESIGN.md`, solo para esas etiquetas de sección.
- Espaciado 4/8/16/24/32; radios 6/10/15/999. Título grande 44, Display 32, Title 22, Heading 17, Body 15/1.5, Small 13.
- Íconos: un solo set, Phosphor Light.
- Texto de error en tinta con ícono en rojo alerta (el rojo sobre blanco no llega a AA para texto).
- Después de construir, correr `get_check_rules` y `deslop` de Fuzz.

Navegación: barra inferior con cinco pestañas: **Hoy · Amigos · Retos · Resumen · Perfil**. Metas y Deudas se abren desde Hoy, Perfil y Retos.

Marca: logo = gato + wordmark KIZUNA + sello 絆. Íconos de app exportados desde los frames favicon-16 `798:804`, favicon-32 `798:822`, apple-touch-icon-180 `798:840`, icon-192 `798:858`, icon-512 `798:876`, icon-maskable-512 `798:894`.

## Funciones

### Cuenta y perfil
- **Correo y contraseña.** Sin Google, sin link mágico, sin confirmación de correo: al terminar el registro la sesión queda abierta.
- **Bienvenida** (A0) con "Crear cuenta" e "Iniciar sesión".
- **Registro en 5 pasos**, un dato por pantalla, con botón "Continuar" abajo:
  1. Nombre y apellido.
  2. Fecha de nacimiento; si es menor de 18 se bloquea el paso con un mensaje (A2e).
  3. @usuario con disponibilidad en vivo mientras escribe (A3e muestra "en uso").
  4. Correo.
  5. Contraseña (mínimo 8 caracteres), confirmación y aceptación de términos y privacidad.
  Luego **"Listo"** (A6) con el gato animado en pequeño y botón para ir a Hoy. La zona horaria se detecta del dispositivo y se guarda sin preguntar.
- **Iniciar sesión** en una sola pantalla ("Hola de nuevo"): campo "Correo o @usuario" y contraseña. Ante cualquier fallo se muestra **un solo mensaje genérico**, sin distinguir usuario inexistente de contraseña incorrecta. El @usuario se resuelve a correo **en el servidor**; el cliente nunca ve el correo de otra persona. Hay límite de intentos por identificador y por IP.
- Perfil: foto (se cambia desde Perfil, "Cambiar foto"), nombre, @usuario, racha actual y mejor racha, retos ganados y perdidos, resumen de las 2 primeras metas, "Compartir perfil" (link a `/@usuario`).
- Borrar cuenta: elimina datos y fotos. Las deudas pendientes quedan en el historial del otro con el usuario mostrado como "Cuenta eliminada".

### Hábitos y rachas
- **Hábitos predefinidos**: Gimnasio (con foto), Agua, Estudiar (5 por semana), Leer, Caminar, Dormir 8 h, Comer bien (con comidas). Cada uno trae ícono, frecuencia y pasos por defecto, todos editables.
- **Hábito propio ("Otro")**: nombre, ícono de un selector de 24, frecuencia, foto requerida o no, pasos opcionales y visibilidad.
- Hábito: nombre, ícono, frecuencia (diaria o N veces por semana), si requiere foto, **pasos del día opcionales**, **visibilidad**.
- **Pasos del día** (lista de ítems): configurables por hábito (Comer bien trae Desayuno, Almuerzo, Once, Cena). Cada paso puede pedir foto opcional. **El día cuenta como cumplido cuando están marcados todos los pasos activos.** Un hábito con pasos no pide foto a nivel de hábito.
- **Visibilidad** por hábito: **Solo yo**, **Amigos** (por defecto) o **Público**. Solo yo: ni los amigos lo ven. Público: aparece en el perfil público (sin fotos).
- Check-in: máximo uno por hábito por día local. El día local se calcula en el servidor con la zona horaria del usuario al momento del check-in.
- Racha: se calcula desde los check-ins, nunca con un contador incremental. Diaria: días consecutivos cumplidos. Semanal: semanas consecutivas (lunes a domingo) con la meta cumplida.
- Hoy cuenta como "pendiente", no como falla, hasta que termine el día.
- **Detalle de hábito**: racha, calendario, metas del hábito, ajustes y botón **"Retar a un amigo"**, que abre "Nuevo reto" con el hábito fijado.

### Foto de prueba
- Captura en vivo con `getUserMedia`; si falla, `<input type="file" accept="image/*" capture="environment">`.
- Se comprime en el cliente antes de subir, se quitan metadatos y vale la hora del servidor.
- Se guarda un hash para detectar fotos repetidas; una foto repetida queda marcada para el rival.
- Tras un check-in con foto de Gimnasio aparece la hoja **"Entrenamiento cumplido"** con la animación del gato levantando pesas.

### Animación del gato
- SVG por capas (cuerpo y cabeza, brazo izquierdo con pesa, brazo derecho, marcas de movimiento) animado con CSS o Web Animations API. Duración 1,4 s: reposo → levanta derecha → levanta izquierda → reposo, con un leve rebote.
- Recurso del dueño: `public/brand/cat-lift.webp` (1080×1080, transparente, un solo cuadro). Si el dueño agrega una versión animada (`cat-lift.gif` o un WebP animado), se usa esa en lugar del SVG.
- Con `prefers-reduced-motion: reduce` se muestra el gato quieto (`cat-lift.webp`) con un fundido breve (variante 19b).
- Se usa grande en "Entrenamiento cumplido" y pequeña en "Listo".

### Amigos
- Buscar por @usuario o compartir un link de invitación.
- Solicitud: aceptar o rechazar; eliminar amigo en cualquier momento.
- Feed: check-ins y fotos de tus amigos, más recientes primero, solo de hábitos con visibilidad Amigos o Público.

### Perfil público
- Ruta `/@usuario`, visible sin sesión.
- Muestra nombre, @usuario, foto de perfil y, por cada hábito **Público**, su ícono, nombre, racha actual y calendario de cumplimiento. **Nunca fotos de prueba**, nunca hábitos Solo yo o Amigos, nunca datos privados (fecha de nacimiento, zona horaria, correo).
- Botón "Agregar amigo" (sin sesión lleva a iniciar sesión y vuelve). Link para compartir.
- Si el usuario no tiene hábitos públicos, quien no tiene sesión ve "Perfil no disponible".

### Retos
- Uno lo crea: rival, hábito, frecuencia (diaria o N por semana), duración en semanas, multa por falla. Desde el detalle de un hábito, el hábito viene fijado.
- Un hábito **Solo yo** no se puede usar en un reto, y mientras tenga un reto activo no se puede pasar a Solo yo.
- El rival acepta o rechaza. Empieza el lunes siguiente a la aceptación (o al día siguiente si es diario).
- Ambos deben cumplir la misma meta. Cada período no cumplido es una falla y genera una deuda por el monto de la multa a favor del otro.
- Si los dos fallan el mismo período, las deudas se anulan entre sí en el saldo neto.
- Rechazo de foto: el rival tiene 24 h desde la subida para rechazarla. Si la rechaza, el check-in no cuenta. Sin respuesta, se aprueba sola. Un período no se cierra mientras tenga fotos dentro de su ventana de 24 h.
- Vista del reto: progreso de ambos en el período actual, historial de fallas, total adeudado.
- Un reto se puede cancelar solo si ambos aceptan.

### Deudas
- Ledger: deudor, acreedor, monto, motivo (reto y período), estado (pendiente o pagada).
- Saldo neto por amigo ("Juan te debe $5.000", "Le debes $5.000 a Juan").
- Solo el acreedor marca una deuda como pagada.

### Metas
- Por hábito, de dos tipos:
  - **Semanal**: cantidad de días cumplidos por semana de **lunes a domingo** (la misma semana de los retos).
  - **Total**: cantidad acumulada de días cumplidos desde que se crea la meta, con fecha límite opcional.
- Pantalla Metas (desde Hoy "Ver metas" y desde Perfil), estado vacío y hoja "Nueva meta". Cada meta muestra progreso (ej. 37/100) y si está cumplida o vencida.
- Perfil muestra un resumen con las 2 primeras metas.

### Resumen
- Calendario de cumplimiento por hábito, gráfico semanal y mensual, racha por hábito.

### Notificaciones
- Push web (VAPID): recordatorio diario, nuevo reto, foto rechazada, nueva deuda, solicitud de amistad.
- Todas también aparecen dentro de la app.

## Tareas programadas (en Supabase)
- Aprobar automáticamente las fotos con más de 24 h sin rechazo (implícito: una foto sin `rejected_at` pasadas 24 h cuenta).
- Cerrar períodos de reto (diario o semanal) y generar deudas.
- Enviar recordatorios diarios según la zona horaria de cada usuario.

## Seguridad y privacidad
- RLS en todas las tablas: un usuario solo lee sus datos y los de amigos aceptados (de hábitos Amigos o Público).
- Perfil público: no se abre ninguna tabla a usuarios anónimos. Una función de solo lectura devuelve solo datos agregados de hábitos públicos (nombre, ícono, frecuencia, fechas cumplidas, racha). Nunca rutas de fotos ni ids de check-in.
- Login por @usuario: resolución en el servidor con una función que solo puede ejecutar el rol de servicio; mismo mensaje y mismo camino de código para usuario inexistente y contraseña incorrecta; límite de intentos (10 por identificador y 30 por IP cada 15 minutos).
- Los clientes nunca escriben check-ins ni fotos directamente: check-ins sin foto vía RPC con fecha del servidor; con foto vía ruta del servidor con rol de servicio.
- Fotos en bucket privado con URLs firmadas de corta duración.
- Términos de uso: la app no es parte de las deudas, no garantiza su cobro y no procesa pagos.

## Reglas finas

- **Retos y hábitos:** al crear un reto, cada participante lo vincula a uno de sus propios hábitos (o se crea uno). Los check-ins son los mismos del hábito; un check-in puede contar para varios retos. La frecuencia y el "requiere foto" del reto se fijan al crearlo y valen igual para ambos. En un hábito con pasos, el check-in del día se crea al marcar el último paso, y el reto no exige foto.
- **Zona horaria del reto:** se guarda la del creador al crearlo. Esa zona define el inicio y el cierre de cada período para ambos.
- **Cambio de zona horaria:** como máximo una vez cada 7 días, para que no sirva para mover check-ins de día.
- **Cierre de período:** se cierra cuando terminó en la zona del reto y no quedan fotos de ese período dentro de su ventana de 24 h.
- **Deudas cuando ambos fallan:** se guardan las dos filas en el ledger. El saldo neto siempre se calcula, nunca se almacena. "Pagada" se marca por fila.
- **Rechazo de foto:** el rival debe elegir un motivo (no es del hábito, foto repetida, no se ve nada, otro). El dueño de la foto ve el motivo. Cada reto muestra cuántas fotos rechazó cada uno. No hay apelación en la v1.
- **Pagos:** el deudor no puede disputar una deuda. El acreedor puede desmarcar "pagada".
- **Eliminar amigo:** cancela los retos activos entre ambos (sin generar deudas por el período en curso) y deja de mostrar fotos. Las deudas y el historial del reto siguen visibles para los dos participantes.
- **Borrar cuenta:** el perfil queda como registro anónimo ("Cuenta eliminada"), se borran fotos, nombre, apellido, fecha de nacimiento y hábitos, se cancelan sus retos activos y se inhabilita el acceso (el correo queda libre). El otro puede seguir marcando como pagadas las deudas a su favor.
- **Fotos repetidas:** hash exacto (SHA-256) comparado con todas las fotos del mismo usuario. El hash perceptual queda para después.
- **Edad y textos legales:** 18+ calculado desde la fecha de nacimiento declarada (quien nace un 29 de febrero cumple el 1 de marzo en años no bisiestos). Se guarda cuándo aceptó los términos. Términos y política de privacidad base, marcados para revisión de un abogado antes de lanzar.
- **Push:** `pg_cron` corre cada 15 minutos y envía el recordatorio a quienes estén en su hora elegida (por defecto 20:00 local).

## Decidido por el dueño
- Solo ledger, sin mover dinero.
- Foto de prueba para el gimnasio.
- El rival puede rechazar una foto (24 h, aprobación automática).
- Amigos, perfil, resumen con gráficas, login.
- Next.js + Supabase en Vercel, PWA.
- Nombre Kizuna Tracker; estilo Calm Utility exacto de la página de Figma (acento `#5A5AC2`, shu solo en el sello, encabezados mono en mayúsculas).
- Español neutro con tú.
- Correo y contraseña, registro en 5 pasos, login con correo o @usuario.
- Hábitos predefinidos, hábito propio, pasos del día, visibilidad y perfil público sin fotos.
- Metas semanales y totales.
- Animación del gato en "Entrenamiento cumplido" y "Listo".

## Queda a criterio del constructor
- Estructura de carpetas, librería de gráficos, librería de PWA y service worker.
- Esquema exacto de tablas y nombres.
- Textos que no estén en Figma, siguiendo el tono del estilo y la regla de tú.

## Cambios v2 (2026-11-23)

| Área | v1 | v2 |
|---|---|---|
| Nombre | Konjo (provisorio) | Kizuna Tracker / Kizuna |
| Estilo | Calm Utility según tokens de Fuzz | Calm Utility exacto de Figma `789:2`; shu solo en el sello; encabezados de sección mono en mayúsculas |
| Idioma | Español | Español neutro con tú; se corrige el voseo del código existente |
| Login | Google o link mágico | Correo + contraseña; login con correo o @usuario; sin confirmación de correo |
| Registro | Onboarding de una pantalla con casilla 18+ | 5 pasos con fecha de nacimiento (18+ calculado), @usuario con disponibilidad en vivo, términos; pantalla "Listo" |
| Perfil (datos) | `display_name`, `is_adult` | `first_name`, `last_name`, `birth_date`, `terms_accepted_at`; `display_name` derivado |
| Hábitos | Nombre, ícono, frecuencia, foto | + predefinidos, hábito propio con selector de íconos, pasos del día con foto opcional, visibilidad Solo yo/Amigos/Público |
| Pantallas nuevas | — | Bienvenida, registro, Listo, Detalle de hábito, Perfil público, Metas, Nueva meta, Entrenamiento cumplido |
| Perfil público | No existía | `/@usuario`, solo hábitos públicos, sin fotos |
| Metas | No existían | Semanal (lunes a domingo) o total con fecha límite opcional |
| Animación | — | Gato levantando pesas, 1,4 s, variante sin movimiento |
| Íconos de app | Genéricos | Exportados desde Figma (6 tamaños, incluye maskable) |
| Zona horaria | Editable libremente | Máximo un cambio cada 7 días |

### Decisiones de producto tomadas por Claude (con autoridad del dueño: "haz todo y tú decides")

1. **Perfil creado por un trigger** sobre `auth.users` con los datos del registro, en la misma transacción que la cuenta: no quedan cuentas sin perfil. Una sesión sin perfil se cierra.
2. **Frecuencias de los predefinidos:** Gimnasio 4 por semana con foto; Estudiar 5 por semana; Agua, Leer, Caminar, Dormir 8 h y Comer bien diarios. Todos con visibilidad Amigos y editables.
3. **Hábitos con pasos:** la foto se pide por paso, nunca a nivel de hábito; máximo 12 pasos sin nombres repetidos. Un reto sobre un hábito con pasos no exige foto.
4. **Hábitos Solo yo** no se pueden retar, y uno con reto activo no puede pasar a Solo yo.
5. **"Entrenamiento cumplido"** aparece solo con el hábito predefinido Gimnasio.
6. **Contraseña** de mínimo 8 caracteres. Mensaje de login único: "Correo, usuario o contraseña incorrectos." Límite: 10 intentos por identificador y 30 por IP cada 15 minutos.
7. **Metas:** la semanal usa la semana lunes–domingo y su meta máxima es 7; la total cuenta desde el día en que se crea la meta.
8. **Perfil público:** muestra 26 semanas de historial por hábito público; no se indexa en buscadores hasta la revisión legal; sin hábitos públicos, quien no tiene sesión ve "Perfil no disponible". La dirección `/@usuario` se sirve internamente desde `/u/usuario`.
9. **Cambio de zona horaria:** una vez cada 7 días.
10. **Borrar cuenta:** borrado lógico con datos personales eliminados, acceso bloqueado y correo liberado (la cuenta de acceso no se borra porque el historial de deudas la referencia).
11. **Animación del gato:** se prefiere un recurso animado del dueño si existe; si no, el SVG por capas de Figma animado en código; `cat-lift.webp` es el respaldo estático y de movimiento reducido, y el respaldo para los íconos si no se pueden exportar desde Figma.
12. **Migraciones:** las nuevas se numeran seguidas desde `0004` (las `0004`/`0005` que reservaba el plan v1 nunca se crearon).

## Brechas conocidas

- **Recuperación de contraseña:** no existe en la v1 porque no se envían correos. Quien olvide su contraseña no puede entrar. Antes de lanzar hay que elegir un mecanismo (correo transaccional con SMTP propio, o recuperación asistida).
- **Ley 21.719 y perfil público:** publicar nombre, foto de perfil y rachas de hábitos (algunos, como Dormir o Comer bien, rozan datos de salud) necesita revisión legal: base de licitud (consentimiento explícito al marcar Público), aviso en la política de privacidad y retiro inmediato al cambiar la visibilidad.
- **Enumeración de correos en el registro:** sin confirmación de correo, intentar registrar un correo existente revela que existe. Se acepta en la v1; el login sí es genérico.
- **Límites de Supabase Auth por IP:** las llamadas de login salen del servidor, así que el límite por IP de Supabase lo comparten todos. La app aplica su propio límite y el del proyecto alojado debe subirse.
- **Textos legales:** borrador pendiente de revisión de un abogado.
