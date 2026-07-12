-- =============================================================================
-- Costura AP · Migración 0013 · Supabase Storage: buckets y políticas
-- -----------------------------------------------------------------------------
-- TODOS los buckets con información de alumnos son PRIVADOS.
-- Único bucket público: 'branding' (logo, isotipo, íconos PWA). No contiene
-- datos de alumnos y el logo debe verse en la pantalla de login (sin sesión).
--
-- Convención de rutas (la política de acceso se apoya en la 1ª carpeta):
--   avatars/<profile_id>/<archivo>
--   proofs/<student_id>/<fee_id>/<archivo>
--   projects/<student_id>/<project_id>/<archivo>
--   receipts/<student_id>/<numero>.pdf
--   announcements/<announcement_id>/<archivo>
--   communications/<communication_id>/<archivo>
--   workshops/<workshop_id>/<archivo>
--   branding/<archivo>
--
-- Los límites de tamaño de bucket son un tope duro. Los límites configurables
-- desde el panel (academy_settings) se validan además en la aplicación.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('branding', 'branding', true, 5242880,
    array['image/png','image/jpeg','image/webp','image/svg+xml','image/x-icon']),

  ('avatars', 'avatars', false, 10485760,
    array['image/png','image/jpeg','image/webp','image/heic']),

  ('proofs', 'proofs', false, 20971520,
    array['image/png','image/jpeg','image/webp','image/heic','application/pdf']),

  ('projects', 'projects', false, 52428800,
    array['image/png','image/jpeg','image/webp','image/heic',
          'video/mp4','video/webm','video/quicktime',
          'application/pdf','application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),

  ('receipts', 'receipts', false, 10485760,
    array['application/pdf']),

  ('announcements', 'announcements', false, 20971520,
    array['image/png','image/jpeg','image/webp','application/pdf']),

  ('communications', 'communications', false, 20971520,
    array['image/png','image/jpeg','image/webp','application/pdf']),

  ('workshops', 'workshops', false, 10485760,
    array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- =============================================================================
-- BRANDING (público en lectura, solo admin escribe)
-- =============================================================================
create policy "branding_public_read" on storage.objects
  for select using (bucket_id = 'branding');

create policy "branding_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'branding' and public.is_admin())
  with check (bucket_id = 'branding' and public.is_admin());

-- =============================================================================
-- AVATARS · avatars/<profile_id>/…
-- Cada usuario gestiona su propia foto. La administradora ve todas.
-- =============================================================================
create policy "avatars_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

create policy "avatars_write_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

create policy "avatars_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

-- =============================================================================
-- PROOFS (comprobantes) · proofs/<student_id>/…
-- El alumno sube y consulta SOLO los suyos. La administradora, todos.
-- =============================================================================
create policy "proofs_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs'
    and (
      (storage.foldername(name))[1] = coalesce(public.current_student_id()::text, '-')
      or public.is_admin()
    )
  );

create policy "proofs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = coalesce(public.current_student_id()::text, '-')
  );

create policy "proofs_admin_manage" on storage.objects
  for all to authenticated
  using (bucket_id = 'proofs' and public.is_admin())
  with check (bucket_id = 'proofs' and public.is_admin());

-- =============================================================================
-- PROJECTS (cuaderno virtual) · projects/<student_id>/<project_id>/…
-- Privacidad total entre alumnos.
-- =============================================================================
create policy "projects_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'projects'
    and (
      (storage.foldername(name))[1] = coalesce(public.current_student_id()::text, '-')
      or public.is_admin()
    )
  );

create policy "projects_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'projects'
    and (storage.foldername(name))[1] = coalesce(public.current_student_id()::text, '-')
  );

create policy "projects_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'projects'
    and (storage.foldername(name))[1] = coalesce(public.current_student_id()::text, '-')
  );

create policy "projects_delete_own_or_admin" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'projects'
    and (
      (storage.foldername(name))[1] = coalesce(public.current_student_id()::text, '-')
      or public.is_admin()
    )
  );

create policy "projects_admin_read_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'projects' and public.is_admin())
  with check (bucket_id = 'projects' and public.is_admin());

-- =============================================================================
-- RECEIPTS · receipts/<student_id>/<numero>.pdf
-- El alumno descarga los suyos; la administradora, todos. Los genera el servidor.
-- =============================================================================
create policy "receipts_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and (
      (storage.foldername(name))[1] = coalesce(public.current_student_id()::text, '-')
      or public.is_admin()
    )
  );

create policy "receipts_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());

-- =============================================================================
-- ANNOUNCEMENTS · announcements/<announcement_id>/…
-- Solo pueden abrir los adjuntos los destinatarios de esa novedad.
-- =============================================================================
create policy "announcements_read_recipients" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcements'
    and (
      public.is_admin()
      or exists (
        select 1 from public.announcement_recipients ar
         where ar.student_id = public.current_student_id()
           and ar.announcement_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "announcements_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'announcements' and public.is_admin())
  with check (bucket_id = 'announcements' and public.is_admin());

-- =============================================================================
-- COMMUNICATIONS · communications/<communication_id>/…
-- =============================================================================
create policy "communications_read_recipients" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'communications'
    and (
      public.is_admin()
      or exists (
        select 1 from public.communication_recipients cr
         where cr.student_id = public.current_student_id()
           and cr.communication_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "communications_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'communications' and public.is_admin())
  with check (bucket_id = 'communications' and public.is_admin());

-- =============================================================================
-- WORKSHOPS · workshops/<workshop_id>/…
-- Imagen del taller: la ven todos los usuarios autenticados.
-- =============================================================================
create policy "workshops_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'workshops');

create policy "workshops_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'workshops' and public.is_admin())
  with check (bucket_id = 'workshops' and public.is_admin());
