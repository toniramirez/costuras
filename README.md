# Costura AP

Aplicación de gestión para una academia de costura. Los alumnos cursan por tiempo
indefinido, avanzan a su ritmo y trabajan en sus propios proyectos.

**Stack:** Next.js 16 (App Router) · TypeScript estricto · Tailwind CSS 4 ·
Supabase (PostgreSQL + Auth + Storage) · React Hook Form + Zod · PWA · Vercel.
Interfaz íntegramente en español. Región: Argentina (ARS, día/mes/año,
`America/Argentina/Cordoba`).

---

## Estado: las 9 fases están implementadas

**Todo verificado contra el Supabase real, no solo compilado.**

| Verificación | Resultado |
|---|---|
| Esquema (32 tablas, 23 enums, 2 vistas, 20 migraciones) | ✅ Aplicado |
| RLS (92 políticas) + analizador de seguridad de Supabase | ✅ **0 errores** |
| Pruebas de lógica de negocio y seguridad (PGlite) | ✅ **113 en verde** |
| TypeScript estricto (190 archivos) · ESLint | ✅ **0 errores** |
| Build de producción (50 rutas) | ✅ Compila |
| **Las 40 páginas cargadas con sesión real** | ✅ **Todas 200** |
| Aislamiento entre alumnos, contra la base real | ✅ Probado |

### Lo que hay

| Fase | Módulo | Rutas |
|---|---|---|
| 1 | Auth, roles, layouts, PWA, configuración visual | `/ingresar` `/recuperar` `/nueva-clave` |
| 2 | Alumnos, grupos, modalidades, tarifas, matrícula | `/admin/alumnos` `/grupos` `/modalidades` `/tarifas` |
| 3 | Cuotas, pagos, comprobantes, cajas, movimientos, **recibos PDF** | `/admin/cuotas` `/comprobantes` `/cajas` `/movimientos` |
| 4 | Asistencia y recuperaciones | `/admin/asistencia` `/recuperaciones` |
| 5 | Proyectos, cuaderno virtual, galería, **descargas PDF y ZIP** | `/alumno/proyectos` `/galeria` `/admin/proyectos` |
| 6 | Comunicados, novedades, notificaciones | `/admin/comunicados` `/novedades` `/notificaciones` |
| 7 | Talleres, inscripciones, lista de espera | `/admin/talleres` `/alumno/talleres` |
| 8 | **Mercado Pago** (preferencia + webhook idempotente) | `/api/mercadopago/*` `/pago/*` |
| 9 | Exportaciones CSV, auditoría, cron | `/api/exportar/*` `/admin/auditoria` `/api/cron` |
| — | Portal del alumno completo | `/alumno/pagos` `/asistencia` `/recuperaciones` `/perfil` |

El menú lista **solo las secciones que existen**. No hay botones muertos ni
pantallas marcadas como «próximamente».

### Limitaciones conocidas (honestas)

- **La administradora crea proyectos pero no adjunta archivos desde el panel.**
  No es una restricción de permisos (la base se lo permite: verificado). Es una
  decisión de producto: el cuaderno es del alumno y las fotos las saca él. Si se
  quiere habilitar, alcanza con agregar el uploader.
- **Mercado Pago necesita un dominio HTTPS público.** En `localhost` el checkout
  funciona, pero la acreditación automática requiere que MP pueda llamar al
  webhook (dominio real o un túnel).
- **El envío de correos automáticos no está implementado** (la especificación lo
  dejaba como opcional). La arquitectura de notificaciones ya está lista para
  engancharlo.
- **Los borradores de comunicados no guardan el destinatario concreto**, solo el
  alcance: al reabrirlos hay que volver a elegirlo. Es a propósito — expandir los
  destinatarios en un borrador dejaría que el alumno se bajara los adjuntos antes
  de que se lo envíen.

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) y creá un **proyecto nuevo y
   dedicado** a Costura AP. No reutilices uno que ya tenga otra aplicación.
