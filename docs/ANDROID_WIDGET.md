# Widget de Android "Hoy": despliegue y pruebas

Resumen tecnico: un modulo `android/widget` (Java, RemoteViews) habla con tres rutas publicas `/api/widget/{pair,today,checkin}` que se autentican con un token propio (`kzw_...`, guardado solo como sha256). Ver `android/README.md` para el lado Android.

## Orden de despliegue (importa)

1. **Migracion primero**: aplicar `supabase/migrations/20261127090000_android_widget.sql` en el SQL editor de produccion ANTES de desplegar la web. Sin ella `/api/widget/*` responde 502 y Ajustes no puede generar codigos.
2. Verificar en local: `supabase db reset && supabase test db` (incluye `supabase/tests/android_widget.test.sql`).
3. Los tipos (`src/lib/supabase/database.types.ts`) ya estan regenerados en el repo. Si cambias la migracion: `supabase gen types typescript --local`.
4. `git push` de `main` (despliegue web en Vercel).
5. `./scripts/android-release.sh --dry-run 1.0.1` (pide las contrasenas del keystore; el script nunca las guarda).
6. `./scripts/android-release.sh 1.0.1` (commit, tag, push y release en GitHub).

## Rollback

- Quitar `"/api/widget"` de `PUBLIC_PREFIXES` en `src/lib/supabase/public-paths.ts` (las rutas dejan de ser alcanzables sin sesion).
- SQL: eliminar los objetos `widget_*` y restaurar el cuerpo de `create_checkin` de `0018_v4_logs.sql`.
- Publicar un APK 1.0.2 sin el modulo (quitar el paso de parcheo del script).

## Seguridad: notas de operacion

- El codigo de emparejamiento vence a los 5 minutos y es de un solo uso; los intentos fallidos se limitan por IP.
- Un token revocado (Ajustes > Desconectar) responde 401 y el widget vuelve a "conectar".
- Borrar la cuenta borra tokens y codigos explicitamente (el borrado de cuenta es logico, las FK en cascada no se disparan).
- Cerrar sesion en la web NO revoca los widgets.
- El deep link `kizuna://widget/pair` esta exportado, por eso solo prellena el codigo: nada se canjea sin tocar "Conectar".

## Checklist manual en dispositivo (no automatizable)

Preparacion: APK 1.0.1 instalado, cuenta con al menos 6 habitos (varios booleanos, uno con cantidad, uno con pasos o foto).

- [ ] Agregar el widget 4x2 a la pantalla de inicio: muestra "Conectar".
- [ ] Ajustes > "Conectar widget": aparece el codigo `ABCD-EFGH` y "vence en 5 minutos".
- [ ] Deep link: se abre la pantalla de conexion con el codigo prellenado y NO conecta sola; tocar "Conectar" muestra "Conectado como @usuario".
- [ ] Pegar a mano: abrir "Conectar" desde el widget, escribir el codigo (minusculas, con y sin guion) y conectar.
- [ ] Codigo vencido (esperar 5 min), codigo ya usado y codigo mal escrito: cada uno muestra un error en espanol y no crea token.
- [ ] Tope: con 3 dispositivos conectados, el cuarto da "Ya tienes 3 dispositivos..." y el boton de Ajustes esta deshabilitado.
- [ ] Rotacion: "Desconectar" uno en Ajustes, emparejar el cuarto: funciona (siguen siendo 3).
- [ ] Lista: cabecera `n/m`, filas con casilla solo para habitos booleanos; los demas no tienen casilla y al tocarlos abren Hoy.
- [ ] Desbordamiento: con mas de 4 pendientes se ven 4 filas y "+N mas".
- [ ] Marcar un habito: se tilda al instante, la cabecera suma 1, y en la web Hoy aparece hecho.
- [ ] Fallo al marcar (modo avion al tocar): la fila vuelve a desmarcada y aparece el error.
- [ ] Todo listo: marcar el ultimo pendiente muestra "Todo listo".
- [ ] Sin conexion: con cache muestra la lista con "Sin conexion"; sin cache muestra el mensaje. Al volver la red y tocar la cabecera, se actualiza.
- [ ] Tocar la cabecera abre Hoy en la app y refresca el widget.
- [ ] Medianoche: dejar el telefono pasada la medianoche; el widget no muestra la lista de ayer como actual y se actualiza solo (puede tardar unos minutos: la alarma es inexacta).
- [ ] Modo oscuro: cambiar el tema del sistema; el widget cambia de paleta y se lee bien.
- [ ] Redimensionar a 2x2: se ven cabecera y 2 filas sin cortes.
- [ ] Revocar desde Ajustes: en el siguiente refresco el widget vuelve a "Conectar".
- [ ] Actualizacion: instalar 1.0.1 sobre 1.0.0 con el widget ya emparejado: sigue funcionando sin volver a emparejar.
- [ ] Cerrar sesion en la app/web: el widget sigue cargando hoy.
- [ ] Re-emparejar el mismo telefono: no consume un cupo extra y el token anterior deja de funcionar.

## Limitaciones conocidas

- El mensaje de error de una marca fallida se queda hasta el siguiente refresco (cabecera, 30 minutos o medianoche).
- No hay deshacer, cola offline ni marcado de habitos con cantidad, pasos o foto: esos abren la app.
