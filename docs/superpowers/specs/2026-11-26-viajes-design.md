# Mapa de salidas — diseño

Fecha: 2026-11-26. Estado: cerrado para construir. No reabre las decisiones de producto de abajo.

Se apoya en `docs/superpowers/specs/2026-11-22-konjo-design.md` (privacidad, amigos, metas, fotos de prueba sin GPS) y no reutiliza `docs/superpowers/specs/2026-11-23-grupos-design.md`. Un grupo de gimnasio y un viaje son objetos distintos. Ninguna tabla, RPC, ruta ni chip de Grupos sirve para esto.

Producto: Kizuna. El mes es el centro, no un diario de viaje.

## Qué registra el mapa

El mapa registra dónde estuvo un vínculo: un lugar, las fechas y las personas que confirmaron que estuvieron ahí.

Una salida tiene nombre de lugar, un acompañante opcional y un punto en el mapa. Ejemplo: "Termas Geométricas, con Sofía", noviembre. El mismo lugar se puede visitar muchas veces. Una visita nueva es otra fila. No actualiza ni borra la anterior.

## Decisiones cerradas

- El piso del mes es una salida completada. Se permiten más. El número que se muestra es `N de 1`: con cero, "0 de 1"; al cumplir el piso, "1 de 1"; con salidas de más, "3 de 1". El denominador no crece.
- Estados de la misma salida: Planeado y Fui. Fui deja el pin y hace contar el mes. No hay deshacer.
- Un mes sin Fui queda vacío. No hay multa ni deuda.
- La entrada es Perfil, fila "Mapa", ruta `/mapa`. La barra inferior sigue siendo Hoy, Amigos, Retos, Resumen, Perfil. `/mapa` enciende Perfil.
- Hoy y Metas muestran el mes actual del dueño de la sesión. Si la lectura falla, esa fila es error, nunca un cero inventado. El resto de Hoy y de Metas sigue como hoy.
- El piso mensual lo ve solo quien lo tiene. Un mes vacío, sin un plan compartido aceptado, queda privado.
- Un plan que la otra persona aceptó lo ven los dos, completado o no, también si el mes terminó sin Fui. No ven el contador del otro, ni otros meses, ni salidas a las que no fueron invitados.
- Si rechaza o ignora, la salida sigue siendo solo del dueño. Ignorar deja la invitación pendiente. No aparece en el mapa de quien no aceptó.
- Solo un amigo con amistad `accepted` puede ser invitado. Una salida tiene como máximo un acompañante con invitación pendiente o aceptada.
- El lugar se elige por búsqueda. La app no lee GPS del dispositivo ni EXIF de fotos. Las fotos de prueba de hábitos siguen sin coordenadas, en el bucket `proofs`, por el camino que ya existe.
- Los límites del mes usan `profiles.timezone`. Las fechas de una salida son días de calendario `YYYY-MM-DD` y caen dentro de un solo mes.
- El cliente no lee ni escribe las tablas nuevas. Igual que Grupos: `revoke all` a `public`, `anon` y `authenticated`, RLS activo, sin policies, RPC `security definer` con `search_path = ''` y `auth.uid()`.

## Fuera de alcance

No se diseñan y no quedan pendientes: ubicación en vivo, reservas, vuelos, hoteles, chat, mapa público, multas, reacciones, historias, leer GPS de fotos, una sexta pestaña, viajes públicos buscables, recomendaciones.

Tampoco: reabrir el GPS del cardio de v4, reutilizar `groups` / `group_members` / `group_invites`, ni un segundo sistema de check-in.

## Fases

El orden es fijo. 1 y 2 se pueden usar solas. 3, 4 y los agregados pro vienen después.

### 1. Tu mes

Búsqueda de lugar, fechas dentro del mes actual, nota opcional, fila en Hoy y en Metas, marcar Fui, pin privado en el mapa propio, piso 1. Estados vacío, carga y error.

Sin acompañante en esta fase. El título es el lugar: "Termas Geométricas".

### 2. Con esa persona

Invitar a un amigo aceptado. Aceptar o rechazar. El plan aceptado y su resultado se ven en los dos mapas. El aviso usa `notify()` y la campana que ya existen (`src/lib/notify.ts`, `src/lib/notification-copy.ts`, `/notificaciones`).

