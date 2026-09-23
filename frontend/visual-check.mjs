// Temporary visual check of the activity editor. Deleted after use.
import { chromium } from '@playwright/test';

const base = 'http://localhost:5173';
const email = 'visual-' + Date.now() + '@example.com';
const password = 'E2ePassword12345';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('console', (message) => { if (message.type() === 'error') console.log('CONSOLE ERROR:', message.text()); });
page.on('pageerror', (error) => console.log('PAGE ERROR:', error.message));

const registration = await context.request.post(base + '/api/auth/register', {
  headers: { Origin: base, 'X-Requested-With': 'Profefacilisimo' },
  data: { email, password },
});
console.log('register:', registration.status());

await page.goto(base + '/login');
await page.getByLabel('Correo electrónico').fill(email);
await page.getByLabel('Contraseña').fill(password);
const loggedIn = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
await page.getByRole('button', { name: 'Iniciar sesión' }).click();
const session = await (await loggedIn).json();

const created = await context.request.post(base + '/api/lessons', {
  headers: { Authorization: 'Bearer ' + session.accessToken },
  data: { title: 'Viajes y pasado', level: 'B1', topic: 'Viajes', objective: 'Practicar el pretérito indefinido' },
});
const lesson = await created.json();
console.log('create lesson:', created.status());

await page.goto(base + '/lessons/' + lesson.id + '/edit');
await page.getByRole('heading', { name: 'Editar clase' }).waitFor();

// Reading activity: text plus two questions.
await page.getByLabel('Tipo de la nueva actividad').selectOption('Reading');
await page.getByRole('button', { name: 'Agregar actividad' }).click();
await page.getByLabel('Título de la actividad').fill('Lectura: un viaje a Sevilla');
await page.getByLabel('Instrucciones', { exact: true }).fill('Lee el texto y responde a las preguntas.');
await page.getByLabel('Texto de lectura').fill('El verano pasado viajé a Sevilla con mi hermana. Visitamos la Giralda y comimos tapas en el barrio de Triana.');
await page.getByLabel('Pregunta 1', { exact: true }).fill('¿Con quién viajó?');
await page.getByRole('button', { name: 'Añadir pregunta' }).click();
await page.getByLabel('Pregunta 2', { exact: true }).fill('¿Qué visitaron?');
await page.getByLabel('Duración (minutos)').fill('15');

// Second activity: vocabulary and grammar, still without a duration.
await page.getByLabel('Tipo de la nueva actividad').selectOption('VocabularyGrammar');
await page.getByRole('button', { name: 'Agregar actividad' }).click();
await page.getByLabel('Título de la actividad').fill('Pretérito indefinido');
await page.getByLabel('Instrucciones', { exact: true }).fill('Completa los ejercicios.');
await page.getByLabel('Explicación').fill('El pretérito indefinido expresa acciones terminadas: viajé, comí, visitamos.');
await page.getByLabel('Ejercicio 1', { exact: true }).fill('Ayer (ir) ___ al cine.');
await page.getByText('Duración incompleta').first().waitFor();
console.log('incomplete total shown: ok');

// Saving with an incomplete duration refuses the whole lesson and marks the activity.
await page.getByRole('button', { name: 'Guardar', exact: true }).click();
await page.getByText('Indica la duración en minutos.').first().waitFor();
console.log('blocked save + marked activity: ok');
await page.screenshot({ path: '../.tools/activity-editor-error.png', fullPage: true });

await page.getByLabel('Duración (minutos)').fill('10');
await page.getByText('25 min').first().waitFor();
console.log('total 25 min: ok');
await page.getByRole('button', { name: 'Subir Pretérito indefinido' }).click();
await page.getByRole('button', { name: 'Subir Pretérito indefinido' }).click();
await page.screenshot({ path: '../.tools/activity-editor-desktop.png', fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log('mobile horizontal overflow px:', overflow);
await page.screenshot({ path: '../.tools/activity-editor-mobile.png', fullPage: true });

await browser.close();
