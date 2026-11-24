# Kizuna para Android (TWA)

App Android que envuelve la PWA https://kizuna-tracker.vercel.app/ con una Trusted Web Activity (Bubblewrap). Distribucion por APK directo en GitHub Releases, no por Google Play. Las notificaciones Web Push se muestran como notificaciones nativas (`enableNotifications: true`).

## Requisitos

- macOS con Homebrew: `brew install openjdk@17` y `brew install --cask android-commandlinetools`.
- SDK: `platforms;android-36`, `build-tools;36.1.0` (aceptar licencias con `yes | sdkmanager --licenses`).
- `~/.bubblewrap/config.json` con `jdkPath` (el `openjdk.jdk` de JDK 17) y `androidSdkPath`. Bubblewrap exige que exista `tools/` o `bin/` dentro del SDK: con el cask de Homebrew hay que crear `ln -s cmdline-tools/latest <sdk>/tools`.
- `gh` autenticado (`gh auth login`), Node, `rg` y `sd`.
- El keystore de release en `~/kizuna-release.keystore` (alias `kizuna`).

## Publicar una version

```bash
./scripts/android-release.sh 1.0.1
```

El script valida el semver y `gh`, sube `appVersionName` y suma 1 a `appVersionCode`, regenera el proyecto, compila y firma el APK (pide las contrasenas con `read -s` si no estan en `BUBBLEWRAP_KEYSTORE_PASSWORD` / `BUBBLEWRAP_KEY_PASSWORD`), verifica con `apksigner` que el SHA-256 del certificado sea el esperado, y entonces hace commit, tag `android-v1.0.1`, push y `gh release create`.

- `--dry-run`: compila y verifica, pero no hace commit, tag, push ni release (y restaura el manifest).
- `android/` debe estar sin cambios sin commitear antes de publicar.

## Widget "Hoy" (modulo `android/widget`)

Widget de pantalla de inicio (4x2, redimensionable) con los habitos pendientes de hoy. Es un modulo Gradle de libreria en Java plano; `bubblewrap update` regenera `app/`, `settings.gradle` y `build.gradle`, pero nunca toca `android/widget/`.

- **Enlace al proyecto**: `scripts/android-release.sh` ejecuta `scripts/android-widget-patch.mjs` justo despues de `bubblewrap update`. Agrega `include ':widget'` a `settings.gradle` y `implementation project(':widget')` a `app/build.gradle`. Es idempotente (la segunda pasada no cambia nada) y falla con exit 1 si Bubblewrap cambia el layout y desaparecen los anclajes.
- **Verificacion del APK**: antes de copiar el APK, el script usa `aapt2 dump xmltree` y `dexdump` (build-tools 36.1.0) para comprobar que el manifest fusionado trae el receiver, el `APPWIDGET_UPDATE`, el `android.appwidget.provider`, `WidgetSetupActivity` y el permiso `INTERNET`, y que R8 no elimino `KizunaWidgetProvider`. Corre tambien con `--dry-run`.
- **Emparejamiento**: Ajustes > Widget de Android genera un codigo `ABCD-EFGH` (vence en 5 minutos, un solo uso). En Android se abre `kizuna://widget/pair?code=...`, que solo RELLENA el codigo: hay que tocar "Conectar". Tambien se puede pegar el codigo a mano en la pantalla de conexion del widget.
- **Token**: se guarda cifrado (AES-GCM, clave en el Android Keystore, alias `kizuna_widget_token_v1`). No cambies el alias ni el `applicationId`: un APK nuevo sobre el anterior conserva el token y el widget sigue funcionando sin volver a emparejar.
- **Limite y rotacion**: maximo 3 dispositivos conectados por cuenta. Para liberar un cupo, "Desconectar" en Ajustes y volver a emparejar. Al re-emparejar el mismo telefono, el token anterior se revoca solo y no consume cupo.
- **Pruebas unitarias**: `cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ./gradlew :widget:testDebugUnitTest` (logica pura: `PayloadParser`, `WidgetStateReducer`, `RolloverClock`, `PairingCode`).
- **Compilar sin firmar** (para validar que todo enlaza): `./gradlew :app:assembleRelease` genera `app/build/outputs/apk/release/app-release-unsigned.apk`.

## Reglas para que un APK actualice al anterior

1. Mismo `packageId` (`com.kizunatracker.app`).
2. Misma clave de firma (el mismo keystore).
3. `appVersionCode` mayor (el script lo incrementa solo).

Si falla alguna, Android rechaza la actualizacion y habria que desinstalar (se pierden los datos locales).

## Advertencia: respalda el keystore

Si pierdes `~/kizuna-release.keystore` o sus contrasenas, nunca mas podras publicar actualizaciones que se instalen sobre las anteriores, y `public/.well-known/assetlinks.json` (que fija el SHA-256 del certificado) dejaria de validar. Guarda una copia cifrada fuera de esta maquina (gestor de contrasenas o disco cifrado). Nunca lo subas al repo (esta en `.gitignore`).
