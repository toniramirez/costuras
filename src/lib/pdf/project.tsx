/* El <Image> de @react-pdf no es un <img> del navegador: dibuja en un PDF, que
   no tiene texto alternativo. La regla de accesibilidad no aplica acá. */
/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

import { formatDate, todayISO } from '@/lib/format';
import { DIFICULTAD_PROYECTO, ESTADO_PROYECTO } from '@/lib/labels';
import type { Archivo, Entrada, ProyectoConAlumno } from '@/lib/services/projects';

/**
 * Resumen del proyecto en PDF: la portada, la ficha y el paso a paso con fotos.
 *
 * Este archivo SOLO arma el documento. Bajar las imágenes del bucket privado es
 * trabajo de la ruta (`/api/proyectos/[id]/pdf`), que nos pasa los bytes ya
 * resueltos. Así el componente no hace entrada/salida y se puede leer de un
 * saque.
 *
 * Las fotos que no se pudieron incluir NO desaparecen en silencio: van listadas
 * al final, con el motivo. Que a alguien le falte una foto en su cuaderno y no
 * sepa por qué es peor que el propio faltante.
 *
 * El paso a paso va de lo más viejo a lo más nuevo (al revés que en pantalla):
 * impreso se lee como un instructivo, de la primera puntada a la última.
 */

/** Una imagen ya descargada, lista para incrustar. */
export type ImagenPdf = {
  fileId: string;
  data: Buffer;
  /** @react-pdf solo entiende PNG y JPEG. */
  format: 'png' | 'jpg';
};

/** Un archivo que quedó afuera, con el motivo (se imprime). */
export type Omitido = {
  nombre: string;
  motivo: string;
};

export type DatosPdf = {
  proyecto: ProyectoConAlumno;
  entradas: Entrada[];
  archivos: Archivo[];
  imagenes: ImagenPdf[];
  omitidos: Omitido[];
  portada: ImagenPdf | null;
  /**
   * Qué decir cuando no hay imagen de portada. Si el proyecto tiene una pero no
   * se pudo incrustar, hay que decirlo: escribir «no tiene portada» sería
   * mentir sobre el trabajo de alguien.
   */
  avisoPortada?: string;
  academia: string;
};

const COLOR = {
  ink: '#2B2522',
  muted: '#7A716B',
  line: '#E9E3DD',
  brand: '#8C6A5D',
  danger: '#B0261E',
  canvas: '#FAF8F6',
};

const s = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 52,
    paddingHorizontal: 44,
    fontSize: 10,
    color: COLOR.ink,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
  },

  // Portada
  marca: { fontSize: 9, color: COLOR.brand, letterSpacing: 1.5, textTransform: 'uppercase' },
  titulo: { fontSize: 26, marginTop: 10, fontFamily: 'Helvetica-Bold', color: COLOR.ink },
  alumno: { fontSize: 12, color: COLOR.muted, marginTop: 4 },
  portada: {
    marginTop: 18,
    width: '100%',
    height: 260,
    objectFit: 'cover',
    borderRadius: 6,
  },
  sinPortada: {
    marginTop: 18,
    width: '100%',
    height: 90,
    backgroundColor: COLOR.canvas,
    border: `1 solid ${COLOR.line}`,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Ficha
  ficha: { marginTop: 20, borderTop: `1 solid ${COLOR.line}`, paddingTop: 14 },
  fila: { flexDirection: 'row', marginBottom: 7 },
  etiqueta: {
    width: 110,
    fontSize: 8,
    color: COLOR.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingTop: 1,
  },
  valor: { flex: 1, fontSize: 10 },

  // Secciones
  seccion: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 24, marginBottom: 10 },
  bloque: { marginBottom: 8 },
  subtitulo: {
    fontSize: 8,
    color: COLOR.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },

  // Avances
  avance: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottom: `1 solid ${COLOR.line}`,
  },
  fecha: { fontSize: 8, color: COLOR.brand, textTransform: 'uppercase', letterSpacing: 0.6 },
  tituloAvance: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 2, marginBottom: 5 },
  pasoAPaso: {
    backgroundColor: COLOR.canvas,
    padding: 8,
    borderRadius: 4,
    marginTop: 6,
  },

  // Fotos
  fotos: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 6 },
  foto: { width: 150, height: 150, objectFit: 'cover', borderRadius: 4 },

  // Avisos
  aviso: {
    marginTop: 14,
    padding: 10,
    backgroundColor: '#FBECEB',
    borderRadius: 4,
  },
  avisoTitulo: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLOR.danger },
  avisoItem: { fontSize: 9, color: COLOR.ink, marginTop: 3 },

  enlace: { fontSize: 9, color: COLOR.brand, marginTop: 2 },
  vacio: { fontSize: 10, color: COLOR.muted, fontStyle: 'italic' },

  pie: {
    position: 'absolute',
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLOR.muted,
    borderTop: `1 solid ${COLOR.line}`,
    paddingTop: 8,
  },
});