### 3. Varias paradas

Un viaje con nombre y más de un lugar. Las paradas son salidas. Pueden caer en el mismo mes o en meses distintos. No es un Grupo.

### 4. Memoria

Estadística quieta: "Con Sofía: 4 lugares". Una foto por salida, solo para quien confirmó, EXIF eliminado, bucket privado. Si hay un viaje en curso, Hoy puede mostrar un chip en esas fechas. El check-in de hábitos sigue siendo `create_checkin` / `create_checkin_on` / `POST /api/checkins/photo`.

### Después de las fases 1 y 2

Los hace el agente de expansión, dentro de este producto, sin adelantarlos en la UI de las fases 1 y 2:

- Lista de meses pasados, solo del dueño, con su piso.
- Repetir una salida al mes siguiente como borrador Planeado, sin Fui y sin copiar la invitación.
- Aviso in-app el día 15 si el mes sigue en 0, solo al dueño. No es un push de pantalla de bloqueo.
- Conteo por lugar visible para quien ya puede ver esos pines: "Pucón · 3 veces".

## Conceptos

- **Salida** (`outings`): del dueño (`owner_id`). Lugar, clave estable del lugar, latitud, longitud, mes (`month_start`, día 1), `starts_on`, `ends_on`, nota, `planned` o `went`, `went_on` si fue.
- **Pin**: solo una salida `went`. Planeado no tiene pin.
- **Piso**: cantidad de salidas `went` cuyo `month_start` es el mes actual del usuario, en su zona. En la fase 2 también cuentan las que aceptó. El número no se guarda: lo calcula `monthFloor` en `src/domain/outings.ts`.
- **Invitación** (fase 2, `outing_invites`): `pending`, `accepted` o `declined`. Una abierta (`pending` o `accepted`) por salida.
- **Viaje** (fase 3, `trips`): nombre del dueño. Cada parada es una salida con `trip_id`. Sin miembros, sin multa, sin semana, sin hábito enlazado.
- **Foto de salida** (fase 4): una por salida, bucket `outing-photos`. No es una foto de prueba.

Quién marca Fui: en la fase 1, el dueño. En la fase 2, el dueño o el acompañante que ya aceptó. El primero deja `went` y `went_on` (el día local de quien marcó). El segundo intento no cambia `went_on`. Ese único resultado es el que ven los dos y el que suma, en ese mes, al piso de cada uno. Rechazar o ignorar no suma.

Se puede marcar Fui desde `starts_on` inclusive hasta el último día de `month_start`, comparado con el día local de quien marca. Antes: error. Con el mes ya cerrado: error, y el mes queda vacío. Aceptar un plan después de cerrado el mes sigue permitido: los dos ven el plan, sin pin y sin piso.

## Privacidad

| Quién | Qué ve |
|---|---|
| Dueño | Sus salidas, su piso, sus pines `went` de cualquier mes. En la fase 2, también el plan que le aceptaron y el resultado. |
| Amigo que aceptó | Ese plan y su resultado (pin solo si hay Fui). No ve el piso de nadie, ni otras salidas, ni otros meses del dueño. |
| Amigo que rechazó o no respondió | Nada de esa salida en el mapa. El aviso in-app de la invitación sí existe, para poder responder. |
| Cualquier otro, `anon`, perfil público, feed, push de hábitos | Nada. `public_profile()`, `public_profiles` y el feed no cambian. |

No hay RPC que reciba el id de otra persona para mirar su mes. `my_month` y `my_map` usan solo `auth.uid()`.

Un mes vacío sin plan aceptado no se lista a nadie más. La lista de meses pasados, cuando exista, es solo del dueño.

## Mes y zona horaria

El mes actual es el mes civil de `localDate(now, profiles.timezone)` (`src/domain/dates.ts`). El día 1 a las 00:30 en `America/Santiago` ya es el mes nuevo, aunque UTC siga en el mes anterior. La misma regla que `goals.starts_on` en `supabase/tests/goals_profile.test.sql`.

En la fase 1 las fechas de alta tienen que caer en ese mes actual. No se crean salidas en otro mes hasta "repetir" (pro) o hasta un viaje que cruza meses (fase 3, y cada parada sigue perteneciendo a su propio mes).

