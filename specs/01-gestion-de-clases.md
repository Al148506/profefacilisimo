# SPEC 01 — Gestión de clases

> **Estado:** Borrador
> **Depende de:** Ninguna especificación previa; requiere la base de fase 1 ya implementada.
> **Fecha:** 2026-09-17
> **Objetivo:** Permitir al profesor gestionar sus clases con búsqueda, edición, duplicación completa y papelera privada.

## 1. Contexto y alcance

La fase 2 se divide en esta especificación y SPEC 02 — Editor de actividades.
Esta entrega incorpora la gestión de clases de extremo a extremo.
SPEC 02 amplía el mismo editor con actividades, tiempos y guardado del conjunto completo.
El resultado conjunto de ambas especificaciones constituye el Class Builder.

La implementación vigente usa .NET 9 y SDK 9.0.318.
La mención a .NET 10 del README es histórica y no autoriza a cambiar de framework.
Se conservan React, TypeScript, Vite, TanStack Query, React Hook Form y Zod.
Se conservan PostgreSQL, EF Core 9, Identity, JWT y JSONB.
Se mantienen Domain, Application, Infrastructure y Api.

**Incluye:**

- Listar únicamente las clases del usuario autenticado.
- Ordenar las clases por última modificación, con 20 elementos por página.
- Buscar por título y filtrar por nivel A2, B1 o B2.
- Crear clases sin actividades.
- Consultar y modificar título, nivel, tema y objetivo.
- Guardar explícitamente y advertir antes de descartar cambios.
- Duplicar la versión persistida de una clase con todas sus actividades.
- Enviar clases a la papelera.
- Restaurar clases o eliminarlas definitivamente con confirmación.
- Detectar modificaciones concurrentes sin sobrescribir datos silenciosamente.
- Mostrar estados vacíos, carga, errores y confirmaciones.
- Probar aislamiento entre usuarios y operaciones con PostgreSQL real.

**Fuera del alcance:**

- Edición, creación o reordenamiento de actividades: SPEC 02.
- Lesson Player, IA, plantillas y biblioteca de actividades.
- Cursos, estudiantes, roles nuevos o clases compartidas.
- Autoguardado, funcionamiento offline o historial de versiones.
- Borrado automático de la papelera y operaciones masivas.
- Refactorizaciones ajenas a estos puntos de integración.

## 2. Reglas funcionales

### 2.1 Listado y filtros

- La ruta inicial autenticada muestra las clases activas del profesor.
- Cada elemento muestra título, nivel, tema, número de actividades y última modificación.
- Las acciones son Editar, Duplicar y Enviar a papelera.
- El orden es UpdatedAt descendente, con Id como desempate estable.
- page empieza en 1 y el tamaño de página es siempre 20.
- El total de resultados corresponde al usuario, estado y filtros aplicados.
- La búsqueda es por coincidencia parcial del título, sin distinguir mayúsculas.
- Se eliminan espacios exteriores del término.
- Los caracteres de patrón de SQL se interpretan literalmente.
- No se añade normalización de acentos ni búsqueda en contenido.
- Un campo vacío no filtra por título.
- Cambiar búsqueda, nivel o vista reinicia la página a 1.
- Los filtros y la página se reflejan en la URL.
- Si una acción vacía la última página, se muestra la anterior válida.
- Se distinguen “Aún no tienes clases” y “No hay resultados para estos filtros”.

### 2.2 Creación y edición de metadatos

- Título, nivel, tema y objetivo son obligatorios.
- Se respetan los límites actuales: título 200, tema 200 y objetivo 2000 caracteres.
- Los textos obligatorios no pueden contener únicamente espacios.
- Los títulos no necesitan ser únicos.
- Los únicos niveles son A2, B1 y B2.
- Una clase puede guardarse sin actividades.
- El propietario se obtiene del claim sub.
- El cliente nunca elige ni cambia UserId.
- CreatedAt y UpdatedAt usan UTC del servidor.
- Crear abre la nueva clase en su ruta de edición después de una respuesta exitosa.
- Un error de validación conserva todos los valores del formulario.
- No existe un campo editable para la duración total.

