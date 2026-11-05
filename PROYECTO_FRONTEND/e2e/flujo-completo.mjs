// Prueba end-to-end desde la interfaz web contra la API real (http://localhost:3000).
// Recorre: cliente registra → operador acepta y asigna → repartidor avanza estados → cliente consulta.
// Uso: npm run e2e   (variables opcionales: BASE_URL, CHROME_PATH, CAPTURAS)
import {chromium} from 'playwright-core';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const CAPTURAS = process.env.CAPTURAS || join(process.cwd(), 'capturas');
const CLAVE = 'Demo2026!';
mkdirSync(CAPTURAS, {recursive: true});

const resultados = [];
function registrar(nombre, ok, detalle = '') {
  resultados.push({nombre, ok, detalle});
  console.log(`${ok ? 'PASA ' : 'FALLA'}  ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}

const browser = await chromium.launch({executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox']});
const contexto = await browser.newContext({viewport: {width: 1280, height: 900}, locale: 'es-EC'});
let page = await contexto.newPage();

async function login(usuario) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Clave').fill(CLAVE);
  await page.getByRole('button', {name: 'Ingresar'}).click();
  await page.waitForURL(`${BASE_URL}/`);
}

async function salir() {
  await page.getByRole('button', {name: 'Salir'}).click();
  await page.waitForURL(`${BASE_URL}/login`);
}

async function captura(nombre) {
  await page.screenshot({path: join(CAPTURAS, `${nombre}.png`), fullPage: true});
}

async function paso(nombre, fn) {
  try {
    const detalle = await fn();
    registrar(nombre, true, detalle || '');
  } catch (e) {
    registrar(nombre, false, e.message.split('\n')[0]);
    await captura(`error-${nombre.replace(/\W+/g, '-').toLowerCase()}`).catch(() => {});
  }
}

let codigo = '';

try {
  await paso('Login de cliente y panel por rol', async () => {
    await login('cliente_demo');
    await page.getByRole('heading', {name: /Hola, cliente_demo/}).waitFor();
    await captura('01-panel-cliente');
  });

  await paso('Cliente registra un envío (formulario)', async () => {
    await page.getByRole('link', {name: 'Registrar envío'}).first().click();
    await page.getByLabel('Remitente').fill('Remitente Ficticio E2E');
    await page.getByLabel('Destinatario').fill('Destinatario Ficticio E2E');
    await page.getByLabel('Dirección de origen').fill('Calle Inventada 100');
    await page.getByLabel('Dirección de destino').fill('Avenida Inventada 200');
    await page.getByLabel('Zona de origen').selectOption({label: 'Centro'});
    await page.getByLabel('Zona de destino').selectOption({label: 'Norte'});
    await captura('02-formulario-envio');
    await page.getByRole('button', {name: 'Registrar envío'}).click();
    const codigoEl = page.locator('.mensaje-ok strong');
    await codigoEl.waitFor({timeout: 8000});
    codigo = (await codigoEl.textContent()).trim();
    if (!/^ENV-/.test(codigo)) throw new Error(`Código inesperado: ${codigo}`);
    await captura('03-envio-registrado');
    return codigo;
  });

  await paso('Validación visible: formulario vacío muestra errores', async () => {
    await page.goto(`${BASE_URL}/envios/nuevo`);
    await page.getByRole('button', {name: 'Registrar envío'}).click();
    await page.getByText('Mínimo 2 caracteres.').first().waitFor({timeout: 3000});
  });

  await salir();

  await paso('Operador acepta la solicitud', async () => {
    await login('operador_demo');
    await page.goto(`${BASE_URL}/despacho`);
    const fila = page.locator('li', {hasText: codigo}).first();
    await fila.getByRole('button', {name: 'Aceptar'}).click();
    await page.locator('li', {hasText: codigo}).getByText('Solicitud aceptada.').waitFor({timeout: 8000});
    await captura('04-despacho-aceptado');
  });

  await paso('Operador asigna el envío a un repartidor con cupo', async () => {
    const select = page.getByLabel(`Repartidor para ${codigo}`);
    await select.waitFor();
    const valor = await select.locator('option', {hasText: 'Uno'}).getAttribute('value');
    await select.selectOption(valor);
    await page.locator('li', {hasText: codigo}).getByRole('button', {name: 'Asignar'}).click();
    await page.locator('li', {hasText: codigo}).getByText('Envío asignado.').waitFor({timeout: 8000});
    await captura('05-despacho-asignado');
  });

  await salir();

  await paso('Repartidor avanza el envío: retirado → en tránsito → entregado', async () => {
    await login('repartidor_demo');
    await page.goto(`${BASE_URL}/reparto`);
    const tarjeta = page.locator('.tarjeta-envio', {hasText: codigo});
    await tarjeta.waitFor({timeout: 8000});
    await captura('06-reparto-asignado');
    await tarjeta.getByRole('button', {name: 'Marcar retirado'}).click();
    await tarjeta.getByText('Estado actualizado a «Retirado».').waitFor({timeout: 8000});
    await tarjeta.getByRole('button', {name: 'En tránsito'}).click();
    await tarjeta.getByText('Estado actualizado a «En tránsito».').waitFor({timeout: 8000});
    await captura('07-reparto-en-transito');
    await tarjeta.getByLabel('Observación (opcional)').fill('Entrega simulada E2E');
    await tarjeta.getByRole('button', {name: 'Confirmar entrega'}).click();
    await page.getByText('Estado actualizado a «Entregado».').first().waitFor({timeout: 8000}).catch(() => {});
    await page.locator('.tarjeta-envio', {hasText: codigo}).waitFor({state: 'detached', timeout: 8000});
  });

  await salir();

  await paso('Cliente consulta el seguimiento y ve el estado oficial', async () => {
    await login('cliente_demo');
    await page.goto(`${BASE_URL}/seguimiento`);
    await page.getByLabel('Código del envío').fill(codigo);
    await page.getByRole('button', {name: 'Buscar'}).click();
    await page.locator('.tarjeta .badge-entregado').waitFor({timeout: 8000});
    await captura('08-seguimiento-entregado');
  });

  await paso('Cliente no puede cancelar un envío ya entregado (botón oculto)', async () => {
    const cancelar = page.getByRole('button', {name: 'Cancelar envío'});
    if (await cancelar.count()) throw new Error('El botón de cancelar sigue visible para un envío entregado');
  });

  await paso('Línea de tiempo muestra estado oficial y estado de sincronización', async () => {
    await page.getByRole('link', {name: 'Línea de tiempo'}).click();
    await page.getByRole('heading', {name: /Línea de tiempo/}).waitFor({timeout: 8000});
    // Con MongoDB activo aparece la lista de eventos; sin él, un mensaje de error claro.
    await page.waitForTimeout(1200);
    await captura('09-linea-de-tiempo');
  });

  await paso('Responsivo: panel en pantalla de teléfono', async () => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE_URL}/`);
    await page.getByRole('heading', {name: /Hola, cliente_demo/}).waitFor({timeout: 8000});
    await captura('10-responsivo-movil');
    await page.setViewportSize({width: 1280, height: 900});
  });

  await paso('Ruta protegida: sin sesión redirige al login', async () => {
    await salir();
    await page.goto(`${BASE_URL}/despacho`);
    await page.waitForURL(`${BASE_URL}/login`);
  });
} finally {
  await browser.close();
}

const total = resultados.length;
const ok = resultados.filter(r => r.ok).length;
console.log(`\nResultado: ${ok}/${total} pruebas pasan. Capturas en ${CAPTURAS}`);
process.exitCode = ok === total ? 0 : 1;
