-- =============================================================================
-- Costura AP · Migración 0022 · Biblioteca de la alumna
--   library_categories · help_contents · glossary_terms · glossary_suggestions
--   digital_patterns
-- -----------------------------------------------------------------------------
-- Tres espacios de consulta que la administradora carga y la alumna SOLO LEE:
--
--   1. Centro de ayuda  — videos, imágenes, PDF y textos, agrupados por categoría.
--   2. Glosario         — un diccionario de costura, una ficha por término.
--   3. Moldería digital — moldes en PDF, con portada opcional.
--
-- La idea de fondo: agregar material nuevo (y categorías nuevas) NO debe requerir
-- tocar el código. Por eso las categorías son FILAS, no un enum: se crean desde
-- el panel. El único enum es el TIPO de contenido, porque cada valor implica una
-- forma distinta de mostrarlo en pantalla (un <video>, una <img>, un visor de PDF
-- o un párrafo) y eso sí vive en el código.
--
-- Escritura: solo la administradora (RLS). La alumna únicamente lee lo publicado
-- y —única excepción— puede SUGERIR una palabra para el glosario. La sugerencia
-- no se publica: queda en una bandeja que solo ve la administradora.
-- =============================================================================

-- =============================================================================
-- Tipos
-- =============================================================================

-- A qué biblioteca pertenece una categoría. Una sola tabla de categorías para
-- los dos espacios: el alta, el orden y el borrado son idénticos, y así hay un
-- solo lugar donde mirar cuando algo no aparece.
do $$ begin
  create type public.library_scope as enum ('ayuda', 'molderia');
exception when duplicate_object then null; end $$;

-- Cómo se muestra una publicación del centro de ayuda.
do $$ begin
  create type public.help_content_kind as enum ('video', 'imagen', 'pdf', 'texto');
exception when duplicate_object then null; end $$;

-- Estado de una sugerencia de término del glosario.
do $$ begin
  create type public.suggestion_status as enum ('pendiente', 'usada', 'descartada');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- CATEGORÍAS
-- =============================================================================
create table if not exists public.library_categories (
  id          uuid primary key default gen_random_uuid(),
  scope       public.library_scope not null,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint library_category_name_ck check (btrim(name) <> '')
);
comment on table public.library_categories is
  'Secciones del centro de ayuda y de la moldería. Se crean desde el panel: agregar una categoría nueva no requiere una migración.';

-- Dos categorías con el mismo nombre en el mismo espacio serían indistinguibles
-- para la alumna. `lower()` evita el "Telas" / "telas".
create unique index if not exists uq_library_category
  on public.library_categories (scope, lower(name));
create index if not exists idx_library_categories_scope
  on public.library_categories (scope, sort_order, name);

create trigger trg_library_categories_updated_at before update on public.library_categories
  for each row execute function public.set_updated_at();

