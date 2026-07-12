/**
 * Genera los íconos de la PWA.
 *
 *   npm run icons
 *
 * El manifest referencia /icons/*.png; sin esos archivos la aplicación no se
 * puede instalar en el celular. Los renderizamos desde un SVG con `sharp` (ya
 * viene con Next.js), así que no hace falta ninguna herramienta de diseño.
 *
 * Es un ícono provisional y digno: un carretel de hilo con aguja, en el color de
 * marca. Cuando la academia suba su isotipo desde Configuración, se reemplaza
 * por el suyo — este es solo el que se ve en la pantalla de inicio del teléfono.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public', 'icons');

const MARCA = '#8c6a5d'; // arcilla suave (por defecto en globals.css)
const FONDO = '#faf8f6'; // el mismo canvas cálido de la app

/**
 * @param {number} size
 * @param {number} padding  proporción de aire alrededor (los íconos "maskable"
 *                          necesitan margen: Android les recorta los bordes).
 */
const svg = (size, padding = 0.14) => {
  const p = size * padding;
  const c = size / 2;
  const r = (size - p * 2) / 2;
  const n = (v) => +(v).toFixed(2); // números cortos, SVG más limpio

  // Aguja en diagonal con su ojo, y el hilo saliendo en una curva suelta.
  // Trazo grueso a propósito: en el ícono de 192 px del celular, el detalle fino
  // desaparece.
  const grosor = size * 0.052;

  const puntaX = n(c - r * 0.42);
  const puntaY = n(c + r * 0.60);
  const ojoX = n(c + r * 0.30);
  const ojoY = n(c - r * 0.42);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${FONDO}"/>
  <circle cx="${n(c)}" cy="${n(c)}" r="${n(r)}" fill="${MARCA}"/>
  <g stroke="${FONDO}" stroke-width="${n(grosor)}" stroke-linecap="round" fill="none">
    <!-- aguja: del ojo a la punta -->
    <path d="M ${ojoX} ${ojoY} L ${puntaX} ${puntaY}"/>
    <!-- ojo de la aguja -->
    <ellipse cx="${n(c + r * 0.36)}" cy="${n(c - r * 0.5)}" rx="${n(r * 0.1)}" ry="${n(r * 0.16)}"
             transform="rotate(35 ${n(c + r * 0.36)} ${n(c - r * 0.5)})"/>
    <!-- hilo: sale del ojo y cae en S -->
    <path d="M ${n(c + r * 0.28)} ${n(c - r * 0.52)}
             C ${n(c - r * 0.12)} ${n(c - r * 0.72)}
               ${n(c - r * 0.62)} ${n(c - r * 0.18)}
               ${n(c - r * 0.2)}  ${n(c + r * 0.02)}
             C ${n(c + r * 0.14)} ${n(c + r * 0.14)}
               ${n(c + r * 0.1)}  ${n(c + r * 0.46)}
               ${n(c - r * 0.28)} ${n(c + r * 0.44)}"
          stroke-width="${n(grosor * 0.78)}"/>
  </g>
</svg>`;
};

await mkdir(DIR, { recursive: true });

const salidas = [
  { archivo: 'icon-192.png', size: 192, padding: 0.1 },
  { archivo: 'icon-512.png', size: 512, padding: 0.1 },
  // Maskable: Android recorta hasta un 20% de los bordes. Más aire.
  { archivo: 'icon-maskable-512.png', size: 512, padding: 0.22 },
  { archivo: 'apple-touch-icon.png', size: 180, padding: 0.08 },
];

for (const { archivo, size, padding } of salidas) {
  const buffer = await sharp(Buffer.from(svg(size, padding))).png().toBuffer();
  await writeFile(join(DIR, archivo), buffer);
  console.log(`  ✓ public/icons/${archivo}  (${size}×${size})`);
}

// Favicon para la pestaña del navegador.
const favicon = await sharp(Buffer.from(svg(48, 0.06))).png().toBuffer();
await writeFile(join(ROOT, 'public', 'favicon.png'), favicon);
console.log('  ✓ public/favicon.png');

console.log('\n✓ Íconos de la PWA generados.\n');