`starts_on <= ends_on`. Las dos fechas pertenecen a `month_start`. El servidor vuelve a calcular `month_start`; no confía en un mes mandado por el cliente.

## Mapa y búsqueda

No hay librería de mapas en `package.json` (no Leaflet, no MapLibre, no Mapbox).

Elección: **Leaflet** (`leaflet`, tipos `@types/leaflet`) más teselas raster de CARTO Positron, sin cuenta y sin variable de entorno:

`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`

atribución visible "© OpenStreetMap © CARTO". Subdominios `abcd`. El estilo claro acompaña Calm Utility. No se usa `tile.openstreetmap.org`: la política de uso de ese servidor no alcanza para una app.

El marcador es un `divIcon` con clase (fondo `bg-accent`, 12 px). No el ícono PNG por defecto de Leaflet: Webpack no resuelve esas imágenes y el mapa queda sin pines.

Leaflet solo entra en un client component cargado con `next/dynamic` y `ssr: false`. Un import en un Server Component revienta por `window`.

Búsqueda, sin token: el servidor llama a Nominatim con `countrycodes=cl`, `format=jsonv2`, `limit=5`, y un `User-Agent` que identifica a Kizuna. Así aparecen Pucón y Termas Geométricas. Si Nominatim responde 429 o 5xx, o la red falla, el mismo módulo prueba Photon (`photon.komoot.io`) centrado en Chile y se queda con resultados `countrycode=CL`. Si los dos fallan, la UI muestra error. Una lista vacía es "no encontramos ese lugar", no un error. No se reintenta Nominatim sin filtro de país.

No hay variable nueva. No se toca `.env`. No se inventa un secreto.

La clave del lugar es `nominatim:{node|way|relation}:{id}` cuando el resultado la trae, y si no `coord:{lat a 5 decimales}:{lng a 5 decimales}`. El RPC solo acepta ese formato. Postgres no llama a Nominatim.

## Datos

Migración siguiente a `supabase/migrations/20261130120000_yesterday_and_practice.sql`:

| Fase | Archivo |
|---|---|
| 1 | `supabase/migrations/20261130130000_outings.sql` |
| 2 | `supabase/migrations/20261130140000_outing_invites.sql` |
| 3 | `supabase/migrations/20261201120000_trips.sql` |
| 4 | `supabase/migrations/20261201130000_outing_photos.sql` |
| Pro, aviso del día 15 | `supabase/migrations/20261201140000_outing_month_nudge.sql` |
| Pro, meses y repetir | `supabase/migrations/20261201150000_outing_history.sql` |

### Fase 1 — `outings`

Columnas: `id uuid`, `owner_id` → `profiles`, `place_name` (1–80, ya recortado), `place_detail` (null o 1–120), `place_key` (formato de arriba), `lat` (−90…90), `lng` (−180…180), `month_start date`, `starts_on`, `ends_on`, `note` (null o 1–280), `status` (`planned` | `went`), `went_on date` null, `created_at`. Checks: fechas dentro del mes; `went` si y solo si hay `went_on`. Sin unicidad por lugar. Índice `(owner_id, month_start)`.

Trigger `outings_forbid_deleted_actor` con `public.forbid_deleted_actor()` (migración `0014`). Una cuenta borrada conserva el JWT un rato; el trigger la frena. El rol de servicio no tiene `auth.uid()` y sigue pudiendo borrar al cerrar la cuenta.

RPC, solo `authenticated`, después de `revoke all` desde `public`:

- `create_outing(p_place_name, p_place_detail, p_place_key, p_lat, p_lng, p_starts_on, p_ends_on, p_note) returns uuid` — inserta `planned` en el mes actual de la zona del perfil.
- `update_outing(p_id, …mismos campos de lugar, fechas y nota) returns void` — dueño, sigue `planned`, el mes de la fila sigue siendo el mes actual.
- `mark_outing_went(p_id) returns void` — dueño; idempotente si ya es `went`.
- `cancel_outing(p_id) returns void` — borra solo si el dueño y sigue `planned`. Un Fui no se borra.
- `my_month() returns jsonb` — `{ month_start, completed, outings: [...] }` del mes actual. `completed` cuenta `went`. No incluye el texto "0 de 1".
- `my_map() returns jsonb` — `{ pins: [...], plans: [] }`. `pins` son los `went` del dueño, de todos los meses. `plans` queda vacío hasta la fase 2 (los planeados del mes actual vienen en `my_month`).