-- =============================================================================
-- CENTRO DE AYUDA
-- -----------------------------------------------------------------------------
-- `storage_path` es NULLABLE a propósito: la ruta del bucket es
-- `library/ayuda/<content_id>/<archivo>` y hasta que la fila no existe no hay
-- id, así que el archivo se sube DESPUÉS de guardar (mismo orden que la imagen
-- de un taller). Una publicación sin archivo ni texto es un borrador a medio
-- cargar: el servicio de la alumna no la muestra.
-- =============================================================================
create table if not exists public.help_contents (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid references public.library_categories (id) on delete set null,
  kind          public.help_content_kind not null default 'texto',
  title         text not null,
  description   text,
  -- Cuerpo del contenido cuando es un texto explicativo.
  body          text,
  -- Archivo propio en el bucket `library`…
  storage_path  text,
  file_name     text,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  -- …o video alojado afuera (YouTube / Drive), para los que no entran en el bucket.
  external_url  text,
  sort_order    int not null default 0,
  is_published  boolean not null default true,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint help_content_title_ck check (btrim(title) <> ''),
  -- Un texto explicativo sin texto no es nada. Esto SÍ se puede exigir al
  -- insertar: el cuerpo viaja en el mismo formulario.
  constraint help_content_body_ck check (kind <> 'texto' or body is not null),

  -- Buscador sin acentos ni mayúsculas. Ver la nota en glossary_terms: se
  -- calcula al escribir para poder indexarlo y para que el resultado no dependa
  -- de cómo escriba la palabra quien busca.
  search_key text generated always as (
    translate(
      lower(title || ' ' || coalesce(description, '') || ' ' || coalesce(body, '')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc')
  ) stored
);
comment on table public.help_contents is
  'Publicación del centro de ayuda: video, imagen, PDF o texto. La alumna solo lee.';
comment on column public.help_contents.storage_path is
  'Ruta en el bucket `library` (ayuda/<id>/<archivo>). Nula hasta que se sube el archivo, que ocurre después del alta.';

create index if not exists idx_help_contents_categoria
  on public.help_contents (category_id, sort_order, created_at desc);
create index if not exists idx_help_contents_publicado
  on public.help_contents (is_published, created_at desc);
create index if not exists idx_help_contents_buscador on public.help_contents (search_key);

create trigger trg_help_contents_updated_at before update on public.help_contents
  for each row execute function public.set_updated_at();

-- =============================================================================
-- GLOSARIO
-- -----------------------------------------------------------------------------
-- Las columnas `sort_key` y `search_key` son GENERADAS: normalizan acentos y
-- mayúsculas de una vez y para siempre.
--
-- Por qué generadas y no resolverlo al consultar: el orden alfabético y el
-- buscador tienen que dar el mismo resultado siempre, y una alumna que escribe
-- "bies" tiene que encontrar «Biés». Calcularlo en cada consulta impediría
-- indexarlo, y hacerlo en la aplicación dejaría el orden a merced de quién
-- pregunte. Acá se calcula una sola vez, al escribir, y se indexa.
-- =============================================================================
create table if not exists public.glossary_terms (
  id           uuid primary key default gen_random_uuid(),
  term         text not null,
  -- Qué es.
  definition   text not null,
  -- Para qué sirve / cuándo se usa.
  usage_notes  text,
  image_path   text,
  video_path   text,
  video_url    text,
  pdf_path     text,
  is_published boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint glossary_term_ck check (btrim(term) <> ''),
  constraint glossary_definition_ck check (btrim(definition) <> ''),

  sort_key text generated always as (
    translate(lower(term),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc')
  ) stored,

  search_key text generated always as (
    translate(
      lower(term || ' ' || definition || ' ' || coalesce(usage_notes, '')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc')
  ) stored
);
comment on table public.glossary_terms is
  'Ficha de un término de costura. El orden alfabético sale de sort_key (sin acentos), no del texto crudo.';

-- «Biés» y «bies» son la misma palabra: no queremos dos fichas.
create unique index if not exists uq_glossary_term on public.glossary_terms (sort_key);
create index if not exists idx_glossary_buscador on public.glossary_terms (search_key);

create trigger trg_glossary_terms_updated_at before update on public.glossary_terms
  for each row execute function public.set_updated_at();

-- Sugerencias de la alumna ----------------------------------------------------
-- NO son términos del glosario: son una bandeja de entrada. Nada de lo que se
-- escribe acá se publica solo.
create table if not exists public.glossary_suggestions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid references public.students (id) on delete set null,
  term        text not null,
  notes       text,
  status      public.suggestion_status not null default 'pendiente',
  -- Si la sugerencia terminó en una ficha, queda el enlace.
  term_id     uuid references public.glossary_terms (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint glossary_suggestion_term_ck check (btrim(term) <> '')
);
comment on table public.glossary_suggestions is
  'Palabra que una alumna pidió que se agregue al glosario. Solo la ve la administradora.';

create index if not exists idx_glossary_suggestions_estado
  on public.glossary_suggestions (status, created_at desc);

create trigger trg_glossary_suggestions_updated_at before update on public.glossary_suggestions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- MOLDERÍA DIGITAL
-- Mismo motivo que en help_contents para el `storage_path` nullable.
-- =============================================================================
create table if not exists public.digital_patterns (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid references public.library_categories (id) on delete set null,
  title            text not null,
  description      text,
  storage_path     text,          -- el PDF del molde
  file_name        text,
  size_bytes       bigint check (size_bytes is null or size_bytes >= 0),
  cover_image_path text,          -- portada opcional
  sort_order       int not null default 0,
  is_published     boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint digital_pattern_title_ck check (btrim(title) <> ''),

  search_key text generated always as (
    translate(
      lower(title || ' ' || coalesce(description, '')),
      'áàäâãéèëêíìïîóòöôõúùüûñç',
      'aaaaaeeeeiiiiooooouuuunc')
  ) stored
);
comment on table public.digital_patterns is
  'Molde digital en PDF. La alumna lo abre y lo descarga; nunca lo modifica.';

create index if not exists idx_digital_patterns_categoria
  on public.digital_patterns (category_id, sort_order, created_at desc);
create index if not exists idx_digital_patterns_publicado
  on public.digital_patterns (is_published, created_at desc);
create index if not exists idx_digital_patterns_buscador on public.digital_patterns (search_key);

create trigger trg_digital_patterns_updated_at before update on public.digital_patterns
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS
-- -----------------------------------------------------------------------------
-- Regla única y repetida: la administradora hace todo; la alumna LEE lo
-- publicado. La sola excepción de escritura es la sugerencia del glosario, y
-- está acotada a insertar una fila a nombre propio.
-- =============================================================================
alter table public.library_categories    enable row level security;
alter table public.help_contents         enable row level security;
alter table public.glossary_terms        enable row level security;
alter table public.glossary_suggestions  enable row level security;
alter table public.digital_patterns      enable row level security;

-- Categorías: las lee cualquier usuario con sesión (son títulos de sección).
create policy "library_categories_read" on public.library_categories
  for select to authenticated using (true);
create policy "library_categories_admin_write" on public.library_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "help_contents_read_published" on public.help_contents
  for select to authenticated
  using (public.is_admin() or is_published);
create policy "help_contents_admin_write" on public.help_contents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "glossary_terms_read_published" on public.glossary_terms
  for select to authenticated
  using (public.is_admin() or is_published);
create policy "glossary_terms_admin_write" on public.glossary_terms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Sugerencias: la alumna ESCRIBE (a su nombre) pero NO LEE.
-- No hay política de select para la alumna a propósito: la bandeja es de la
-- administradora. Que una alumna vea lo que pidió otra no aporta nada y expone
-- conversaciones que no son suyas.
create policy "glossary_suggestions_insert_own" on public.glossary_suggestions
  for insert to authenticated
  with check (student_id = public.current_student_id());
create policy "glossary_suggestions_admin_all" on public.glossary_suggestions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "digital_patterns_read_published" on public.digital_patterns
  for select to authenticated
  using (public.is_admin() or is_published);
create policy "digital_patterns_admin_write" on public.digital_patterns
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- =============================================================================
-- Permisos a nivel tabla (defensa en profundidad, migración 0014)
-- =============================================================================
grant select, insert, update, delete on
  public.library_categories,
  public.help_contents,
  public.glossary_terms,
  public.glossary_suggestions,
  public.digital_patterns
  to authenticated;

grant all on
  public.library_categories,
  public.help_contents,
  public.glossary_terms,
  public.glossary_suggestions,
  public.digital_patterns
  to service_role;

revoke all on
  public.library_categories,
  public.help_contents,
  public.glossary_terms,
  public.glossary_suggestions,
  public.digital_patterns
  from anon;

-- =============================================================================
-- STORAGE · bucket `library`
-- -----------------------------------------------------------------------------
-- Convención de rutas (la política mira las DOS primeras carpetas):
--   library/ayuda/<help_content_id>/<archivo>
--   library/glosario/<glossary_term_id>/<archivo>
--   library/molderia/<digital_pattern_id>/<archivo>
--
-- El bucket es privado y las URLs se firman en el servidor, igual que el resto.
-- La lectura NO se concede por estar autenticado: se concede si la fila dueña
-- del archivo está publicada. Si no, un borrador con el material ya subido
-- sería descargable por cualquiera que adivinara la ruta — el mismo agujero que
-- cerró la migración 0020 para los adjuntos de comunicados.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('library', 'library', false, 104857600,
    array['image/png','image/jpeg','image/webp','image/heic',
          'video/mp4','video/webm','video/quicktime',
          'application/pdf'])
on conflict (id) do nothing;

create policy "library_read_published" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'library'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = 'ayuda'
        and exists (
          select 1 from public.help_contents c
           where c.id::text = (storage.foldername(name))[2]
             and c.is_published
        )
      )
      or (
        (storage.foldername(name))[1] = 'glosario'
        and exists (
          select 1 from public.glossary_terms g
           where g.id::text = (storage.foldername(name))[2]
             and g.is_published
        )
      )
      or (
        (storage.foldername(name))[1] = 'molderia'
        and exists (
          select 1 from public.digital_patterns p
           where p.id::text = (storage.foldername(name))[2]
             and p.is_published
        )
      )
    )
  );

create policy "library_admin_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'library' and public.is_admin())
  with check (bucket_id = 'library' and public.is_admin());

-- =============================================================================
-- Categorías iniciales
-- -----------------------------------------------------------------------------
-- Son un punto de partida para que la primera pantalla no esté vacía, no una
-- lista cerrada: se renombran, se borran y se agregan desde el panel.
-- =============================================================================
insert into public.library_categories (scope, name, description, sort_order) values
  ('ayuda', 'Máquinas y herramientas', 'Cómo usar y cuidar la máquina, agujas, tijeras y demás.', 10),
  ('ayuda', 'Telas',                   'Tipos de tela, cómo reconocerlas y para qué sirve cada una.', 20),
  ('ayuda', 'Moldería',                'Cómo leer, imprimir y usar un molde.', 30),
  ('ayuda', 'Técnicas de costura',     'Puntadas, terminaciones y trucos paso a paso.', 40),
  ('ayuda', 'Dudas frecuentes',        'Lo que más se pregunta en clase.', 50),
  ('molderia', 'Moldes base',          'Los moldes de referencia sobre los que se transforma todo lo demás.', 10),
  ('molderia', 'Prendas',              'Moldes de prendas terminadas, listos para imprimir.', 20)
on conflict do nothing;