2. Elegí la región más cercana (`South America (São Paulo)` para Argentina).
3. Guardá la contraseña de la base en un lugar seguro.

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completá con los datos de **Project Settings → API**:

| Variable | Dónde se usa | ¿Secreta? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Navegador y servidor | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Navegador y servidor | No (la RLS protege) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | 🔴 **Sí. Saltea la RLS** |
| `NEXT_PUBLIC_SITE_URL` | Redirecciones de Auth y Mercado Pago | No |
| `MERCADOPAGO_ACCESS_TOKEN` | **Solo servidor** (opcional) | 🔴 **Sí** |
| `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` | Navegador (opcional) | No |
| `CRON_SECRET` | Protege `/api/cron/*` | 🔴 Sí |

> `SUPABASE_SERVICE_ROLE_KEY` **nunca** puede llevar el prefijo `NEXT_PUBLIC_`.
> `src/lib/env.server.ts` importa `server-only`: si algún componente de cliente lo
> importara por error, **la compilación falla**. Es una garantía, no una convención.

### 3. Aplicar las migraciones

Con el CLI de Supabase:

```bash
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

O pegando, **en orden**, cada archivo de `supabase/migrations/` en el **SQL
Editor** del panel de Supabase.

### 4. Generar los tipos TypeScript

```bash
npm run db:types
```

Los tipos salen de las migraciones locales (no hace falta base remota). Con el
proyecto ya enlazado también sirve el CLI oficial:

```bash
npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
```

### 5. Endurecer Auth y crear la primera administradora

```bash
npm run auth:harden                                    # deshabilita el registro público
npm run admin:create -- ana@ejemplo.com "Ana Pérez"    # crea la administradora
```

`auth:harden` **deshabilita el registro público**: en Costura AP nadie se
auto-registra, la administradora crea cada cuenta.

`admin:create` genera una contraseña temporal fuerte, la muestra **una sola vez**
y obliga a cambiarla en el primer ingreso.

> **Por qué son dos pasos internamente:** el usuario se crea siempre con rol
> `alumno` (el trigger **ignora** los metadatos) y recién después se lo asciende
> con `service_role`. Esa separación es justamente lo que impide que alguien se
> auto-proclame administradora al registrarse. Ver *Seguridad*.

### 6. Levantar la aplicación

```bash
npm install
npm run dev
```

Abrí <http://localhost:3000>: entrás directo al login (no hay página pública).

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | TypeScript sin emitir |
| `npm run db:validate` | Aplica las migraciones a un PostgreSQL efímero y reporta errores |
| `npm run db:test` | **107 pruebas** de lógica de negocio, RLS y seguridad |
| `npm run db:types` | Regenera `database.types.ts` desde las migraciones |
| `npm run db:check` | Conecta al Supabase real y lista migraciones pendientes (**no escribe**) |
| `npm run db:push` | Aplica las migraciones pendientes al Supabase real |
| `npm run db:verify` | Audita el esquema aplicado + analizador de seguridad de Supabase |
| `npm run auth:harden` | Deshabilita el registro público y fija el mínimo de contraseña |
| `npm run admin:create` | Crea la primera administradora |
| `npm run smoke` | Prueba de humo end-to-end contra el Supabase real (login + RLS + fugas) |
| `npm run demo:seed` | Carga datos de demostración coherentes |
| `npm run demo:clean` | Los borra sin dejar rastro |
| `npm run icons` | Regenera los íconos de la PWA |
| `npm test` | `db:test` + `typecheck` |

### Datos de demostración

```bash
npm run demo:seed    # 6 alumnas, 2 grupos, 2 modalidades, cuotas, cobros,
                     # un comprobante a revisar, asistencias, una recuperación,
                     # 3 proyectos, un taller con lista de espera, novedades y gastos
