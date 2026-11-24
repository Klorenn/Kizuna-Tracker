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

## Reglas para que un APK actualice al anterior

1. Mismo `packageId` (`com.kizunatracker.app`).
2. Misma clave de firma (el mismo keystore).
3. `appVersionCode` mayor (el script lo incrementa solo).

Si falla alguna, Android rechaza la actualizacion y habria que desinstalar (se pierden los datos locales).

## Advertencia: respalda el keystore

Si pierdes `~/kizuna-release.keystore` o sus contrasenas, nunca mas podras publicar actualizaciones que se instalen sobre las anteriores, y `public/.well-known/assetlinks.json` (que fija el SHA-256 del certificado) dejaria de validar. Guarda una copia cifrada fuera de esta maquina (gestor de contrasenas o disco cifrado). Nunca lo subas al repo (esta en `.gitignore`).