Errores Postgres, texto exacto del `raise exception`: `not_authenticated` (`errcode` 28000), `invalid_place`, `invalid_note`, `invalid_dates`, `too_early`, `month_closed`, `not_found`, `outing_closed`.

### Fase 2 — `outing_invites`

`id`, `outing_id` → `outings` on delete cascade, `invitee_id` → `profiles`, `status` (`pending` | `accepted` | `declined`), `responded_at`, `created_at`. Check: pendiente no tiene `responded_at`; los otros sí. Único `(outing_id, invitee_id)`. Índice único parcial de una fila `pending` o `accepted` por salida. Índice `(invitee_id, status)`.

La fase 2 reemplaza `mark_outing_went`, `my_month` y `my_map` con `create or replace`. `cancel_outing` se borra y se vuelve a crear porque el retorno pasa de `void` a `jsonb`.

- `invite_outing_companion(p_outing_id, p_friend_id) returns uuid` — dueño, salida `planned`, mes actual, amistad `accepted` en cualquier dirección. La función lee `friendships` ella misma. No uno mismo. Si ya hay pendiente o aceptada: `already_invited`. Si esa persona ya rechazó: `invite_closed`.
- `respond_outing_invite(p_invite_id, p_accept boolean) returns jsonb` — el invitado, solo desde `pending`. Devuelve `{ owner_id, place_name }` para el aviso. Aceptar después de cerrado el mes está permitido.
- `my_outing_invite(p_outing_id uuid) returns jsonb` — null si el llamador no tiene invitación. Si está `pending` o `accepted`, `{ invite_id, status, place_name, place_detail, lat, lng, starts_on, ends_on, owner_name }`. Nada del piso ni de otras salidas.
- `cancel_outing(uuid)` pasa a `returns jsonb` `{ invitee_id }`. Postgres no cambia el tipo de retorno con `create or replace`: la migración de la fase 2 hace `drop function` de la versión `void` de la fase 1 y crea esta. `invitee_id` es el de la invitación `pending` o `accepted`, o null.

`my_month` del llamador lista sus salidas del mes y las que aceptó en ese mes. `completed` cuenta las `went` de ese conjunto. Cada fila puede traer `companion_name` (nombre de pila) e `invite_status`. El título "con Sofía" solo si `accepted`. Si está `pending`, el dueño ve la pista "Invitación pendiente" y el invitado no recibe la fila.

`my_map.pins` suma los `went` propios y los `went` aceptados. `my_map.plans` son los planeados propios o aceptados de meses anteriores al actual, para que un plan aceptado que cerró sin Fui siga visible. El mes actual sigue saliendo de `my_month`.

`cancel_outing` sigue siendo solo del dueño y solo en `planned`. Al borrar, caen las invitaciones por el cascade.

### Fase 3 — `trips`

`id`, `owner_id`, `name` (1–60), `created_at`. `outings.trip_id uuid null` → `trips`. Una salida, un viaje. Borrar el viaje deja las salidas con `trip_id` null (`on delete set null`), no las borra.

- `create_trip(p_name text, p_outing_ids uuid[]) returns uuid` — al menos dos salidas, todas del dueño, sin otro viaje, meses libres (el mismo o varios).
- `add_trip_stop(p_trip_id, …campos de create_outing) returns uuid` — parada nueva del dueño. El mes de la parada es el mes de sus fechas, que puede no ser el actual si el viaje ya tiene una parada y las fechas caen en un mes que el viaje ya toca o en el mes actual. No abre meses arbitrarios: solo el mes actual o un mes que otra parada de ese viaje ya usa.
- `my_trips() returns jsonb` — del dueño: id, nombre, paradas. Quien aceptó una parada ve el nombre del viaje solo en esa parada, no las otras.

Sin FK a `groups`.

### Fase 4 — foto y memoria

