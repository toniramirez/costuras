-- =============================================================================
-- Costura AP · Migración 0012 · Row Level Security
-- -----------------------------------------------------------------------------
-- Principios:
--   * RLS ACTIVA en todas las tablas de public. Nada queda expuesto por defecto.
--   * La administradora (is_admin()) accede a todo.
--   * El alumno accede EXCLUSIVAMENTE a sus propias filas (current_student_id()).
--   * El alumno nunca escribe sobre dinero (cuotas, pagos, movimientos, cajas).
--   * La contabilidad (cajas, movimientos, categorías) es solo de administración.
--   * Las funciones SECURITY DEFINER de las migraciones 0010/0011 son la única
--     vía para mover dinero: la RLS bloquea la escritura directa.
--   * La seguridad NO depende de ocultar botones en el frontend.
-- =============================================================================

alter table public.profiles                enable row level security;
alter table public.students                enable row level security;
alter table public.plans                   enable row level security;
alter table public.rates                   enable row level security;
alter table public.groups                  enable row level security;
alter table public.student_groups          enable row level security;
alter table public.student_rates           enable row level security;
alter table public.enrollments             enable row level security;
alter table public.payment_methods         enable row level security;
alter table public.cash_accounts           enable row level security;
alter table public.financial_categories    enable row level security;
alter table public.payments                enable row level security;
alter table public.payment_receipts        enable row level security;
alter table public.monthly_fees            enable row level security;
alter table public.registration_fees       enable row level security;
alter table public.payment_proofs          enable row level security;
alter table public.financial_movements     enable row level security;
alter table public.class_sessions          enable row level security;
alter table public.attendance              enable row level security;
alter table public.recovery_credits        enable row level security;
alter table public.projects                enable row level security;
alter table public.project_entries         enable row level security;
alter table public.project_files           enable row level security;
alter table public.announcements           enable row level security;
alter table public.announcement_recipients enable row level security;
alter table public.communications          enable row level security;
alter table public.communication_recipients enable row level security;
alter table public.notifications           enable row level security;
alter table public.workshops               enable row level security;
alter table public.workshop_registrations  enable row level security;
alter table public.academy_settings        enable row level security;
alter table public.audit_logs              enable row level security;

-- =============================================================================
-- PROFILES
-- =============================================================================
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- STUDENTS
-- El alumno ve y edita SOLO su ficha. Las columnas administrativas están
-- además protegidas por el trigger students_guard_protected_columns().
-- =============================================================================
create policy "students_select_own_or_staff" on public.students
  for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_staff());

create policy "students_update_own" on public.students
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "students_admin_all" on public.students
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- CATÁLOGOS (lectura para usuarios autenticados; escritura solo admin)
-- Los precios de planes/tarifas no son información privada entre alumnos.
-- =============================================================================
create policy "plans_read" on public.plans
  for select to authenticated using (true);
create policy "plans_admin_write" on public.plans
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "rates_read" on public.rates
  for select to authenticated using (true);
create policy "rates_admin_write" on public.rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "groups_read" on public.groups
  for select to authenticated using (true);
create policy "groups_admin_write" on public.groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "payment_methods_read" on public.payment_methods
  for select to authenticated using (true);
create policy "payment_methods_admin_write" on public.payment_methods
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Configuración: todos la leen (marca, colores, límites de archivos); solo admin escribe.
create policy "settings_read" on public.academy_settings
  for select to authenticated using (true);
create policy "settings_admin_write" on public.academy_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- HISTORIALES ACADÉMICOS
-- =============================================================================
create policy "student_groups_own_or_admin" on public.student_groups
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_staff());
create policy "student_groups_admin_write" on public.student_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "student_rates_own_or_admin" on public.student_rates
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "student_rates_admin_write" on public.student_rates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "enrollments_own_or_admin" on public.enrollments
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "enrollments_admin_write" on public.enrollments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- CONTABILIDAD: SOLO ADMINISTRACIÓN
-- El alumno NUNCA ve cajas, categorías ni el libro mayor.
-- =============================================================================
create policy "cash_accounts_admin" on public.cash_accounts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "financial_categories_admin" on public.financial_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "financial_movements_admin" on public.financial_movements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- CUOTAS / MATRÍCULAS: el alumno LEE las suyas, nunca las modifica.
-- =============================================================================
create policy "monthly_fees_select_own_or_admin" on public.monthly_fees
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "monthly_fees_admin_write" on public.monthly_fees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "registration_fees_select_own_or_admin" on public.registration_fees
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "registration_fees_admin_write" on public.registration_fees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- PAGOS Y RECIBOS: el alumno LEE los suyos.
-- =============================================================================
create policy "payments_select_own_or_admin" on public.payments
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "payments_admin_write" on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "receipts_select_own_or_admin" on public.payment_receipts
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "receipts_admin_write" on public.payment_receipts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- COMPROBANTES: el alumno sube el suyo (solo para SUS cuotas) y lo consulta.
-- No puede editarlo ni aprobarlo.
-- =============================================================================
create policy "proofs_select_own_or_admin" on public.payment_proofs
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());

create policy "proofs_insert_own" on public.payment_proofs
  for insert to authenticated
  with check (
    student_id = public.current_student_id()
    and (
      (monthly_fee_id is not null and exists (
        select 1 from public.monthly_fees mf
         where mf.id = payment_proofs.monthly_fee_id and mf.student_id = public.current_student_id()
      ))
      or
      (registration_fee_id is not null and exists (
        select 1 from public.registration_fees rf
         where rf.id = payment_proofs.registration_fee_id and rf.student_id = public.current_student_id()
      ))
    )
  );

