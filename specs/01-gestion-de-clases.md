# SPEC 01 — Gestión de clases · MVP

> **Estado:** Borrador
> **Depende de:** Base de fase 1 implementada; ninguna especificación previa.
> **Fecha:** 2026-09-17
> **Objetivo:** Permitir al profesor crear, encontrar, editar, duplicar y recuperar sus clases mediante un flujo mínimo y privado.

Esta revisión sustituye el alcance anterior de SPEC 01.
La paginación y la concurrencia avanzada se posponen por decisión explícita del usuario.
No se implementa código durante esta revisión.

## 1. Objetivo y base técnica

Validar el flujo:

```text
Login → Mis clases → Crear clase → Editar metadatos → Guardar
      → Duplicar → Enviar a papelera / restaurar
      → posteriormente SPEC 02: editar actividades
```

Se mantienen .NET 9 / SDK 9.0.318, EF Core 9, PostgreSQL, Identity + JWT y JSONB.
El frontend conserva React, TypeScript, Vite, TanStack Query, React Hook Form y Zod.
Se mantienen Domain, Application, Infrastructure y Api.
No se añaden CQRS, MediatR ni repositorios genéricos.

## 2. Alcance

**Incluye:** listado privado, búsqueda por título, filtro por nivel, creación, consulta, edición de metadatos, guardado explícito, duplicación completa y papelera con restauración.
Se incluye borrado definitivo sencillo desde papelera, aprovechando la cascada existente.

**Límite con SPEC 02:** las actividades se pueden leer y copiar como unidades existentes.
No se exponen acciones para crearlas, modificarlas, eliminarlas individualmente ni reordenarlas.
Crear las filas de una copia y eliminarlas por cascada al borrar su clase son las únicas excepciones.
Los controles de actividades y las nuevas reglas de duración pertenecen exclusivamente a SPEC 02.

## 3. Reglas funcionales

### Seguridad obligatoria

- Todas las operaciones requieren JWT; el profesor se obtiene del claim sub validado.
- El cliente nunca envía ni selecciona UserId.
- Cada lectura y modificación verifica el propietario en el servidor, también en papelera y duplicación.
- Una clase ajena devuelve 404, sin revelar su título, contenido o estado.
- Se usan DTO acotados, no entidades enlazadas directamente al JSON.
- Datos fuera del DTO no pueden modificar propietario, fechas, estado ni actividades.
- Las rutas protegidas de React no sustituyen la autorización del backend.

### Listado activo

- Devuelve todas las coincidencias propias, sin paginación.
- Orden: UpdatedAt DESC, con Id como desempate estable.
- Muestra título, nivel y tema, con acciones Editar, Duplicar y Enviar a papelera.
- La búsqueda es parcial por título, sin distinguir mayúsculas y recortando espacios exteriores.
- Los caracteres especiales de patrones SQL se interpretan literalmente.
- Se combina con el nivel A2, B1 o B2; filtros vacíos significan sin restricción.
- No se añade búsqueda en contenido ni normalización especial de acentos.
- Búsqueda y nivel pueden mantenerse como estado local, sin sincronización con URL.

### Crear y editar

| Campo | Validación en frontend y backend |
| --- | --- |
| Title | Obligatorio, máximo 200 caracteres |
| Topic | Obligatorio, máximo 200 caracteres |
| Objective | Obligatorio, máximo 2000 caracteres |
| Level | Obligatorio; A2, B1 o B2 |

Los textos se recortan y no pueden quedar vacíos o contener únicamente espacios.
Los títulos no necesitan ser únicos.
Una Lesson puede existir sin Activities.

Crear genera Id y fechas UTC del servidor y abre el editor de la clase creada.
Guardar modifica solo los cuatro campos y UpdatedAt.
Conserva CreatedAt, UserId, EstimatedDuration y todas las Activities.
No se muestran controles de actividades o duración.

