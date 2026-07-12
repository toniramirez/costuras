import { getBranding } from '@/lib/settings';

/**
 * Inyecta los colores configurados por la academia como variables CSS.
 * Sobrescriben los valores por defecto de globals.css sin recompilar nada.
 *
 * Los colores vienen de la base, así que se validan: solo se acepta un hex.
 * Cualquier otra cosa se descarta (defensa contra inyección de CSS).
 */
const HEX = /^#[0-9a-fA-F]{3,8}$/;

function colorSeguro(valor: string | null | undefined, porDefecto: string): string {
  return valor && HEX.test(valor) ? valor : porDefecto;
}

export async function BrandColors() {
  const marca = await getBranding();

  const css = `:root{--brand-primary:${colorSeguro(marca.primaryColor, '#8c6a5d')};--brand-secondary:${colorSeguro(
    marca.secondaryColor,
    '#3f3a36',
  )};--brand-accent:${colorSeguro(marca.accentColor, '#c9a227')};}`;

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