npm run demo:clean   # los elimina
```

Todo lo que crea lleva el prefijo **«Demo · »** o el correo **`@demo.local`**: se
distingue de un vistazo y se borra sin tocar datos reales. Los cobros se hacen
llamando a las **mismas funciones que usa la aplicación**, así que los recibos,
los movimientos de caja y las notificaciones que quedan son reales, no maquetas.

`db:validate` y `db:test` corren **sin Docker y sin base remota**: usan
[PGlite](https://pglite.dev) (PostgreSQL compilado a WebAssembly). Sirven en CI
antes de cada `db push`.

---

## Mercado Pago (opcional)

La aplicación **funciona perfectamente sin Mercado Pago**: los pagos se registran
de forma manual y el panel muestra un aviso administrativo. Para activarlo:

1. [Mercado Pago Developers](https://www.mercadopago.com.ar/developers) → creá una
   aplicación → **Credenciales de producción**.
2. Cargá `MERCADOPAGO_ACCESS_TOKEN` (privada) y
   `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` (pública).
3. Activá Mercado Pago desde **Configuración** en el panel.
4. Configurá el webhook apuntando a `https://tu-dominio/api/webhooks/mercadopago`.

> El **access token jamás llega al navegador**. La preferencia se crea desde el
> servidor y el pago se valida contra la API de Mercado Pago desde el webhook:
> nunca se confía en la URL de retorno. La función `confirm_mercadopago_payment`
> es **idempotente** (un mismo `mp_payment_id` no se acredita dos veces).

---

## Despliegue en Vercel

1. Subí el repositorio a GitHub.
2. En Vercel: **New Project** → importá el repo (detecta Next.js solo).
3. Cargá **todas** las variables de entorno (Settings → Environment Variables).
   `NEXT_PUBLIC_SITE_URL` debe ser el dominio final.
4. Deploy.
5. En Supabase → **Authentication → URL Configuration**, agregá tu dominio de
   Vercel a **Site URL** y **Redirect URLs**. Si no, los correos de recuperación
   apuntan a `localhost`.

---

## Copias de seguridad

- **Automáticas:** Supabase hace backups diarios (7 días de retención en el plan
  Pro). En el plan **Free no hay backups automáticos** — tenelo muy presente.
- **Manual:** `npx supabase db dump -f respaldo.sql`, guardado fuera de Supabase.
- **Recomendación:** un dump mensual archivado aparte. Los archivos de Storage
  (comprobantes, proyectos) se respaldan por separado: **no entran** en el dump
  de la base.

---

## Decisiones técnicas tomadas

1. **Dinero en `bigint` (centavos)**, nunca en punto flotante. Sufijo `_cents`.
2. **Los pagos parciales son imposibles por diseño**: una cuota no tiene columna
   de "monto abonado". Está pagada o no lo está.
3. **Los saldos no se guardan, se calculan** (`cash_account_balances` = saldo
   inicial + Σ movimientos). Así no pueden desincronizarse. Un ajuste manual
   genera un movimiento de tipo `ajuste`.
4. **Los movimientos originados en un pago son inmutables.** Un trigger impide
   editarlos y borrarlos; las correcciones generan un movimiento de reverso.
5. **La tabla `roles` se consolidó en un enum `app_role`** (`admin` / `profesor` /
   `alumno`) sobre `profiles`: más simple y más rápido para la RLS. El rol
   `profesor` ya existe en el esquema (`groups.professor_id`) pero no se muestra
   todavía en la interfaz.
6. **Un grupo = una franja semanal fija** (día + hora inicio + hora fin). Coincide
   con el dominio ("día fijo, horario fijo"). Un grupo con dos franjas se modela
   como dos grupos; por eso no existe `group_schedules`.
7. **Un alumno pausado libera su cupo** y no genera cuotas nuevas, pero conserva
   usuario, proyectos, archivos e historial.
8. **Los destinatarios de novedades y comunicados se expanden a una fila por
   alumno** al publicar. Hace triviales el "quién leyó / quién no" y la RLS.
9. **`assert_admin()` en vez de un `is_admin()` a secas** dentro de las funciones
   de negocio: cuando llama el servidor con `service_role` no hay usuario final
   (`auth.uid()` es `NULL`), y un chequeo ingenuo habría bloqueado al propio cron.