**Límite entre entregas:** aquí Guardar modifica solo los metadatos.
No reemplaza ni elimina actividades existentes.
La obligatoriedad de completar duraciones antiguas y el guardado de toda la clase entran con SPEC 02.
Esta transición permite que SPEC 01 sea utilizable sin adelantar el editor de actividades.

### 2.3 Duplicación

- Duplicar se ofrece desde el listado de clases activas.
- Se copia exclusivamente la versión guardada.
- No se incluyen cambios locales pendientes en otra pestaña.
- El título es “Título original (copia)”.
- Si es necesario, se recorta el título base para respetar los 200 caracteres.
- La copia tiene nuevo Id, nueva versión y nuevas fechas.
- El propietario es el mismo usuario autenticado.
- Cada actividad obtiene un Id nuevo y referencia a la nueva clase.
- Se conservan tipos, títulos, instrucciones, contenido JSONB, duraciones y orden.
- Cuando exista TransitionAfterMinutes por SPEC 02, también se copia.
- Una copia es independiente: editarla no modifica el original.
- Una clase sin actividades puede duplicarse.
- Una clase de la papelera no puede duplicarse.
- Las duraciones antiguas desconocidas se conservan como desconocidas.
- Duplicar no inventa tiempos ni convierte una duración incompleta en completa.
- La operación es atómica: no queda una copia parcial si falla.
- La pantalla abre el editor de la nueva clase tras recibir su Id.
- Se deshabilita el botón mientras la solicitud está en curso.
- No se reintenta automáticamente una duplicación ante una respuesta de red incierta.

### 2.4 Papelera

- La papelera es privada y está separada del listado activo.
- Ofrece la misma búsqueda, filtro por nivel y paginación.
- Se ordena por DeletedAt descendente, con Id como desempate.
- Enviar a papelera requiere confirmación.
- El borrado lógico conserva la clase y todas sus actividades.
- Las clases archivadas no se editan ni se duplican.
- La papelera permite Restaurar o Eliminar definitivamente.
- Restaurar conserva los Id de la clase y de sus actividades.
- Restaurar actualiza UpdatedAt y la versión.
- El borrado definitivo solo se permite sobre una clase ya en papelera.
- La confirmación muestra el título y advierte que las actividades también se perderán.
- La eliminación definitiva utiliza la cascada existente en PostgreSQL.
- No hay caducidad de 30 días, tarea programada ni limpieza automática.
- Se confirma el resultado solo después de una respuesta exitosa.
- Un fallo de red no hace desaparecer anticipadamente el elemento de la lista.

### 2.5 Concurrencia y cambios pendientes

- Cada clase tiene una versión opaca que cambia con sus modificaciones.
- Editar, enviar a papelera, restaurar y borrar definitivamente requieren la versión leída.
- Duplicar verifica la versión de origen al tomar una instantánea consistente.
- Si otra pestaña guardó antes, la operación no sobrescribe ese cambio.
- El editor conserva el formulario local y muestra un aviso de conflicto.
- No se sustituye automáticamente el contenido del formulario con un refetch.
- “Recargar versión guardada” exige confirmar que se descartarán cambios locales.
- No hay fusión automática ni botón de sobrescritura forzada.
- Si la clase fue archivada o eliminada, se avisa y se impide guardarla.
- Navegar dentro de la aplicación con cambios pendientes exige confirmar descarte.
- Recargar o cerrar la pestaña usa la advertencia nativa cuando el navegador la admite.
- El formulario no se considera guardado hasta recibir éxito de la API.
- El borrador vive en memoria; no se promete recuperación tras cerrar el navegador.
- No se guardan tokens ni contenido de clases en localStorage.

## 3. Modelo de datos y contratos

### 3.1 Persistencia

Se amplía Lesson, sin crear entidades de curso, estudiante o carpeta:

```csharp
public DateTimeOffset? DeletedAt { get; private set; }
public Guid Version { get; private set; }
```

- DeletedAt null significa activa.
- Version es un token de concurrencia de EF Core, no una fecha ni un contador del cliente.
- Los cambios en actividades de SPEC 02 también actualizan Version de su Lesson.
- Las filas existentes reciben una versión inicial válida durante la migración.
- La migración conserva todas las clases, actividades e Id.
- No se modifica el JSONB ni se elimina la columna de duración en esta entrega.
- Añadir un índice compuesto para consultas por UserId, DeletedAt y UpdatedAt.
- Mantener el índice único de orden por actividad y las relaciones actuales.
- Las consultas filtran explícitamente UserId y estado.
- No basta con ocultar botones o proteger rutas React.