`outings.photo_path text null`. Único donde no es null. Bucket privado `outing-photos`, JPEG, tope 5 MB, igual que `proofs`. Sin policies para `authenticated`: el cliente no sube directo. Ruta `POST /api/outings/[id]/photo`, sesión del usuario, rol de servicio para guardar, `stripJpegMetadata` de `src/lib/checkins.ts` (APP1/EXIF ya se descarta; el test de `tests/unit/checkins.test.ts` sigue siendo la prueba del strip). Path `{user_id}/{outing_id}.jpg`. Una foto: la segunda reemplaza el objeto y la ruta, no crea otra fila.

`outing_photo_path(p_id) returns text` — dueño o acompañante `accepted`, si hay foto. La página firma 300 s con el rol de servicio, el mismo plazo que las pruebas. Nadie más recibe la ruta.

La estadística "Con Sofía: N lugares" cuenta `place_key` distintos con `went` y invitación `accepted` de esa persona. La calcula el dominio sobre las filas que `my_map` ya devolvió. No es un ranking ni se muestra con 0.

Chip de Hoy: si hoy cae dentro de `[starts_on, ends_on]` de alguna parada de un viaje del usuario, se muestra un chip con el nombre del viaje que enlaza a `/mapa/viajes/[id]`. No llama a un RPC nuevo para marcar un hábito.

### Pro

- `my_month_index() returns jsonb` — lista `{ month_start, completed }[]` solo de los meses en los que el dueño tiene alguna salida propia. Meses sin fila no se inventan como deuda. El piso de cada uno lo pinta `monthFloor`. Ningún amigo llama esto.
- `repeat_outing(p_id) returns uuid` — lee una salida propia y crea otra `planned` en el mes siguiente, mismas coordenadas y clave, fechas corridas un mes (si el día no existe, el último día de ese mes). La nota se copia. No se copian la invitación, `went_on` ni la foto. La fila vieja no cambia.
- Aviso del día 15: no usa `notification_targets` (eso exige suscripción push). Un pase del cron de recordatorios, a las 10:00 hora local del día 15, ventana de 15 minutos como `dueLocalSlot`. Si `completed` del mes es 0, inserta `notifications` con tipo `outing_month_nudge` y `pushed_at` ya puesto, para que no salga en la pantalla de bloqueo. `notification_log` gana una vez por usuario y por ese día. Hace falta ampliar el `check` de `kind`. Sin interruptor nuevo en Ajustes.
- El conteo por lugar agrupa los pines que esa pantalla ya mostró. No revela visitas privadas del otro.

## Cómo se ve

Calm Utility (`DESIGN.md`). Tokens, no hex suelto. Phosphor Light, 20 px. `MapTrifold` para Mapa. Sin emoji. Copy en español latinoamericano, de tú. Sin voseo: el test `tests/unit/copy.test.ts` ya lo vigila.

Tipografía: Inter, números en Geist Mono. El "0 de 1" es mono. Oración en sentence case. "Noviembre", no un rótulo en mayúsculas sueltas.

Estados de `/mapa`:

| Estado | Qué se ve |
|---|---|
| Carga | `src/app/(app)/mapa/loading.tsx` con los skeletons que ya usa Perfil (`SkeletonPage`, `SkeletonTitle`). |
| Error de lectura | `LoadFailed` a `/mapa`. No un mapa vacío ni "0 de 1". |
| Vacío | Sin pines y sin salidas del mes: `EmptyState` "Todavía no marcas un lugar" / "Busca un lugar y elige los días. Con una salida el mes queda cumplido." Acción "Agregar salida". |
| Listo | Título "Mapa", mes ("Noviembre") y el piso, el mapa con pines, la lista del mes. Si el mes no tiene salidas pero hay pines viejos, no es el vacío: el mapa muestra los pines y la lista del mes dice "Este mes todavía no tiene una salida." |
| Error de teselas | El mapa dice "No pudimos cargar el mapa. Inténtalo de nuevo." La lista sigue. No se cambia la URL por una con token. |
| Búsqueda vacía | "No encontramos ese lugar en Chile. Prueba con el nombre y la comuna." |
| Búsqueda caída | "No pudimos buscar lugares. Inténtalo de nuevo." |
| Guardado | Errores de RPC en tinta, con el texto de la tabla de copy. |

Copy de interfaz:

