# App nativa de Kizuna (Expo / React Native)

Resumen: `mobile/` es una app Expo (expo-router, TanStack Query) con la MISMA identidad que el APK TWA: paquete `com.kizunatracker.app`, keystore de release y `versionCode` mayor. Por eso se instala como actualizacion encima del TWA y el widget sigue vinculado.

## Arquitectura

- **Login nativo**: `POST /api/m/auth/login` devuelve la sesion de Supabase; se guarda con `LargeSecureStore` (clave en Keystore + MMKV). Las rutas `/api/m/*` aceptan `Authorization: Bearer` (`requireUser`).
- **Hoy y registros**: pantallas nativas (boolean, items, cantidad, tiempo, lectura, entreno, cardio, watch, foto, pomodoro) sobre RPCs compartidas con la web (`mobile/shared-whitelist.json` limita lo que se importa de `src/`).
- **Offline**: TanStack con `offlineFirst`, cache persistida en MMKV 24 h, los taps pausados se reenvian una vez (regla del dia viejo: >36 h se descartan con aviso).
- **Push**: tabla `device_push_tokens` + `expo_push_tickets` (`supabase/migrations/20261128090000_device_push_tokens.sql`), envio por Expo junto con VAPID, recibos en el cron de recordatorios.
- **WebView**: Amigos, Retos, Resumen, Perfil y el resto van en WebView con handoff de sesion (`/api/m/web-session` -> `/auth/native-handoff`), allowlist estricta y "Sesion web expirada" tras un reintento.
- **Widget**: modulo Android del repo inyectado por el plugin `mobile/plugins/with-kizuna-widget`. Abre `kizuna://app`; el pairing es `kizuna://widget/pair`.
- **runtimeVersion**: politica `fingerprint` (`mobile/app.config.ts`). Cambia cuando cambia el codigo nativo.

## Canales EAS (`mobile/eas.json`)

| Perfil | Canal | Uso |
|---|---|---|
| `development` | development | dev client |
| `preview` | preview | beta interna (APK de prueba) |
| `production` | production | APK firmado con el keystore de release (`credentialsSource: local`, `mobile/credentials.json`, ignorado por git) |

`appVersionSource: local`: `version` y `versionCode` viven en `mobile/app.config.ts` y los sube `native-release.sh`.

## Publicar un APK nuevo

Antes (una vez): pegar `supabase/migrations/20261128090000_device_push_tokens.sql` en produccion y desplegar la web (`git push` de `main`) ANTES de publicar la app.

```bash
./scripts/native-release.sh --dry-run 1.1.2   # construye en EAS y verifica; no hace commit, tag, push ni release
./scripts/native-release.sh 1.1.2             # commit del bump, build, verificacion, tag android-v1.1.2, push y release (Latest)
```

El script: valida semver (solo parches: la version actual o la siguiente, minimo 1.1.1), exige arbol limpio y `gh auth`, sube `version` y `versionCode` + 1, hace `eas build -p android --profile production --non-interactive --wait`, descarga el APK y ABORTA si: el SHA-256 del certificado no es `4A:89:D7:...:0B:D4`, el paquete no es `com.kizunatracker.app`, el `versionCode` no supera al anterior, o falta `KizunaWidgetProvider` / `WidgetSetupActivity` en el APK. No pide contrasenas (credenciales locales). Las comprobaciones compartidas estan en `scripts/lib/apk-assert.sh` (tambien las usa `android-release.sh`); la logica pura de versiones en `scripts/native-release-lib.mjs`.

Con `--dry-run` el commit del bump es temporal (EAS necesita verlo) y se deshace al salir.

## Actualizaciones OTA (EAS Update)

```bash
./scripts/native-update.sh "fix: texto del boton"
```

Publica en el canal `production`. Solo sirve para cambios de JS y assets. Si cambias algo nativo (un modulo nativo nuevo o actualizado, un config plugin, campos nativos de `app.config.ts`, permisos) el fingerprint cambia y los APK instalados NO reciben el update: hay que publicar un APK nuevo con `native-release.sh`. Para probar primero: `eas update --channel preview`, que solo llega a la beta.

## Rollback

1. Un cambio de JS: publicar otro `native-update.sh` con el arreglo, o `eas update:rollback`.
2. Volver al TWA: Android no permite bajar de `versionCode`. Subir `appVersionCode` en `android/twa-manifest.json` por encima del de la app nativa (por ejemplo 20) y publicar con `./scripts/android-release.sh 1.0.x`; el APK TWA, firmado con la misma clave, se instala encima de la nativa. Retirar o marcar la release nativa como pre-release.

## Checklist en dispositivo

- [ ] Instalar el APK encima del TWA 1.0.x: no pide desinstalar, el widget sigue vinculado.
- [ ] Login una vez; cerrar y abrir: la sesion persiste.
- [ ] Hoy: check, deshacer, cantidad, tiempo, lectura, entreno, cardio, foto de prueba, pomodoro (pantalla bloqueada).
- [ ] Offline: avion, tocar un habito, volver la red: un solo registro.
- [ ] Push: aceptar el permiso (Android 13), llega una push real, el toque con la app cerrada abre la ruta.
- [ ] Widget: tocarlo abre la app nativa sin selector; el pairing desde Ajustes (WebView) funciona.
- [ ] WebView: Amigos/Retos/Resumen/Perfil entran ya autenticados; cerrar sesion en la web cierra la nativa y borra cookies.
- [ ] Registro: crear cuenta por `/registro`, vuelve al login con "Cuenta creada".
- [ ] `adb shell dumpsys package com.kizunatracker.app` muestra el mismo certificado que el TWA.

## Pendiente (usuario)

- Agregar `mobile/**` a los ignores de `eslint.config.*` raiz (el hook de proteccion de config lo impide al agente) y quitar el `it.todo` de `tests/unit/root-excludes-mobile.test.ts`.
- Ejecutar `supabase db reset && supabase test db` cuando haya runtime de contenedores (la migracion y sus 38 asserts solo se corrieron en un Postgres 16 local).
- Pegar la migracion `20261128090000_device_push_tokens.sql` en produccion antes de publicar.
- `EXPO_ACCESS_TOKEN` en Vercel solo si activas "enhanced push security" en Expo.
- Las comprobaciones en dispositivo de M0 a M4 y la beta con Maestro (tarea 5.4).