La lógica de reglas permanece en Domain.
Los contratos y resultados de casos de uso permanecen en Application.
La persistencia y las transacciones permanecen en Infrastructure.
No se añade MediatR, CQRS ni un repositorio genérico.

### 3.2 DTO y límites de integración

Definir en backend/Application/Lessons/LessonDtos.cs:

- LessonListItemDto: Id, Title, Level, Topic, ActivityCount, UpdatedAt, DeletedAt y Version.
- LessonPageDto: Items, Page, PageSize fijo a 20 y TotalCount.
- LessonDetailsDto: metadatos, fechas, Version y Activities de solo lectura en SPEC 01.
- SaveLessonRequest: Title, Level, Topic y Objective.
- LessonActivityDto: Id, Type, Title, Instructions, Content, Order y EstimatedDuration.

Content conserva los contratos tipados existentes.
El frontend nunca edita JSON arbitrario.
SPEC 02 amplía estos DTO con transición, duración calculada y actividades editables.

Mantener ILessonReader.FindOwnedAsync para no romper consumidores existentes.
Extender el lector con listado y detalle por propietario.
Declarar ILessonService para crear, actualizar, duplicar, archivar, restaurar y eliminar.
Su implementación usa AppDbContext y los métodos de Domain, siguiendo el patrón simple actual.
Los resultados de Application no deben contener IResult ni depender de ASP.NET.

### 3.3 API

Todas las rutas siguientes requieren JWT:

| Método y ruta | Función | Éxito |
| --- | --- | --- |
| GET /api/lessons?page=1&search=&level=&state=active | Listado privado | 200 |
| GET /api/lessons/{id} | Detalle activo | 200 + ETag |
| POST /api/lessons | Crear | 201 + Location + ETag |
| PUT /api/lessons/{id} | Guardar metadatos | 200 + ETag nuevo |
| POST /api/lessons/{id}/duplicate | Copiar versión guardada | 201 + Location + ETag |
| POST /api/lessons/{id}/trash | Enviar a papelera | 204 |
| POST /api/lessons/{id}/restore | Restaurar | 200 + ETag nuevo |
| DELETE /api/lessons/{id} | Eliminar definitivamente de papelera | 204 |

- state admite únicamente active o trash.
- search tiene un máximo de 200 caracteres.
- page menor que 1 y filtros inválidos devuelven 400.
- ETag contiene Version como valor fuerte entre comillas.
- Todas las mutaciones sobre una clase existente exigen If-Match con una versión concreta.
- If-Match ausente devuelve 428; formato inválido devuelve 400.
- Una versión obsoleta devuelve 412 con ProblemDetails.
- Una transición de estado incompatible devuelve 409.
- Sin sesión se devuelve 401.
- Id inexistente o perteneciente a otro usuario devuelve 404.
- No revelar el estado ni la existencia de clases ajenas.
- Errores de campos devuelven ValidationProblemDetails con nombres de campo.
- Ampliar CORS a PUT y DELETE y permitir If-Match.
- Exponer ETag y Location al origen autorizado.
- No ampliar los orígenes permitidos ni alterar el flujo Identity/JWT.
- Los endpoints de clases usan Authorization Bearer, no el refresh token como credencial.
- El cliente puede renovar una vez tras 401; no debe reintentar errores de red ambiguos.

## 4. Archivos previstos

Las rutas nuevas siguientes son la estructura propuesta por este borrador.

**Modificar:**

- backend/Domain/Lesson.cs — metadatos, duplicación, papelera y versión.
- backend/Domain/Activity.cs — copia independiente con nuevo identificador.
- backend/Application/Contracts.cs — extender ILessonReader sin retirar su operación existente.
- backend/Infrastructure/AppDbContext.cs — campos, índice y concurrencia.
- backend/Infrastructure/LessonReader.cs — consultas privadas, filtros y paginación.
- backend/Infrastructure/Migrations/AppDbContextModelSnapshot.cs — modelo generado por EF.
- backend/Api/Program.cs — registro del servicio, endpoints y CORS.
- frontend/src/auth.ts — exponer transporte autenticado con renovación acotada.
- frontend/src/App.tsx — sustituir el placeholder por las rutas de clases.
- frontend/src/main.tsx — router de datos compatible con bloqueo de navegación.
- frontend/src/styles.css — listado, formularios, papelera y avisos.
- frontend/src/App.test.tsx — actualizar expectativas de la pantalla privada.
- tests/Domain.Tests/LessonTests.cs — ampliar comportamiento sin perder pruebas anteriores.
- README.md — reflejar .NET 9 y documentar la entrega al implementarla.