Se acepta **last write wins** sobre metadatos.
No se comparan versiones ni se detectan conflictos entre pestañas.
Esta simplificación no autoriza acceder a clases ajenas ni restaurar desde PUT.

### Duplicación completa

- Copia la clase activa persistida, no cambios locales pendientes.
- Genera nuevo Lesson Id y fechas, con el mismo propietario.
- Usa “Título original (copia)”; recorta el título base si necesita respetar los 200 caracteres.
- Conserva nivel, tema, objetivo y EstimatedDuration de la clase.
- Copia todas las actividades con nuevos Id y el LessonId de la copia.
- Conserva Type, Title, Instructions, Content JSONB, Order y EstimatedDuration.
- Conserva duraciones null existentes sin inventar valores.
- La copia queda activa e independiente y puede no tener actividades.
- La lectura coherente del conjunto y su inserción se realizan en una transacción.
- Un fallo revierte toda la copia, sin filas parciales.
- Tras éxito se abre el editor de la copia.
- No se reintenta automáticamente el POST si su resultado de red es incierto.

### Papelera mínima

DeletedAt null significa activa; DeletedAt distinto de null significa en papelera.

- Enviar a papelera requiere confirmación y conserva Lesson y Activities.
- La papelera lista únicamente clases eliminadas del profesor.
- No tiene buscador, filtros ni paginación propios.
- Orden: DeletedAt DESC, con Id como desempate.
- Restaurar requiere confirmación, limpia DeletedAt y actualiza UpdatedAt.
- Restaurar conserva los Id y todos los datos.
- Las clases en papelera no se editan ni se duplican.
- No hay caducidad, limpieza automática, tareas programadas ni operaciones masivas.

**Borrado definitivo:** AppDbContext ya configura cascada de Lesson a Activities.
Se incluye una operación DELETE directa sobre una clase propia en papelera, sin crear infraestructura adicional.
El endpoint no existe todavía: se especifica su futura implementación sencilla sobre esa cascada.
La interfaz exige confirmación que advierta de la pérdida de la clase y todas sus actividades.

### Guardado, cambios pendientes y fallos

- Guardar es explícito y usa el estado de formulario modificado de React Hook Form.
- La navegación controlada desde el editor pide confirmación antes de descartar cambios.
- beforeunload puede advertir al cerrar o recargar, cuando el navegador lo permita.
- No se exige migrar BrowserRouter ni interceptar todos los mecanismos de navegación.
- No se crea un gestor de borradores ni se guarda contenido en localStorage.
- Los errores de guardado conservan los campos; un refetch no reemplaza un formulario modificado.
- Se muestra éxito o se retiran elementos de la lista únicamente tras respuesta correcta.
- Los botones de acciones se deshabilitan durante su solicitud.

## 4. Modelo de datos

La única ampliación persistente obligatoria es:

```csharp
// Lesson
public DateTimeOffset? DeletedAt { get; private set; }
```

La migración AddLessonSoftDelete deja las clases existentes con DeletedAt = null.
Conserva sus datos, actividades, relaciones, JSONB e índices actuales.
No añade Lesson.Version, tokens de concurrencia ni una tabla de papelera.
No exige nuevos índices para el volumen inicial.
El soft delete no ejecuta la cascada; solo la ejecuta el borrado definitivo.

Domain conserva las reglas y la copia independiente.
Application define contratos específicos de lecciones.
Infrastructure utiliza AppDbContext para consultas, escrituras y transacciones.
Api obtiene el usuario autenticado y transforma los resultados a HTTP.

## 5. DTO necesarios

Definir en backend/Application/Lessons/LessonDtos.cs:

| DTO | Campos |
| --- | --- |
| SaveLessonRequest | Title, Level, Topic, Objective |
| LessonListItemDto | Id, Title, Level, Topic, UpdatedAt, DeletedAt |
| LessonDetailsDto | Id, Title, Level, Topic, Objective, EstimatedDuration, CreatedAt, UpdatedAt, DeletedAt, Activities |
| LessonActivityDto | Id, Type, Title, Instructions, Content, Order, EstimatedDuration |

