# Konjo — documento de diseño

Fecha: 2026-11-22. Nombre de trabajo: **Konjo** (根性, "agallas"). El nombre final está pendiente; candidatos: Konjo, Makenai, Tsuzuku, Gaman, Ikuzo.

## Intención

App web pensada para el celular (PWA) para medir rachas de hábitos (gimnasio, tomar agua, etc.) y motivarse entre amigos con retos. Si uno falla, le debe una multa al otro. **La app no mueve dinero**: solo registra quién le debe cuánto a quién; el pago ocurre fuera de la app.

Público: adultos jóvenes que entrenan con amigos.

## Objetivos

- Registrar hábitos diarios o semanales y ver la racha.
- Exigir foto en vivo como prueba en los hábitos que lo requieran (gimnasio).
- Agregar amigos, ver su actividad y crear retos 1 a 1 con multa por falla.
- Llevar un saldo neto de deudas entre amigos.
- Mostrar un resumen con gráficas.
- Funcionar y verse bien en el teléfono; instalable en la pantalla de inicio.

## No objetivos (primera versión)

- Cobros, pagos, retención de fondos o cualquier movimiento de dinero.
- Retos grupales, comodines para congelar rachas, comentarios y reacciones, resumen semanal por correo. Quedan para después.
- App nativa en tiendas.

## Antiobjetivos

- Que se perciba como app de apuestas: no usar las palabras "apuesta", "bet" ni "pozo". Usar "reto", "multa", "deuda".
- Fotos visibles para desconocidos: solo las ven tus amigos aceptados.
- Estética genérica de bienestar en tonos pastel.

## Restricciones

- Web móvil (PWA). En iPhone, las notificaciones push solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o superior). La app debe invitar a instalarla y funcionar igual sin push.
- No existe anti-trampa perfecto en web. La defensa es la foto en vivo, la hora del servidor y el rechazo del rival.
- Datos personales: Ley 21.719 de Chile (vigencia prevista diciembre 2026; verificar). Fotos en almacenamiento privado, sin metadatos GPS, borradas de verdad al eliminar la cuenta.
- Edad mínima: 18 años (aceptación en el registro).
- Moneda: pesos chilenos (CLP) por defecto, montos enteros.

## Enfoques considerados

1. **Next.js + Supabase en Vercel (elegido).** Supabase da login, Postgres, almacenamiento de fotos, reglas de acceso (RLS) y tareas programadas en un solo lugar. Deudas y rachas son datos relacionales y encajan en Postgres. Contra: dependencia de Supabase y RLS exige cuidado.
2. **Next.js + piezas separadas** (Neon, Better Auth, Cloudflare R2, Inngest). Más control, pero cuatro servicios que integrar sin beneficio visible. Descartado.
3. **Firebase.** Push y login maduros, pero su base no relacional complica saldos netos y rachas. Descartado.

El dueño eligió el enfoque 1.

## Diseño visual

Estilo **Calm Utility** de Fuzz (slug `calm-utility`): fondo casi blanco `#FAFAFA`, superficies `#FFFFFF`, líneas finas `#E6E6E6`, texto `#111111`, secundario `#6F6F6F`, un acento índigo `#5A5AC2` (secundario `#2E3A5E`), alerta `#E5484D`. Tipografía Inter, Geist Mono para números. Radio 10px. Tokens: `apply_style(slug: "calm-utility", target: "tailwind")`. Después de construir, correr `get_check_rules` y `deslop` de Fuzz.

Navegación: barra inferior con cinco pestañas: **Hoy · Amigos · Retos · Resumen · Perfil**.

## Funciones

### Cuenta y perfil
- Login con Google o link mágico por correo (sin contraseñas).
- En el registro: nombre, @usuario único, foto opcional, zona horaria (detectada del dispositivo), confirmación de 18+ y aceptación de términos.
- Perfil: foto, nombre, @usuario, racha actual y mejor racha, retos ganados y perdidos.
- Borrar cuenta: elimina datos y fotos. Las deudas pendientes quedan en el historial del otro con el usuario mostrado como "cuenta eliminada".

### Hábitos y rachas
- Hábito: nombre, ícono, frecuencia (diaria o N veces por semana), si requiere foto.
- Check-in: máximo uno por hábito por día local. El día local se calcula en el servidor con la zona horaria del usuario al momento del check-in.
- Racha: se calcula desde los check-ins, nunca con un contador incremental. Diaria: días consecutivos cumplidos. Semanal: semanas consecutivas (lunes a domingo) con la meta cumplida.
- Hoy cuenta como "pendiente", no como falla, hasta que termine el día.

### Foto de prueba
- Captura en vivo con `getUserMedia`; si falla, `<input type="file" accept="image/*" capture="environment">`.
- Se comprime en el cliente antes de subir, se quitan metadatos y vale la hora del servidor.
- Se guarda un hash para detectar fotos repetidas; una foto repetida queda marcada para el rival.