**Crear:**

- backend/Application/Lessons/LessonDtos.cs.
- backend/Application/Lessons/ILessonService.cs.
- backend/Infrastructure/LessonService.cs.
- backend/Api/LessonEndpoints.cs.
- backend/Infrastructure/Migrations/<timestamp>_AddLessonTrashAndVersion.cs y su Designer.
- frontend/src/lessons/lesson-api.ts.
- frontend/src/lessons/lesson-schema.ts.
- frontend/src/lessons/LessonsPage.tsx.
- frontend/src/lessons/LessonEditorPage.tsx.
- frontend/src/lessons/UnsavedChangesGuard.tsx.
- frontend/src/lessons/LessonsPage.test.tsx.
- frontend/src/lessons/LessonEditorPage.test.tsx.
- tests/Integration.Tests/LessonManagementTests.cs.
- frontend/e2e/lessons.spec.ts.

Las rutas de interfaz son /, /lessons/trash, /lessons/new y /lessons/:id/edit.
La página de listado se reutiliza en modo activo y papelera.
No se crea una biblioteca genérica de componentes ni un nuevo sistema de diseño.

## 5. Plan de implementación

Cada paso es una unidad compilable y verificable.
Separar los cambios manuales que excedan aproximadamente 30–50 líneas en subpasos compilables.
Los archivos de migración generados no se dividen manualmente.
No publicar endpoints que solo tengan implementaciones simuladas.

1. Añadir Version y las reglas de edición de metadatos a Lesson, con pruebas unitarias focalizadas.
2. Añadir DeletedAt y las transiciones a papelera/restauración, con pruebas de estado.
3. Añadir copia independiente en Lesson y Activity, con pruebas de identidad y contenido.
4. Configurar campos, índice y token de concurrencia en AppDbContext.
5. Generar AddLessonTrashAndVersion y comprobar actualización de una base con datos previos.
6. Definir DTO de listado, detalle y guardado, conservando contratos existentes.
7. Implementar listado privado paginado en LessonReader y probar filtros con dos usuarios.
8. Exponer GET de listado y actualizar CORS únicamente para los métodos y cabeceras previstos.
9. Implementar detalle privado y exponerlo con ETag.
10. Implementar creación y registrar POST solo cuando el caso de uso y su prueba estén completos.
11. Implementar actualización de metadatos con If-Match y rechazo de conflictos.
12. Implementar copia transaccional del conjunto y su endpoint.
13. Implementar envío a papelera con versión y autorización.
14. Implementar restauración con versión y autorización.
15. Implementar borrado definitivo limitado a la papelera.
16. Añadir el transporte autenticado para clases, sin cambiar cómo se almacenan los tokens.
17. Integrar listado activo con carga, vacío y error.
18. Incorporar búsqueda, nivel y paginación sincronizados con URL.
19. Añadir formulario de creación con validaciones y navegación al resultado.
20. Conectar edición de metadatos con carga de detalle, ETag y confirmación de guardado.
21. Incorporar bloqueo de navegación y presentación del conflicto sin perder el formulario.
22. Conectar duplicación y apertura de la copia.
23. Conectar papelera, restauración y confirmaciones de eliminación.
24. Actualizar la documentación de uso de esta entrega y sus limitaciones respecto a SPEC 02.

Cada operación incorpora su prueba de dominio, integración o componente en su mismo paso.
Extender el E2E de gestión a medida que se conecten acciones.
El último paso no sustituye los criterios de aceptación.

## 6. Criterios de aceptación

