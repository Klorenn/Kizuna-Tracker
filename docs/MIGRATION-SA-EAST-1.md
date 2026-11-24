# Migración de Supabase a sa-east-1 (São Paulo)

OLD (producción, us-west-2): `wdrroprcszbamrjktmuf`. NEW (sa-east-1): `xhjgybtyfkfixkrzlfmx`.
El esquema de NEW ya está aplicado (27 migraciones, las mismas que OLD). Falta copiar datos y fotos y cambiar el tráfico.

**Restricción del plan gratuito: sólo UN proyecto activo a la vez.** Por eso el flujo es secuencial:
`export` (OLD activo) → pausar OLD y restaurar NEW → `import` → `switch-vercel` → deploy.
OLD no se borra ni se modifica (salvo des-programar su cron); el rollback es: pausar NEW, restaurar OLD, `rollback-vercel`.

Todo lo hace `scripts/migrate-region.sh` en tu terminal. No imprime ni guarda secretos (salvo el backup de variables de Vercel, chmod 600 en `backups/`, ignorado por git).

## 0. Antes de la ventana

1. Cliente Postgres 17+ ya instalado (`/opt/homebrew/opt/libpq/bin`; el script lo agrega al PATH solo). Necesitás `curl`, `jq`, la CLI de Vercel logueada (`vercel whoami`) y espacio en disco para `backups/` (backup completo + fotos).
2. Credenciales (dashboard de Supabase):
   - **`OLD_DB_URL` / `NEW_DB_URL`**: Project Settings → Database → Connection string → **Session pooler** (puerto 5432; el host directo es sólo IPv6). Reemplazá `[YOUR-PASSWORD]`.
   - **`OLD_SECRET_KEY` / `NEW_SECRET_KEY`**: Project Settings → API Keys → Secret key (`sb_secret_...`) de cada proyecto. Si Storage rechaza la secret key, el script avisa; en ese caso exportá `OLD_SERVICE_ROLE_KEY` / `NEW_SERVICE_ROLE_KEY` (pestaña Legacy, JWT `service_role`).
   - Las variables que falten se piden con prompt silencioso.
3. Pausar / restaurar un proyecto lleva ~5–10 min cada uno. Planificá la ventana para ~45–60 min.

## 1. Ventana de mantenimiento

| Min | Paso |
| --- | --- |
| 0 | Avisá a los usuarios (se van a deslogear). Con OLD **activo**: `scripts/migrate-region.sh export` (confirmá con `EXPORT`). |
| 0–10 | El export des-programa el cron de OLD (`select cron.unschedule('kizuna-cron')`, idempotente; `--no-unschedule` para saltearlo), hace el backup completo (`backups/old-<ts>.dump`), el dump de datos de `public.*` + `auth.users` + `auth.identities` (`backups/export-<ts>/data.sql`), calcula `counts.json` (valores esperados, tomados del mismo dump), descarga todas las fotos (`proofs`, `avatars`) a `export-<ts>/storage/` y escribe `manifest.json`. Termina imprimiendo los pasos siguientes. |
| 10–20 | Dashboard: **pausar OLD** (Project Settings → General → Pause project) y luego **restaurar NEW** (proyecto NEW → Restore project). Esperá a que NEW esté `ACTIVE_HEALTHY`. |
| 20 | Ensayo: `scripts/migrate-region.sh import backups/export-<ts> --dry-run` (hace todo el restore dentro de una transacción con ROLLBACK y compara conteos). |
| 22 | Real: `scripts/migrate-region.sh import backups/export-<ts>` (confirmá con `IMPORT`). Restore en UNA transacción (modo réplica, sin triggers), sube las fotos con las mismas rutas, y verifica conteos de filas y de objetos contra `counts.json` / `manifest.json`. Sale con error si algo no coincide. Si NEW ya tiene usuarios: agregá `--force-reset`. |
| 30 | `scripts/migrate-region.sh switch-vercel backups/export-<ts>` (sólo corre si el import quedó verificado): guarda las 6 variables actuales de Vercel en `backups/vercel-env-before-<ts>.env` y las cambia a NEW (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`). No toca `VAPID_*`. No despliega. |
| 32 | Cambiá `vercel.json` a `{ "regions": ["gru1"] }`, commit y push: eso despliega (las `NEXT_PUBLIC_*` se incrustan al compilar). |
| 40 | Con el deploy ya en línea, en NEW (SQL editor): `select vault.create_secret('https://kizuna-tracker.vercel.app','app_url');` (activa el cron; `cron_secret` ya existe en NEW, lo creó la migración 0020). |
| 45 | Verificación post-corte (sección 3). |

### Si el export falla o hay un dump de respaldo

`import` también acepta el backup de clúster del dashboard (`pg_dumpall`, SQL plano gzip) en lugar de un export:

```
scripts/migrate-region.sh import --fallback-backup <archivo.backup.gz> [--storage-from backups/export-<ts>] --dry-run
```

El archivo se trata como dato no confiable: nunca se ejecuta entero, sólo se extraen los bloques `COPY` de `auth.users`, `auth.identities` y `public.*`. Antes de escribir, el script compara las columnas de cada `COPY` con las de NEW (versiones de GoTrue/esquema pueden diferir) y aborta informando las diferencias. Los conteos esperados se calculan contando las filas de los `COPY`. Las fotos requieren un export (`--storage-from`); sin eso se copia sólo la base de datos.

## 2. Rollback

1. Dashboard: **pausar NEW** y **restaurar OLD** (esperá `ACTIVE_HEALTHY`, ~5–10 min cada uno).
2. `scripts/migrate-region.sh rollback-vercel backups/vercel-env-before-<ts>.env` (restaura las 6 variables).
3. Revertí `vercel.json` a `pdx1`, commit y push (redeploy).
4. En OLD: `select cron.schedule('kizuna-cron', '*/15 * * * *', 'select public.call_cron_endpoints()');`

Lo que se haya escrito en NEW después del corte NO está en OLD. No borres OLD hasta tener varios días de estabilidad (y recordá que OLD pausado igualmente cuenta contra los límites del plan).

## 3. Verificación post-corte

- [ ] **Login** con un usuario existente (la contraseña se conserva; la sesión no: hay que volver a entrar).
- [ ] **Fotos**: se ven las de proofs (amigos/grupos) y los avatares subidos.
- [ ] **Push**: un check-in o un rechazo que dispare notificación llega (las suscripciones se copiaron; si alguna falla, reactivarla desde Perfil).
- [ ] **Cron**: a los ~15 min, en NEW: `select id, status_code, created from net._http_response order by created desc limit 5;` deben aparecer respuestas 200 de `/api/cron/close-periods` y `/api/cron/reminders`. Si no hay filas: `select name from vault.secrets;` (deben estar `app_url` y `cron_secret`) y `select jobname, active from cron.job;`.
- [ ] Un check-in nuevo y una subida de foto nueva funcionan (escritura en NEW + Storage).
- [ ] Revisá los logs de Vercel por errores 401/403/500 en los primeros minutos.

## 4. Limpieza

Guardá `backups/` en un lugar seguro: contiene hashes de contraseñas y fotos privadas. Borrá OLD sólo cuando estés seguro.
