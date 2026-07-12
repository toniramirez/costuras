-- =============================================================================
-- Costura AP · Migración 0020 · Los adjuntos solo se ven si están PUBLICADOS
-- -----------------------------------------------------------------------------
-- Las políticas de Storage de `communications` y `announcements` autorizaban la
-- carpeta <id>/ con solo mirar si el alumno figuraba en *_recipients. Nunca
-- miraban el ESTADO del comunicado o la novedad.
--
-- La RLS de las tablas sí lo hace (`status = 'publicada'`), así que un alumno no
-- puede leer un borrador… pero SÍ habría podido descargarse sus ARCHIVOS si el
-- borrador llegaba a tener destinatarios cargados. Una fuga silenciosa: el
-- comunicado todavía no se mandó y el adjunto ya está afuera.
--
-- Hoy no ocurre porque la aplicación expande los destinatarios recién al enviar,
-- pero apoyar la seguridad en una convención del código es exactamente lo que no
-- queremos: la barrera va en la base.
-- =============================================================================

drop policy if exists "communications_read_recipients" on storage.objects;

create policy "communications_read_recipients" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'communications'
    and (
      public.is_admin()
      or exists (
        select 1
          from public.communication_recipients cr
          join public.communications c on c.id = cr.communication_id
         where cr.student_id = public.current_student_id()
           and cr.communication_id::text = (storage.foldername(name))[1]
           and c.status = 'publicada'          -- ← la barrera que faltaba
      )
    )
  );

drop policy if exists "announcements_read_recipients" on storage.objects;

create policy "announcements_read_recipients" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcements'
    and (
      public.is_admin()
      or exists (
        select 1
          from public.announcement_recipients ar
          join public.announcements a on a.id = ar.announcement_id
         where ar.student_id = public.current_student_id()
           and ar.announcement_id::text = (storage.foldername(name))[1]
           and a.status = 'publicada'
           and (a.published_at is null or a.published_at <= now())
      )
    )
  );