- [ ] Un usuario sin JWT no puede acceder a ningún endpoint de clases.
- [ ] Un profesor no puede listar, leer, modificar, copiar, restaurar ni borrar clases ajenas.
- [ ] Con 21 coincidencias se muestran 20 en la primera página y una en la segunda.
- [ ] Búsqueda y filtro de nivel se combinan y afectan al conteo.
- [ ] El orden de resultados es estable para clases con la misma fecha.
- [ ] Cambiar un filtro reinicia la página; volver con el navegador restaura los parámetros.
- [ ] Crear con título, nivel, tema y objetivo válidos funciona sin actividades.
- [ ] Un campo obligatorio vacío o un nivel distinto de A2/B1/B2 se rechaza en cliente y servidor.
- [ ] Guardar metadatos no borra ni cambia actividades existentes.
- [ ] Duplicar conserva contenido, duraciones y orden, pero genera Id nuevos.
- [ ] Modificar la copia no altera la clase original.
- [ ] Un fallo durante la copia no deja una clase parcialmente duplicada.
- [ ] Archivar retira del listado activo sin borrar actividades.
- [ ] Restaurar conserva todos los Id y datos.
- [ ] Eliminar definitivamente exige clase en papelera, propiedad y confirmación de interfaz.
- [ ] La papelera no se vacía automáticamente por antigüedad.
- [ ] Dos actualizaciones con la misma versión no sobrescriben ambas: solo una tiene éxito.
- [ ] Un conflicto o error de red conserva el formulario local.
- [ ] Una clase archivada desde otra pestaña no se puede guardar como activa.
- [ ] Salir del editor con cambios pendientes requiere confirmar descarte.
- [ ] Cancelar una confirmación no cambia el servidor.
- [ ] Las operaciones deshabilitan su botón durante el envío.
- [ ] La migración conserva datos anteriores y asigna versiones válidas.
- [ ] Registro, login, renovación y logout existentes siguen funcionando.

**Comprobaciones ejecutables al implementar:**

- dotnet restore y dotnet build desde la raíz, con SDK 9.0.318.
- ./scripts/Test.ps1 con PostgreSQL real y bases aisladas.
- ./scripts/Test-E2E.ps1 con flujos de gestión añadidos.
- Revisión manual de lista, filtros y papelera con teclado y pantalla estrecha.

Estas comprobaciones son requisitos futuros; no se han ejecutado durante la redacción.

## 7. Decisiones tomadas y descartadas

**Confirmadas por el usuario:**

- Dos especificaciones para separar gestión y edición de actividades.
- Búsqueda por título, filtro por nivel y 20 clases por página.
- Papelera sin eliminación automática, en lugar de borrar directamente.
- Copia completa guardada y apertura de la copia, sin pedir título antes.
- Guardado explícito y advertencia de cambios pendientes.
- Detectar conflictos en lugar de aceptar silenciosamente el último guardado.

**Diseño técnico propuesto para revisión en este borrador:**

- ETag/If-Match y token Version para hacer verificable la concurrencia.
- Borrado lógico con DeletedAt, sin tabla ni servicio separado de papelera.
- DTO y servicio de lecciones específicos, sin repositorios genéricos.
- Extensión del cliente autenticado existente, sin segunda estrategia de sesión.
- Mantener los contratos de actividades hasta su ampliación en SPEC 02.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Acceso a clases ajenas mediante Id | Predicado por propietario en todas las lecturas y escrituras, también papelera |
| Refetch que borra cambios locales | No rehidratar formularios sucios; conflicto explícito |
| Duplicado parcial o mezclado con un guardado simultáneo | Copia de una instantánea consistente dentro de una transacción |
| Repetición de POST tras respuesta perdida | No reintentar automáticamente; permitir comprobar listado |
| Confusión entre papelera y borrado definitivo | Acciones separadas y confirmación con título |
| Acumulación de clases en papelera | Eliminación manual explícita; sin caducidad no autorizada |
| La fase 1 usa BrowserRouter sin bloqueo de navegación | Migración mínima a router de datos, conservando rutas y autenticación |
| Guía antigua menciona .NET 10 | La implementación mantiene .NET 9 y corrige la referencia al documentar |

## 9. Qué NO se hará en esta especificación

No se implementan formularios ni ordenamiento de actividades.
No se implementan player, IA, publicación, exportación ni colaboración en tiempo real.
No se añade una papelera de actividades independiente.
No se añade historial, autoguardado o recuperación offline.
No se cambia el framework, la arquitectura ni el mecanismo de autenticación.
