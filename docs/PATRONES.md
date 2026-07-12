# Patrones de Costura AP

Contrato obligatorio. Todo módulo nuevo se construye así. El **módulo de
referencia** es *Modalidades* — leelo antes de escribir nada:

- `src/lib/validations/plans.ts`
- `src/lib/services/plans.ts`
- `src/app/actions/plans.ts`
- `src/app/admin/modalidades/page.tsx` (servidor)
- `src/app/admin/modalidades/plans-client.tsx` (cliente)

---

## Las 4 capas

| Capa | Dónde | Regla |
|---|---|---|
| **Validación** | `src/lib/validations/<dominio>.ts` | Zod. Se usa en el formulario **y** en la action. |
| **Servicio** | `src/lib/services/<dominio>.ts` | `import 'server-only'`. **Solo LEE.** |
| **Action** | `src/app/actions/<dominio>.ts` | `'use server'`. Todas las escrituras. |
| **UI** | `src/app/admin/<ruta>/` | `page.tsx` servidor + `*-client.tsx` cliente. |

## Reglas que no se negocian

**1. Dinero: centavos en la base, pesos en el formulario.**
La base guarda `bigint` de centavos (`*_cents`). El formulario trabaja en pesos.
La conversión se hace **en la server action** con `pesosToCents()`. Nunca antes,
nunca con floats.

**2. Números en Zod: `z.number()`, jamás `z.coerce.number()`.**
En Zod 4 el tipo de entrada de `coerce` es `unknown` y rompe la inferencia de
React Hook Form. En el formulario se registran con `{ valueAsNumber: true }`.

```ts
// validación
precio: z.number({ message: 'Tiene que ser un número' }).min(0, 'No puede ser negativo'),
// formulario
{...register('precio', { valueAsNumber: true })}
```

**3. Toda server action devuelve `ActionResult`.** Nunca lanza al cliente.

```ts
'use server';
export async function guardarX(id: string | null, datos: unknown) {
  return ejecutar(async () => {
    await assertAdmin();                 // falla temprano y claro
    const v = esquemaX.parse(datos);     // Zod TAMBIÉN en el servidor
    const supabase = await createClient();
    orThrow(await supabase.from('x').insert({ ... }).select('id').single());
    revalidatePath('/admin/x');
  }, 'X creado');
}
```

En el cliente:

```ts
const r = await guardarX(id, datos);
if (!r.ok) { toast.error(r.error); return; }
toast.success(r.message);
router.refresh();
```

**4. La lógica de negocio YA ESTÁ EN LA BASE. No la reimplementes.**
Llamalas con `supabase.rpc(...)`. Ya están probadas (107 tests) y son las únicas
que mueven dinero de forma correcta:

| Función | Qué hace |
|---|---|
| `generate_monthly_fees(p_year, p_month)` | Genera cuotas del mes. Idempotente. |
| `settle_monthly_fee(p_fee_id, p_method_id, p_cash_account_id, …)` | Cobra una cuota: crea pago + recibo + movimiento. |
| `settle_registration_fee(...)` | Ídem para matrícula. |
| `approve_payment_proof(p_proof_id, p_cash_account_id, p_method_id)` | Aprueba comprobante → cuota pagada. |
| `reject_payment_proof(p_proof_id, p_reason)` | Rechaza con motivo. |
| `void_payment(p_payment_id, p_reason)` | Anula pago (genera reverso). |
| `mark_overdue_fees()` | Marca vencidas. |
| `issue_recovery_credit(p_attendance_id, p_reason, p_force)` | Crédito de recuperación. |
| `reserve_recovery_credit(p_credit_id, p_group_id, p_date)` | Reserva (valida cupo). |
| `use_recovery_credit(p_credit_id, p_group_id, p_date)` | Consume (anti doble uso). |
| `cancel_recovery_credit(p_credit_id, p_reason)` | Cancela. |
| `register_to_workshop(p_workshop_id, p_student_id, p_first_name, …)` | Inscribe (lista de espera automática). |
| `confirm_workshop_registration(p_registration_id, p_method_id, p_cash_account_id, …)` | Confirma con el pago. |
| `promote_from_waitlist(p_workshop_id)` | Promueve al primero de la lista. |

Los errores de estas funciones ya vienen redactados en español y `mapError()` los
pasa tal cual. **No los reescribas.**

**5. Los saldos NO se guardan, se calculan.** Leelos de las vistas
`cash_account_balances` y `group_occupancy`. Nunca sumes a mano.

**6. Filtros por URL.** `searchParams`, nunca estado local. Usá `SearchInput`,
`FilterSelect`, `FiltersBar` y `<Pagination>` (componentes de cliente).

Para armar el `.range()` en un **servicio**, importá `rangoPagina` / `POR_PAGINA`
de **`@/lib/pagination`**, NO de `@/components/ui/pagination`: ese archivo es
`'use client'` y sus exportaciones no se pueden invocar desde el servidor
(revienta en runtime, no en compilación).

**7. Confirmación antes de borrar o anular.** Siempre `<ConfirmDialog>`.
Para lo irreversible (anular un pago), usá `requireText`.

**8. Nada de botones muertos.** Si una función no está lista, no pongas el botón.

**9. Mobile-first.** Usá `<DataList>` (tabla en escritorio, tarjetas en celular).

**10. `service_role` solo cuando no hay alternativa.** Casi todo va con
`@/lib/supabase/server` (respeta RLS). `@/lib/supabase/admin` solo para: crear
usuarios de Auth, webhook de Mercado Pago y rutas de cron.

## Kit disponible (no reinventar)

```
@/components/ui/button      Button (loading bloquea el doble envío)
@/components/ui/field       Input, Textarea, Select, MoneyInput, Field
@/components/ui/card        Card, CardHeader, CardTitle, CardContent, StatCard
@/components/ui/badge       Badge, StatusBadge
@/components/ui/dialog      Dialog, ConfirmDialog
@/components/ui/data-list   DataList, PageHeader, Column<T>
@/components/ui/states      Skeleton, ListSkeleton, EmptyState, Callout
@/components/ui/filters     SearchInput, FilterSelect, FiltersBar
@/components/ui/pagination  <Pagination>  (solo el componente)
@/lib/pagination            rangoPagina, POR_PAGINA, paginaDe  ← desde servicios

@/lib/format        formatMoney, formatDate, formatDateTime, formatPeriod,
                    formatSchedule, pesosToCents, centsToPesos, todayISO, MESES
@/lib/labels        ESTADO_CUOTA, ESTADO_ALUMNO, ESTADO_TALLER, … + opciones()
@/lib/action-result ejecutar, orThrow, exito, falla, ActionResult
@/lib/errors        mapError
@/lib/auth          assertAdmin, assertStudent, requireAdmin, requireStudent
@/lib/storage       subirArchivo, validarArchivo, urlFirmada, nombreSeguro
@/lib/settings      getSettings, getBranding
```

Tipos de la base: `import type { Tables, Enums } from '@/lib/supabase/database.types'`.
Se regeneran con `npm run db:types`. **No editarlos a mano.**

## Antes de dar algo por terminado

```bash
npx tsc --noEmit     # 0 errores
```