10. **El bucket `branding` es público**; todos los demás son **privados**. El logo
    debe verse en el login, donde todavía no hay sesión, y no contiene ningún dato
    de alumnos.
11. **Enero y febrero no se facturan por defecto** (receso de verano en Argentina),
    pero es configurable, igual que el modo de cobro de quien se inscribe en esos
    meses.
12. **Una cuota rechazada vuelve a `vencida`** (no a `pendiente`) si ya pasó su
    vencimiento: así reaparece en el listado de deudores.
13. **Sin modo oscuro.** La identidad es delicada y clara; agregarlo duplicaría el
    trabajo de diseño sin un pedido concreto.
14. **La navegación solo enlaza secciones que existen.** Mejor un menú corto y
    honesto que botones que no hacen nada.

---

## Seguridad

### Dos agujeros críticos que encontró la auditoría (y cómo se cerraron)

Ambos los detectó el analizador de seguridad de Supabase **después** de aplicar el
esquema. Ninguno lo habían visto las pruebas, y los dos eran explotables por
**cualquiera, sin sesión**. Quedan documentados porque son errores fáciles de
repetir:

**1. `anon` podía ejecutar las funciones que mueven dinero.**
PostgreSQL concede `EXECUTE` a `PUBLIC` por defecto en toda función nueva, y
`anon` es miembro de `PUBLIC`. Sin sesión se podía llamar a
`/rest/v1/rpc/approve_payment_proof`, `settle_monthly_fee`, `void_payment`…
Y el guardia no frenaba: `assert_admin()` daba por buena la llamada cuando
`auth.uid()` era `NULL` (pensado para el servidor)… **y para `anon` también es
`NULL`**.
→ Migración **0016**: se revoca `EXECUTE` a `PUBLIC`/`anon` en todas las funciones
propias, y `assert_admin()` pasa a mirar el rol de la petición. Dos barreras
independientes, ambas con prueba propia.

**2. Escalada de privilegios en el registro.**
`handle_new_user()` leía el rol desde `raw_user_meta_data`, que **controla quien
se registra**. Con el registro público abierto (el default de Supabase):
`signUp({ options: { data: { role: 'admin' } } })` → administradora de la academia.
→ Migración **0018**: todo usuario nace `alumno`; ascender es una operación
privilegiada aparte. Y `npm run auth:harden` deshabilita el registro público.

Verificalo vos mismo: `npm run db:test` y `npm run db:verify`.

### Resto de las garantías

- **RLS activa en las 32 tablas.** El alumno accede exclusivamente a sus filas.
- **`anon` no tiene acceso a ninguna tabla** (`REVOKE ALL`) **ni a ninguna
  función**. El login pasa por la API de Auth.
- **La auditoría es inmutable**: se le revocó `INSERT/UPDATE/DELETE` incluso a
  `authenticated`. Solo escriben los triggers `SECURITY DEFINER`.
- **Las columnas administrativas del alumno están protegidas por un trigger**,
  además de por la RLS: aunque pueda editar su propia fila, no puede tocar tarifa,
  grupo, modalidad ni estado.
- Todas las funciones `SECURITY DEFINER` usan `search_path = ''` y califican los
  esquemas: no se las puede secuestrar.
- La seguridad **no depende de ocultar botones**. Verificalo vos mismo:
  `npm run db:test`.

---

## Estructura

```
supabase/migrations/   15 migraciones (esquema → RLS → storage → permisos)
scripts/               validador, suite de pruebas y generador de tipos (PGlite)
src/app/               rutas: (auth) · /admin · /alumno · /auth/callback
src/components/ui/     design system (Button, Field, Card, Badge…)
src/components/layout/ shell, navegación inferior y lateral
src/lib/               env, supabase (3 clientes), auth, format, labels, services
src/proxy.ts           sesión y protección de rutas (Next.js 16)
```