El listado devuelve un array, sin LessonPageDto, Page, PageSize o TotalCount.
SaveLessonRequest se reutiliza para crear y editar; no incluye UserId, Activities, DeletedAt ni duración.
Las actividades del detalle son de solo lectura y no se reenvían al guardar.
Content conserva su formato existente y nunca se interpreta como HTML ejecutable.

Mantener ILessonReader.FindOwnedAsync y añadir únicamente listado y detalle privados.
Declarar ILessonService para las escrituras de clases, siguiendo el patrón específico actual.
No devolver IResult desde Application ni añadir abstracciones genéricas de persistencia.

## 6. Endpoints

Todos requieren autenticación.

| Método y ruta | Función | Éxito |
| --- | --- | --- |
| GET /api/lessons | Listado activo o papelera | 200 + array |
| GET /api/lessons/{id} | Detalle activo propio | 200 + detalle |
| POST /api/lessons | Crear sin actividades | 201 + detalle y Location |
| PUT /api/lessons/{id} | Guardar metadatos | 200 + detalle |
| POST /api/lessons/{id}/duplicate | Copiar clase activa persistida | 201 + detalle y Location |
| POST /api/lessons/{id}/trash | Enviar a papelera | 204 |
| POST /api/lessons/{id}/restore | Restaurar | 204 |
| DELETE /api/lessons/{id} | Borrar definitivamente desde papelera | 204 |

**Listado:** admite state=active|trash, search y level.
state es active por defecto.
search es opcional y tiene un máximo de 200 caracteres.
level es opcional y admite A2, B1 o B2.
En modo trash se devuelve la lista completa; search y level no se aplican ni se envían desde su interfaz.
No hay parámetros de paginación.

**Errores:**

- 400: validación, estado solicitado o filtros activos incorrectos.
- 401: usuario no autenticado.
- 404: recurso inexistente o ajeno; también clase en papelera consultada para editar o duplicar.
- 409: solamente transición inválida de una clase propia: archivar una eliminada, restaurar una activa o borrar definitivamente una activa.
- Usar ProblemDetails y ValidationProblemDetails.

No usar ETag, If-Match, 412 ni 428.
Mantener los orígenes CORS actuales y permitir PUT y DELETE cuando sea necesario.
Reutilizar Authorization Bearer y la renovación acotada existente.
No introducir infraestructura de concurrencia ni reintentos automáticos de escrituras inciertas.

## 7. Pantallas y estados frontend

| Ruta | Pantalla |
| --- | --- |
| / | Mis clases, búsqueda, nivel y acciones |
| /lessons/new | Crear clase |
| /lessons/:id/edit | Editar metadatos |
| /lessons/trash | Papelera con restauración y borrado definitivo |

Reutilizar las rutas protegidas y la sesión.
Un mismo formulario sirve para creación y edición.
El listado puede reutilizarse en papelera ocultando filtros y acciones no aplicables.
Las claves de TanStack Query incluyen usuario, estado y filtros efectivos.
Tras éxito se invalidan las consultas afectadas, sin actualizaciones optimistas con rollback o versiones.
No se crea una biblioteca de componentes ni otro sistema de diseño.

**Estados:** Loading, Error, Empty, Success y Saving.
Mostrar “Aún no tienes clases.” sin filtros y “No hay clases que coincidan con estos filtros.” cuando corresponde.
La papelera vacía muestra “La papelera está vacía.”.
Los errores ofrecen mensaje y reintento apropiado; Saving deshabilita el botón correspondiente.

## 8. Archivos previstos

Las siguientes modificaciones pertenecen a la futura implementación, no a esta revisión.