| Pieza | Texto |
|---|---|
| Perfil | "Mapa" / "Un lugar en el mes" |
| Hoy y Metas | "Este mes" y el valor "0 de 1" |
| Alta | "Agregar salida", "Busca un lugar", "Desde", "Hasta", "Nota", "Guardar" |
| Estados | "Planeado", "Fui" |
| Aún no se puede marcar | "Puedes marcar Fui desde el {día}." |
| Mes cerrado | "Ese mes ya cerró. Quedó vacío." |
| Cancelar un planeado | "Quitar" |
| Fase 2 | "Invitar", "Aceptar", "Rechazar", "Invitación pendiente" |
| Sin amigos | "Todavía no tienes amigos para invitar." |
| Fase 2 avisos | ver abajo |
| Fase 4 | "Con Sofía: 4 lugares", "1 lugar" si es uno |
| Pro | "Pucón · 3 veces", "1 vez" si es una; "Este mes todavía no tiene una salida." |

Aviso de invitación, mismo tono que un reto:

- `outing_invited`: título "{nombre} te invita a una salida", cuerpo el lugar, url `/mapa?salida={id}`.
- `outing_accepted`: "{nombre} aceptó la salida".
- `outing_declined`: "{nombre} no pudo esta salida".
- `outing_cancelled`: "{nombre} quitó la salida" — solo si había invitación pendiente o aceptada.

El aviso se manda desde la server action, después de que el RPC tuvo éxito, con `notify()`. Si el aviso falla, la invitación queda. `notify` no deshace la acción.

Errores de RPC hacia la UI:

| Código | Texto |
|---|---|
| `invalid_place` | "No encontramos ese lugar." |
| `invalid_dates` | "Esas fechas no caben en este mes." |
| `invalid_note` | "La nota puede tener hasta 280 caracteres." |
| `too_early` | "Puedes marcar Fui desde el día en que empieza." |
| `month_closed` | "Ese mes ya cerró. Quedó vacío." |
| `outing_closed` | "Esta salida ya quedó marcada." |
| `not_friend` | "Solo puedes invitar a un amigo." |
| `already_invited` | "Ya invitaste a alguien a esta salida." |
| `invite_closed` | "Esta invitación ya no está pendiente." |
| otro | "No pudimos guardar la salida. Inténtalo de nuevo." |

La hoja de alta sigue el patrón de `src/components/NewGoalSheet.tsx`. No hay tarjeta dentro de tarjeta. El mapa es una superficie; la lista es otra.

Hoy: la fila va debajo del encabezado del día y no entra en el anillo de hábitos. Metas: primera sección, antes de las semanales, enlace a `/mapa`. Perfil: una `ListCard` propia, no dentro de "Perfil público".

`isTabActive('/perfil', '/mapa')` es verdadero. `isTabActive` de Hoy, Amigos, Retos y Resumen es falso en `/mapa`.

## Borrado de cuenta

El perfil no se borra en duro, así que no hay cascade desde `profiles`. En `purgeSocial` de `src/lib/delete-account-deps.ts` el rol de servicio borra las invitaciones donde la persona es invitada y las salidas donde es dueña (el cascade se lleva el resto de invitaciones). Fase 3: también sus `trips`. Fase 4: los objetos de `outing-photos` bajo `{user_id}/`, igual que `proofs`. Lo que la otra persona veía de un plan compartido desaparece con la fila.

## Qué no cambia

Check-ins, fotos de prueba, retos, deudas, metas, grupos, feed, perfil público, la barra de cinco pestañas, el cron de rachas. La fase 4 solo lee las fechas del viaje para pintar un chip; el hábito se marca como hoy.

## Riesgo que puede frenar a quien construye

Nominatim y las teselas de CARTO no piden token y pueden limitar o cambiar la URL. La búsqueda tiene que fallar en voz alta (estado de error) y la lista de salidas tiene que servir aunque el mapa no pinte. No se agrega una clave en `.env` para "destrabar". Si hace falta otro proveedor, es otra decisión de producto.

Leaflet en el servidor, o el marcador PNG por defecto, dejan la pantalla en blanco. Va por `dynamic` + `divIcon`.

La privacidad de la fase 2 no queda probada con Vitest. Hace falta Postgres local (`supabase test db`). Sin eso, no se da por cerrada la fase 2.