const ETIQUETA_TIPO: Record<Archivo['kind'], string> = {
  imagen: 'foto',
  video: 'video',
  documento: 'documento',
  molde: 'molde',
  otro: 'archivo',
};

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <View style={s.fila}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <Text style={s.valor}>{valor}</Text>
    </View>
  );
}

function Parrafo({ titulo, texto }: { titulo: string; texto: string | null | undefined }) {
  if (!texto) return null;
  return (
    <View style={s.bloque}>
      <Text style={s.subtitulo}>{titulo}</Text>
      <Text>{texto}</Text>
    </View>
  );
}

export function ProjectPdf({
  proyecto,
  entradas,
  archivos,
  imagenes,
  omitidos,
  portada,
  avisoPortada,
  academia,
}: DatosPdf) {
  const alumno = proyecto.students
    ? `${proyecto.students.first_name} ${proyecto.students.last_name}`
    : 'Alumno';

  // Impreso, el paso a paso se lee hacia adelante: de la primera puntada a la
  // última (en pantalla es al revés, porque ahí interesa lo último que se hizo).
  const cronologicas = [...entradas].sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  const imagenesDe = (entradaId: string | null) => {
    const ids = new Set(
      archivos.filter((a) => a.entry_id === entradaId && a.kind === 'imagen').map((a) => a.id),
    );
    return imagenes.filter((i) => ids.has(i.fileId));
  };

  const enlaces = archivos.filter((a) => a.external_url);
  // Lo que un PDF no puede llevar adentro (videos, moldes, documentos): lo
  // nombramos igual, para que el cuaderno impreso diga qué más existe.
  const otros = archivos.filter((a) => a.storage_path && a.kind !== 'imagen');
  // todayISO() y no new Date().toISOString(): a la noche en Córdoba, el UTC ya
  // es el día siguiente y el PDF saldría fechado mañana.
  const generado = formatDate(todayISO());

  return (
    <Document
      title={`${proyecto.title} — ${alumno}`}
      author={academia}
      subject="Cuaderno de costura"
      language="es-AR"
    >
      <Page size="A4" style={s.page}>
        {/* ── Portada ───────────────────────────────────────────────────── */}
        <Text style={s.marca}>{academia}</Text>
        <Text style={s.titulo}>{proyecto.title}</Text>
        <Text style={s.alumno}>{alumno}</Text>

        {portada ? (
          <Image style={s.portada} src={{ data: portada.data, format: portada.format }} />
        ) : (
          <View style={s.sinPortada}>
            <Text style={s.vacio}>
              {avisoPortada ?? 'Este proyecto no tiene foto de portada.'}
            </Text>
          </View>
        )}

        {/* ── Ficha ─────────────────────────────────────────────────────── */}
        <View style={s.ficha}>
          <Dato etiqueta="Estado" valor={ESTADO_PROYECTO[proyecto.status].label} />
          <Dato etiqueta="Dificultad" valor={DIFICULTAD_PROYECTO[proyecto.difficulty].label} />
          <Dato etiqueta="Tipo de prenda" valor={proyecto.garment_type} />
          <Dato etiqueta="Tipo de tela" valor={proyecto.fabric_type} />
          <Dato
            etiqueta="Inicio"
            valor={proyecto.start_date ? formatDate(proyecto.start_date) : null}
          />
          <Dato etiqueta="Fin" valor={proyecto.end_date ? formatDate(proyecto.end_date) : null} />
        </View>

        <View style={{ marginTop: 8 }}>
          <Parrafo titulo="Descripción" texto={proyecto.description} />
          <Parrafo titulo="Medidas" texto={proyecto.measurements} />
          <Parrafo titulo="Materiales" texto={proyecto.materials} />
          <Parrafo titulo="Observaciones" texto={proyecto.notes} />
        </View>

        {/* Fotos y moldes que no cuelgan de ningún avance */}
        {imagenesDe(null).length > 0 && (
          <>
            <Text style={s.seccion}>Fotos del proyecto</Text>
            <View style={s.fotos}>
              {imagenesDe(null).map((img) => (
                <Image
                  key={img.fileId}
                  style={s.foto}
                  src={{ data: img.data, format: img.format }}
                />
              ))}
            </View>
          </>
        )}

        <View style={s.pie} fixed>
          <Text>
            {academia} · {proyecto.title}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`}
          />
        </View>
      </Page>

      {/* ── Paso a paso ─────────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <Text style={s.seccion}>Paso a paso</Text>

        {cronologicas.length === 0 ? (
          <Text style={s.vacio}>Este proyecto todavía no tiene avances cargados.</Text>
        ) : (
          cronologicas.map((entrada) => {
            const fotos = imagenesDe(entrada.id);

            return (
              <View key={entrada.id} style={s.avance} wrap={false}>
                <Text style={s.fecha}>
                  {formatDate(entrada.entry_date)}
                  {entrada.is_draft ? ' · Borrador' : ''}
                </Text>

                {entrada.title && <Text style={s.tituloAvance}>{entrada.title}</Text>}
                {entrada.body && <Text>{entrada.body}</Text>}

                {entrada.step_notes && (
                  <View style={s.pasoAPaso}>
                    <Text style={s.subtitulo}>Anotaciones</Text>
                    <Text>{entrada.step_notes}</Text>
                  </View>
                )}

                {entrada.materials_used && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={s.subtitulo}>Materiales usados</Text>
                    <Text>{entrada.materials_used}</Text>
                  </View>
                )}

                {entrada.measurements && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={s.subtitulo}>Medidas</Text>
                    <Text>{entrada.measurements}</Text>
                  </View>
                )}

                {fotos.length > 0 && (
                  <View style={s.fotos}>
                    {fotos.map((img) => (
                      <Image
                        key={img.fileId}
                        style={s.foto}
                        src={{ data: img.data, format: img.format }}
                      />
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* ── Enlaces externos ──────────────────────────────────────────── */}
        {enlaces.length > 0 && (
          <>
            <Text style={s.seccion}>Videos y enlaces</Text>
            {enlaces.map((a) => (
              <View key={a.id} style={{ marginBottom: 4 }}>
                <Text>{a.file_name || 'Video'}</Text>
                <Text style={s.enlace}>{a.external_url}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── Otros archivos (moldes, documentos, videos) ───────────────── */}
        {otros.length > 0 && (
          <>
            <Text style={s.seccion}>Otros archivos del proyecto</Text>
            {otros.map((a) => (
              <Text key={a.id} style={s.avisoItem}>
                • {a.file_name || 'Archivo'} ({ETIQUETA_TIPO[a.kind]})
              </Text>
            ))}
            <Text style={[s.avisoItem, { marginTop: 6, color: COLOR.muted }]}>
              Un PDF no puede contener videos ni moldes: se descargan con el botón «Descargar
              archivos (ZIP)».
            </Text>
          </>
        )}

        {/* ── Lo que no se pudo incluir ─────────────────────────────────── */}
        {omitidos.length > 0 && (
          <View style={s.aviso}>
            <Text style={s.avisoTitulo}>
              Archivos que no pudimos incluir en este PDF ({omitidos.length})
            </Text>
            {omitidos.map((o, i) => (
              <Text key={`${o.nombre}-${i}`} style={s.avisoItem}>
                • {o.nombre} — {o.motivo}
              </Text>
            ))}
            <Text style={[s.avisoItem, { marginTop: 6, color: COLOR.muted }]}>
              Los archivos siguen guardados en el proyecto: se pueden descargar completos con el
              botón «Descargar archivos (ZIP)».
            </Text>
          </View>
        )}

        <View style={s.pie} fixed>
          <Text>Generado el {generado}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/**
 * Renderiza el documento a bytes.
 *
 * Vive acá (y no en la ruta) para que el JSX no se escape de un .tsx: la ruta
 * queda como un .ts que solo se ocupa de permisos y de bajar los archivos.
 * Solo corre en Node (`runtime = 'nodejs'` en la ruta).
 */
export function renderProjectPdf(datos: DatosPdf): Promise<Buffer> {
  return renderToBuffer(<ProjectPdf {...datos} />);
}