| Área | Archivos |
| --- | --- |
| Dominio | Modificar backend/Domain/Lesson.cs y Activity.cs; esta última solo para copia independiente |
| Contratos | Modificar backend/Application/Contracts.cs; crear backend/Application/Lessons/LessonDtos.cs e ILessonService.cs |
| Persistencia | Modificar backend/Infrastructure/AppDbContext.cs y LessonReader.cs; crear LessonService.cs en esa misma carpeta |
| Migración | Crear backend/Infrastructure/Migrations/<timestamp>_AddLessonSoftDelete.cs y Designer; actualizar AppDbContextModelSnapshot.cs |
| API | Modificar backend/Api/Program.cs; crear backend/Api/LessonEndpoints.cs |
| Integración frontend | Modificar frontend/src/auth.ts, App.tsx y styles.css |
| Lecciones frontend | Crear frontend/src/lessons/lesson-api.ts, lesson-schema.ts, LessonsPage.tsx y LessonEditorPage.tsx |
| Pruebas existentes | Adaptar tests/Domain.Tests/LessonTests.cs y frontend/src/App.test.tsx |
| Pruebas nuevas | Crear tests/Integration.Tests/LessonManagementTests.cs, frontend/src/lessons/LessonsPage.test.tsx, LessonEditorPage.test.tsx y frontend/e2e/lessons.spec.ts |

No se requiere modificar main.tsx ni crear UnsavedChangesGuard global.
No se cambian paquetes, SDK, arquitectura ni estrategia de autenticación.

## 9. Plan simplificado: 10 etapas verificables

Cada etapa mantiene la aplicación compilable e incorpora las pruebas del comportamiento añadido.
No se publican endpoints simulados ni se pospone toda la validación al final.

| Etapa | Entrega | Verificación |
| --- | --- | --- |
| 1 | Reglas de metadatos, soft delete/restauración y copia independiente en dominio | Validación, conservación de actividades e Id nuevos en copias |
| 2 | Mapeo DeletedAt y migración AddLessonSoftDelete | Migrar datos anteriores sin perder clases o actividades |
| 3 | DTO, consultas y endpoints de listado/detalle | Dos usuarios, búsqueda/nivel, orden y 404 ajenos |
| 4 | Crear y actualizar solo metadatos | Clase sin actividades, datos inválidos y PUT que conserva Activities |
| 5 | Duplicación transaccional | Copia completa independiente y reversión ante fallo provocado |
| 6 | Trash, restore y DELETE con cascada existente | Conservación, recuperación, eliminación definitiva y estados inválidos |
| 7 | Mis clases con transporte autenticado y filtros locales | Loading/Error/Empty, búsqueda y nivel sin paginación |
| 8 | Formularios de creación/edición y Guardar | Validación, persistencia tras recargar y aviso sencillo de descarte |
| 9 | Duplicar desde listado y abrir la copia | E2E y botón deshabilitado durante solicitud |
| 10 | Papelera, restauración y confirmaciones; cierre del flujo y documentación de uso | E2E login → crear → editar → duplicar → papelera → restaurar y borrado definitivo |

Las pruebas de integración usan PostgreSQL real y bases aisladas.
El E2E se amplía con cada pantalla conectada.
No se exigen pruebas específicas de concurrencia, paginación o filtros en URL.

## 10. Criterios de aceptación

