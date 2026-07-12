import type { ReactElement } from 'react';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from '@react-pdf/renderer';

import { formatMoney } from '@/lib/format';

/**
 * Recibo interno en PDF.
 *
 * NO es una factura y el papel lo dice: la academia emite un comprobante propio,
 * con numeración correlativa (la lleva la base, `next_receipt_number`).
 *
 * Los datos de la academia salen del `academy_snapshot` que se congela al emitir
 * el recibo: si mañana cambia el teléfono, un recibo viejo tiene que seguir
 * mostrando el teléfono de aquel día. Un recibo se reimprime, no se rehace.
 */

export type DatosAcademia = {
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  pie: string | null;
  leyenda: string;
};

export type DatosRecibo = {
  /** Ya formateado y correlativo: "R-00000123". */
  numero: string;
  /** Ya formateado: "11/07/2026". */
  fecha: string;
  alumno: string;
  concepto: string;
  periodo: string | null;
  importeCents: number;
  medioPago: string | null;
  /** Número de operación / referencia de la transferencia. */
  operacion: string | null;
  academia: DatosAcademia;
  /** Data URI del logo (png o jpg). */
  logo: string | null;
};

/**
 * Intl mete un espacio duro entre el símbolo y el número ("$ 30.000,00").
 * Las fuentes estándar del PDF lo soportan, pero un espacio normal es más seguro
 * y se ve igual.
 */
const moneda = (cents: number) => formatMoney(cents).replace(/\u00a0/g, ' ');

const TINTA = '#2b2522';
const SUAVE = '#7a716b';
const LINEA = '#e3ddd8';

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 44,
    fontSize: 10,
    color: TINTA,
    fontFamily: 'Helvetica',
  },

  encabezado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: LINEA,
    paddingBottom: 16,
  },
  academia: { flexDirection: 'row', alignItems: 'center', maxWidth: 300 },
  logo: { width: 48, height: 48, marginRight: 12, objectFit: 'contain' },
  nombreAcademia: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  datoAcademia: { fontSize: 8.5, color: SUAVE, marginTop: 2 },

  reciboCaja: { alignItems: 'flex-end' },
  reciboTitulo: { fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 2 },
  reciboNumero: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  reciboFecha: { fontSize: 9, color: SUAVE, marginTop: 4 },

  bloque: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: LINEA,
    borderRadius: 6,
    padding: 16,
  },
  fila: { flexDirection: 'row', marginBottom: 8 },
  etiqueta: { width: 110, color: SUAVE, fontSize: 9 },
  valor: { flex: 1, fontSize: 10.5 },

  importeCaja: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#faf7f5',
    borderWidth: 1,
    borderColor: LINEA,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  importeEtiqueta: { fontSize: 10, color: SUAVE, fontFamily: 'Helvetica-Bold' },
  importeValor: { fontSize: 20, fontFamily: 'Helvetica-Bold' },

  firma: {
    marginTop: 56,
    alignSelf: 'flex-end',
    width: 200,
    borderTopWidth: 1,
    borderTopColor: LINEA,
    paddingTop: 6,
    textAlign: 'center',
    fontSize: 8.5,
    color: SUAVE,
  },

  pie: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: LINEA,
    paddingTop: 8,
  },
  pieTexto: { fontSize: 8.5, color: SUAVE, textAlign: 'center' },
  leyenda: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: TINTA,
    textAlign: 'center',
    marginTop: 4,
  },
});

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={s.fila}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <Text style={s.valor}>{valor}</Text>
    </View>
  );
}

export function ReciboPDF({ datos }: { datos: DatosRecibo }) {
  const { academia } = datos;

  return (
    <Document
      title={`Recibo ${datos.numero}`}
      author={academia.nombre}
      subject={datos.concepto}
      creator={academia.nombre}
      producer={academia.nombre}
    >
      <Page size="A4" style={s.page}>
        <View style={s.encabezado}>
          <View style={s.academia}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- el <Image> de react-pdf no acepta alt */}
            {datos.logo && <Image src={datos.logo} style={s.logo} />}
            <View>
              <Text style={s.nombreAcademia}>{academia.nombre}</Text>
              {academia.direccion && <Text style={s.datoAcademia}>{academia.direccion}</Text>}
              {academia.telefono && <Text style={s.datoAcademia}>Tel. {academia.telefono}</Text>}
              {academia.email && <Text style={s.datoAcademia}>{academia.email}</Text>}
            </View>
          </View>

          <View style={s.reciboCaja}>
            <Text style={s.reciboTitulo}>RECIBO</Text>
            <Text style={s.reciboNumero}>{datos.numero}</Text>
            <Text style={s.reciboFecha}>Fecha: {datos.fecha}</Text>
          </View>
        </View>

        <View style={s.bloque}>
          <Dato etiqueta="Recibimos de" valor={datos.alumno} />
          <Dato etiqueta="En concepto de" valor={datos.concepto} />
          {datos.periodo && <Dato etiqueta="Período" valor={datos.periodo} />}
          {datos.medioPago && <Dato etiqueta="Medio de pago" valor={datos.medioPago} />}
          {datos.operacion && <Dato etiqueta="N.º de operación" valor={datos.operacion} />}
        </View>

        <View style={s.importeCaja}>
          <Text style={s.importeEtiqueta}>IMPORTE RECIBIDO</Text>
          <Text style={s.importeValor}>{moneda(datos.importeCents)}</Text>
        </View>

        <Text style={s.firma}>Firma y aclaración</Text>

        <View style={s.pie} fixed>
          {academia.pie && <Text style={s.pieTexto}>{academia.pie}</Text>}
          <Text style={s.leyenda}>{academia.leyenda}</Text>
        </View>
      </Page>
    </Document>
  );
}

/**
 * El elemento listo para `renderToBuffer`.
 * Vive acá para que la ruta de la API pueda seguir siendo un `.ts` sin JSX.
 */
export function documentoRecibo(datos: DatosRecibo): ReactElement<DocumentProps> {
  return <ReciboPDF datos={datos} />;
}