### Amigos
- Buscar por @usuario o compartir un link de invitación.
- Solicitud: aceptar o rechazar; eliminar amigo en cualquier momento.
- Feed: check-ins y fotos de tus amigos, más recientes primero.

### Retos
- Uno lo crea: rival, hábito, frecuencia (diaria o N por semana), duración en semanas, multa por falla.
- El rival acepta o rechaza. Empieza el lunes siguiente a la aceptación (o al día siguiente si es diario).
- Ambos deben cumplir la misma meta. Cada período no cumplido es una falla y genera una deuda por el monto de la multa a favor del otro.
- Si los dos fallan el mismo período, las deudas se anulan entre sí en el saldo neto.
- Rechazo de foto: el rival tiene 24 h desde la subida para rechazarla. Si la rechaza, el check-in no cuenta. Sin respuesta, se aprueba sola. Un período no se cierra mientras tenga fotos dentro de su ventana de 24 h.
- Vista del reto: progreso de ambos en el período actual, historial de fallas, total adeudado.
- Un reto se puede cancelar solo si ambos aceptan.

### Deudas
- Ledger: deudor, acreedor, monto, motivo (reto y período), estado (pendiente o pagada).
- Saldo neto por amigo ("Juan te debe $5.000").
- Solo el acreedor marca una deuda como pagada.

### Resumen
- Calendario de cumplimiento por hábito, gráfico semanal y mensual, racha por hábito.

### Notificaciones
- Push web (VAPID): recordatorio diario, nuevo reto, foto rechazada, nueva deuda, solicitud de amistad.
- Todas también aparecen dentro de la app.

## Tareas programadas (en Supabase)
- Aprobar automáticamente las fotos con más de 24 h sin rechazo.
- Cerrar períodos de reto (diario o semanal) y generar deudas.
- Enviar recordatorios diarios según la zona horaria de cada usuario.

## Seguridad y privacidad
- RLS en todas las tablas: un usuario solo lee sus datos y los de amigos aceptados.
- Fotos en bucket privado con URLs firmadas de corta duración.
- Términos de uso: la app no es parte de las deudas, no garantiza su cobro y no procesa pagos.

## Reglas finas (propuestas por Claude tras la revisión; el dueño puede corregirlas)

- **Retos y hábitos:** al crear un reto, cada participante lo vincula a uno de sus propios hábitos (o se crea uno). Los check-ins son los mismos del hábito; un check-in puede contar para varios retos. La frecuencia y el "requiere foto" del reto se fijan al crearlo y valen igual para ambos.
- **Zona horaria del reto:** se guarda la del creador al crearlo. Esa zona define el inicio y el cierre de cada período para ambos.
- **Cierre de período:** se cierra cuando terminó en la zona del reto y no quedan fotos de ese período dentro de su ventana de 24 h.
- **Deudas cuando ambos fallan:** se guardan las dos filas en el ledger. El saldo neto siempre se calcula, nunca se almacena. "Pagada" se marca por fila.
- **Rechazo de foto:** el rival debe elegir un motivo (no es del hábito, foto repetida, no se ve nada, otro). El dueño de la foto ve el motivo. Cada reto muestra cuántas fotos rechazó cada uno, para que el abuso sea visible. No hay apelación en la v1.
- **Pagos:** el deudor no puede disputar una deuda. El acreedor puede desmarcar "pagada".
- **Eliminar amigo:** cancela los retos activos entre ambos (sin generar deudas por el período en curso) y deja de mostrar fotos. Las deudas y el historial del reto siguen visibles para los dos participantes (el acceso a retos y deudas depende de participar, no de ser amigos).
- **Borrar cuenta:** el perfil queda como registro anónimo ("cuenta eliminada"), se borran fotos y datos personales, se cancelan sus retos activos. El otro puede seguir marcando como pagadas las deudas a su favor.
- **Fotos repetidas:** hash exacto (SHA-256) comparado con todas las fotos del mismo usuario. Si coincide, se marca la foto para el rival. El hash perceptual queda para después.
- **Edad y textos legales:** 18+ autodeclarado. Se redactan términos y política de privacidad base, marcados para revisión de un abogado antes de lanzar.
- **Push:** Edge Function de Supabase con `web-push` (VAPID). `pg_cron` corre cada 15 minutos y envía el recordatorio a quienes estén en su hora elegida (por defecto 20:00 local).

## Decidido por el dueño
- Solo ledger, sin mover dinero.
- Foto de prueba para el gimnasio.
- El rival puede rechazar una foto (24 h, aprobación automática).
- Amigos, perfil, resumen con gráficas, login.
- Estilo Calm Utility.
- Next.js + Supabase en Vercel, PWA.

## Queda a criterio del constructor
- Estructura de carpetas, librería de gráficos, librería de PWA y service worker.
- Esquema exacto de tablas y nombres.
- Textos de la interfaz, siguiendo el tono del estilo.
- Íconos de hábitos.