- [ ] Sin sesión se rechazan todos los endpoints de clases.
- [ ] Cada profesor solo lista y consulta sus clases activas o eliminadas.
- [ ] No puede modificar, copiar, archivar, restaurar ni borrar clases ajenas; recibe 404.
- [ ] El cliente no puede asignar o cambiar UserId.
- [ ] El listado devuelve todas las coincidencias propias por UpdatedAt DESC.
- [ ] Búsqueda por título y nivel se combinan correctamente.
- [ ] Crear con datos válidos funciona sin Activities.
- [ ] Campos obligatorios, longitudes y niveles se validan en frontend y backend.
- [ ] Editar metadatos conserva exactamente las actividades persistidas.
- [ ] Crear y guardar no requieren versiones ni cabeceras de concurrencia.
- [ ] Duplicar conserva datos y orden con nuevos Id de clase y actividades.
- [ ] La copia es independiente y se abre después del éxito.
- [ ] Un fallo durante duplicación no deja filas parciales.
- [ ] Soft delete conserva Lesson y Activities y las retira del listado activo.
- [ ] Restaurar conserva los Id y devuelve la clase a Mis clases.
- [ ] Borrado definitivo exige clase propia en papelera y confirmación de interfaz.
- [ ] La cascada elimina sus Activities sin afectar a otras clases.
- [ ] Cancelar una confirmación no cambia datos; una transición inválida devuelve 409.
- [ ] Se distinguen vacío inicial, resultados filtrados vacíos y papelera vacía.
- [ ] Los botones se deshabilitan durante su acción; un error conserva el formulario.
- [ ] La navegación controlada desde el editor advierte de cambios pendientes.
- [ ] La migración conserva los datos anteriores y deja las clases existentes activas.
- [ ] Registro, login, refresh y logout existentes siguen funcionando.
- [ ] No hay controles ni endpoints de edición individual de actividades.

Al implementar se ejecutarán dotnet restore, dotnet build, ./scripts/Test.ps1 y ./scripts/Test-E2E.ps1.
Se conservan las pruebas importantes de seguridad y persistencia.
No se ejecutan pruebas de aplicación durante esta revisión documental.

## 11. Decisiones y funcionalidades pospuestas

**Se mantiene:** aislamiento JWT por usuario, validaciones, copia transaccional, soft delete y restauración.
Son requisitos de seguridad e integridad del flujo mínimo.

**Se simplifica:** last write wins, listado completo, filtros locales y avisos de descarte sencillos.
Estas decisiones sustituyen las de paginación y concurrencia de la revisión anterior.

**Pospuesto:**

- Lesson.Version, ETag, If-Match, 412/428 y actualización optimista basada en versiones.
- Detección y resolución de conflictos, recarga de versión guardada y manejo especial entre pestañas.
- Paginación, page, pageSize, TotalCount y navegación entre páginas.
- Sincronización de filtros con URL.
- Búsqueda avanzada de papelera, operaciones masivas y limpieza automática.
- Infraestructura general de recuperación de borradores.

**Fuera de SPEC 01:** editor de actividades y tiempos (SPEC 02), Lesson Player, IA, plantillas, biblioteca de actividades, estudiantes, cursos y compartir clases.
También quedan fuera autoguardado, offline, historial y colaboración en tiempo real.

**Dependencia documental:** SPEC 02 aún presupone Version y ETag/If-Match de la revisión anterior.
Esas referencias deben revisarse antes de implementarla.
Esta tarea no modifica SPEC 02 ni decide reintroducir concurrencia avanzada en ella.

## 12. Riesgos principales

| Riesgo | Tratamiento MVP |
| --- | --- |
| Acceso mediante un Id ajeno | Verificar propietario en cada operación, también papelera y copia |
| Sobrescritura desde otra pestaña | Aceptar last write wins y documentar el límite |
| Listado demasiado grande | Incorporar paginación posteriormente si el volumen lo exige |
| Copia parcial o incoherente | Lectura y escritura del conjunto dentro de una transacción |
| Repetición de POST tras fallo de red | Deshabilitar botón y no reintentar automáticamente escrituras inciertas |
| Borrado definitivo accidental | Exigir papelera y confirmación con el título |
| Pérdida del formulario al salir | Aviso en navegación controlada y beforeunload, sin prometer recuperación |
| PUT o refetch altera datos no deseados | DTO acotado, actualización selectiva y no reemplazar un formulario modificado |
| SPEC 02 depende de contratos retirados | Señalar la incompatibilidad y revisar esa especificación por separado |

No se implementan funciones ni se modifican archivos de código en esta tarea.
La especificación permanece en Borrador para revisión del usuario.