create policy "proofs_admin_write" on public.payment_proofs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- ASISTENCIA Y RECUPERACIONES: el alumno solo LEE lo suyo.
-- =============================================================================
create policy "class_sessions_read" on public.class_sessions
  for select to authenticated using (true);
create policy "class_sessions_staff_write" on public.class_sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "attendance_select_own_or_staff" on public.attendance
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_staff());
create policy "attendance_admin_write" on public.attendance
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "recovery_select_own_or_admin" on public.recovery_credits
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "recovery_admin_write" on public.recovery_credits
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- PROYECTOS (cuaderno virtual): privados del alumno + la administradora.
-- Ningún alumno puede ver los proyectos de otro.
-- =============================================================================
create policy "projects_owner_or_admin" on public.projects
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());

create policy "projects_owner_insert" on public.projects
  for insert to authenticated
  with check (student_id = public.current_student_id());

create policy "projects_owner_update" on public.projects
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

create policy "projects_owner_delete" on public.projects
  for delete to authenticated
  using (student_id = public.current_student_id());

create policy "projects_admin_all" on public.projects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Entradas: pertenecen al proyecto del alumno.
create policy "project_entries_owner_or_admin" on public.project_entries
  for select to authenticated
  using (exists (
    select 1 from public.projects p
     where p.id = project_entries.project_id
       and (p.student_id = public.current_student_id() or public.is_admin())
  ));

create policy "project_entries_owner_write" on public.project_entries
  for all to authenticated
  using (exists (
    select 1 from public.projects p
     where p.id = project_entries.project_id and p.student_id = public.current_student_id()
  ))
  with check (exists (
    select 1 from public.projects p
     where p.id = project_entries.project_id and p.student_id = public.current_student_id()
  ));

create policy "project_entries_admin_all" on public.project_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Archivos del proyecto.
create policy "project_files_owner_or_admin" on public.project_files
  for select to authenticated
  using (exists (
    select 1 from public.projects p
     where p.id = project_files.project_id
       and (p.student_id = public.current_student_id() or public.is_admin())
  ));

create policy "project_files_owner_write" on public.project_files
  for all to authenticated
  using (exists (
    select 1 from public.projects p
     where p.id = project_files.project_id and p.student_id = public.current_student_id()
  ))
  with check (exists (
    select 1 from public.projects p
     where p.id = project_files.project_id and p.student_id = public.current_student_id()
  ));

create policy "project_files_admin_all" on public.project_files
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- NOVEDADES: el alumno ve las publicadas dirigidas a él (destinatarios expandidos).
-- =============================================================================
-- OJO: la columna externa va SIEMPRE calificada (announcements.id).
-- Un `ar.announcement_id = id` a secas se resolvería contra announcement_recipients.id
-- (la tabla interna también tiene "id") y la condición nunca daría verdadera:
-- el alumno no vería ninguna novedad, sin error alguno.
create policy "announcements_select" on public.announcements
  for select to authenticated
  using (
    public.is_admin()
    or (
      status = 'publicada'
      and (published_at is null or published_at <= now())
      and exists (
        select 1 from public.announcement_recipients ar
         where ar.announcement_id = announcements.id
           and ar.student_id = public.current_student_id()
      )
    )
  );
create policy "announcements_admin_write" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "announcement_recipients_select_own_or_admin" on public.announcement_recipients
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());

-- El alumno solo puede marcar SU novedad como leída.
create policy "announcement_recipients_mark_read" on public.announcement_recipients
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

create policy "announcement_recipients_admin_write" on public.announcement_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- COMUNICADOS: bandeja de entrada. El alumno lee y marca leído; nunca responde.
-- =============================================================================
create policy "communications_select" on public.communications
  for select to authenticated
  using (
    public.is_admin()
    or (
      status = 'publicada'
      and exists (
        select 1 from public.communication_recipients cr
         where cr.communication_id = communications.id
           and cr.student_id = public.current_student_id()
      )
    )
  );
create policy "communications_admin_write" on public.communications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "communication_recipients_select_own_or_admin" on public.communication_recipients
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());

create policy "communication_recipients_mark_read" on public.communication_recipients
  for update to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

create policy "communication_recipients_admin_write" on public.communication_recipients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- NOTIFICACIONES
-- =============================================================================
create policy "notifications_select" on public.notifications
  for select to authenticated
  using (
    (audience = 'alumno' and profile_id = (select auth.uid()))
    or (audience = 'admin' and public.is_admin())
  );

create policy "notifications_mark_read" on public.notifications
  for update to authenticated
  using (
    (audience = 'alumno' and profile_id = (select auth.uid()))
    or (audience = 'admin' and public.is_admin())
  )
  with check (
    (audience = 'alumno' and profile_id = (select auth.uid()))
    or (audience = 'admin' and public.is_admin())
  );

create policy "notifications_admin_write" on public.notifications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- TALLERES
-- =============================================================================
create policy "workshops_select" on public.workshops
  for select to authenticated
  using (public.is_admin() or status in ('publicado', 'inscripcion_abierta', 'cupo_completo', 'finalizado'));
create policy "workshops_admin_write" on public.workshops
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "workshop_regs_select_own_or_admin" on public.workshop_registrations
  for select to authenticated
  using (student_id = public.current_student_id() or public.is_admin());
create policy "workshop_regs_admin_write" on public.workshop_registrations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- AUDITORÍA: solo lectura para la administradora. Inmutable para todos.
-- (Las escrituras entran por triggers SECURITY DEFINER, que saltean la RLS.)
-- =============================================================================
create policy "audit_logs_admin_read" on public.audit_logs
  for select to authenticated
  using (public.is_admin());
