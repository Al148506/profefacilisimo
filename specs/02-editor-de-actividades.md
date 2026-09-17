# SPEC 02 — Editor de actividades y tiempos

> **Estado:** Borrador
> **Depende de:** SPEC 01 — Gestión de clases.
> **Fecha:** 2026-09-17
> **Objetivo:** Permitir editar y ordenar las actividades de una clase y guardar su contenido y duración calculada como una unidad.

## 1. Contexto y alcance

Esta especificación amplía el editor y los contratos creados por SPEC 01.
No crea otro dashboard, otro sistema de autenticación ni una API paralela de clases.
Conserva .NET 9, las cuatro capas existentes y PostgreSQL con contenido JSONB.

**Incluye:**

- Crear, editar y quitar actividades de los cuatro tipos existentes.
- Formularios específicos con texto plano, preguntas y ejercicios.
- Cambiar el tipo de una actividad después de confirmar el descarte de su contenido específico.
- Ordenar con botones Subir/Bajar y arrastrar y soltar.
- Introducir duración obligatoria por actividad.
- Introducir un tiempo adicional independiente después de cada actividad.
- Calcular automáticamente la duración total de la clase.
- Guardar metadatos, actividades y orden en una única operación atómica.
- Exigir completar las duraciones antiguas desconocidas al guardar.
- Conservar los cambios locales si hay errores o conflictos.
- Extender duplicación, papelera y pruebas de SPEC 01 sin cambiar su comportamiento confirmado.

**Fuera del alcance:**

- Lesson Player.
- Generación o corrección mediante IA.
- Editor de texto enriquecido, HTML, Markdown interpretado o archivos multimedia.
- Actividades interactivas para estudiantes o registro de sus respuestas.
- Tipos distintos de Speaking, Reading, Writing y VocabularyGrammar.
- Plantillas, biblioteca de actividades o duplicación individual de actividades.
- Autoguardado, historial, fusión automática y recuperación offline.
- Tiempos de preparación antes de la primera actividad o cierre tras la última.

## 2. Comportamiento del editor

### 2.1 Organización y estados

- Se reutilizan /lessons/new y /lessons/:id/edit.
- Los metadatos siguen requiriendo título, nivel, tema y objetivo.
- La clase puede permanecer sin actividades.
- El editor muestra la lista ordenada y permite seleccionar una actividad para editar.
- Cambiar de selección conserva los valores locales de las demás actividades.
- “Agregar actividad” pide el tipo y añade un formulario vacío al final.
- No se envían solicitudes de escritura al añadir o editar localmente.
- El orden del formulario es el orden que se guardará.
- La nueva actividad no recibe una duración inventada.
- Los campos inválidos se señalan al intentar guardar.
- Cada actividad con errores queda identificada aunque no esté seleccionada.
- No se muestran respuestas de éxito antes de confirmación del servidor.
- La interfaz conserva los componentes y estilo visual de la aplicación.
- El listado y editor son utilizables en pantalla estrecha.

### 2.2 Contenido por tipo

Todos los tipos incluyen título, instrucciones y duración.

| Tipo | Campos específicos | Reglas actuales que se conservan |
| --- | --- | --- |
| Speaking | questionsList | De 1 a 50 preguntas no vacías; máximo 2000 caracteres cada una |
| Reading | text y questionsList | Texto no vacío de hasta 20000 caracteres; de 1 a 50 preguntas |
| Writing | prompt | Consigna no vacía de hasta 5000 caracteres |
| VocabularyGrammar | explanation y exercises | Explicación no vacía de hasta 10000 caracteres; de 1 a 50 ejercicios |

- El título de actividad tiene un máximo de 200 caracteres.
- Las instrucciones son obligatorias y tienen un máximo de 2000 caracteres.
- Las preguntas de Reading y los ejercicios tienen un máximo de 2000 caracteres cada uno.
- Se pueden añadir y quitar filas de preguntas o ejercicios.
- El texto se representa como texto, nunca como HTML ejecutable.
- El servidor valida el contenido según Type y rechaza combinaciones incompatibles.
- No se acepta JSON libre introducido por el profesor.
- Se conserva el formato de contenido de fase 1 para no invalidar JSONB existente.
- La columna Type es el discriminador autoritativo.
- Un valor type redundante dentro del JSON antiguo no puede contradecir ese discriminador.

### 2.3 Cambiar tipo

- Cambiar de tipo solicita confirmación cuando hay contenido específico que descartar.
- Cancelar deja intactos el tipo y todos los campos.
- Confirmar conserva Id, título, instrucciones, duración y transición.
- Confirmar vacía el contenido específico y muestra el formulario del nuevo tipo.
- Los nuevos campos deben completarse antes de guardar.
- No se persiste el cambio al confirmar el diálogo.
- El contenido anterior sigue en el servidor hasta que Guardar tenga éxito.
- Un fallo de guardado no deja una mezcla de campos del tipo anterior y del nuevo.

### 2.4 Quitar y reordenar actividades

- Quitar una actividad modifica solo el borrador local.
- Guardar confirma su eliminación en el servidor.
- Salir descartando cambios conserva la actividad persistida.
- No hay papelera individual de actividades.
- El intervalo asociado a la actividad se elimina junto a ella.
- Subir está deshabilitado en la primera actividad.
- Bajar está deshabilitado en la última.
- Arrastrar y soltar produce el mismo orden que los botones.
- Los botones están disponibles con teclado aunque no se use arrastre.
- El arrastre debe admitir puntero y pantalla táctil.
- Cancelar el arrastre conserva el orden anterior.
- Cada actividad mantiene su identidad y contenido al moverse.
- Su intervalo posterior viaja con ella.
- Reordenar recalcula la duración local, pero no escribe en PostgreSQL.
- El servidor asigna Order consecutivo desde cero según el array recibido.

### 2.5 Duraciones y transiciones

**Reglas confirmadas:**

- EstimatedDuration de cada actividad debe ser un entero mayor que cero al guardar.
- TransitionAfterMinutes es un entero mayor o igual a cero.
- Una nueva transición empieza en cero.
- Cada actividad almacena su propio intervalo posterior.
- El intervalo de la última actividad se conserva pero no se suma.
- Si deja de ser la última, su intervalo vuelve a participar en el total.
- No se añade automáticamente tiempo antes de la primera actividad.
- No existe un campo editable de duración total.

Para una clase de n actividades:

```text
Total = suma de EstimatedDuration de todas las actividades
      + suma de TransitionAfterMinutes de las actividades 0 a n-2
```

- Una clase sin actividades tiene duración total 0.
- Una clase con una actividad suma solo la duración de esa actividad.
- Si falta alguna duración, se muestra “Duración incompleta”.
- No se presenta una suma parcial como si fuera un total completo.
- El total se recalcula al editar tiempos, añadir, quitar o reordenar actividades.
- El intervalo conservado de la última actividad se identifica como “No cuenta mientras sea la última”.
- El servidor vuelve a calcular el total; no confía en el cálculo del navegador.
- Los valores se validan en cliente y servidor.
- La suma usa aritmética comprobada para rechazar desbordamiento, no para truncarlo.

**Ejemplo verificable:**

- A dura 10 minutos y tiene intervalo 2.
- B dura 15 minutos y tiene intervalo 3.
- C dura 5 minutos y tiene intervalo 4.
- Orden A, B, C: total 10 + 15 + 5 + 2 + 3 = 35.
- Orden C, A, B: total 5 + 10 + 15 + 4 + 2 = 36.
- B conserva su intervalo 3, pero no lo suma mientras sea la última.
- Quitar A del segundo orden deja C, B: total 5 + 15 + 4 = 24.

### 2.6 Guardado conjunto y conflictos

- Un único botón Guardar persiste los metadatos, todas las actividades y su orden.
- Añadir, quitar, editar, cambiar tipo y reordenar son operaciones del borrador.
- No se crean endpoints de guardado independiente por actividad.
- Guardar valida el conjunto completo antes de escribir.
- Una actividad inválida impide guardar toda la clase.
- El Id de una actividad existente debe pertenecer a esa misma clase y usuario.
- Un Id repetido, ajeno o desconocido no se interpreta como una actividad nueva.
- Una actividad nueva se identifica sin Id persistido; el servidor genera su Id.
- La omisión de una actividad existente en el array representa su eliminación.
- Un array vacío conserva una clase válida sin actividades.
- activities omitido o null no equivale a una petición de borrado total.
- Un cambio en cualquier parte del conjunto incrementa la versión de Lesson.
- Se conserva el protocolo ETag/If-Match de SPEC 01.
- Un guardado obsoleto se rechaza sin modificar ninguna fila.
- El mensaje de conflicto conserva el borrador local.
- No se ofrece fusión automática ni sobrescritura forzada.
- Una clase archivada desde otra pestaña no puede actualizarse.
- Al guardar con éxito se reemplazan las claves locales por los Id retornados.
- Solo tras ese éxito se limpia el indicador de cambios pendientes.
- Se actualizan detalle y listado de TanStack Query sin borrar el formulario ante un refetch.
- Una renovación de sesión fallida no provoca reenvíos infinitos.
- No se promete conservar un borrador después de cerrar sesión o abandonar el documento.

## 3. Modelo de datos y migración

### 3.1 Actividad y clase

Extender Activity:

```csharp
public int TransitionAfterMinutes { get; private set; } // default 0
public int? EstimatedDuration { get; private set; }    // nullable solo por datos heredados
```

- No se introduce un tipo de actividad “Pausa”.
- No se crea una tabla de intervalos.
- Las duraciones antiguas null se conservan sin asignar un tiempo ficticio.
- Los métodos de creación y actualización nuevos exigen duración positiva.
- La lectura y duplicación pueden conservar valores heredados desconocidos.
- Guardar desde el editor exige completar todos esos tiempos.
- El frontend no bloquea la lectura, la restauración ni la eliminación por tener duración incompleta.

Lesson.EstimatedDuration deja de ser una estimación manual.
Su columna existente se reutiliza como total calculado persistido:

- int no negativo para clases con duraciones completas.
- 0 para una clase vacía.
- null mientras alguna actividad heredada carezca de duración.
- Se recalcula en la misma transacción de cada guardado.
- No se incluye como campo editable en SaveLessonRequest.

### 3.2 Migración AddActivityTransitionsAndCalculatedDuration

- Añadir TransitionAfterMinutes con valor inicial 0 y restricción mayor o igual a cero.
- Mantener EstimatedDuration nullable en Activities para preservar datos anteriores.
- Mantener su restricción de valor positivo cuando no sea null.
- Cambiar CK_Lesson_Duration para admitir cero o null.
- Recalcular el total de cada clase desde sus actividades.
- Usar 0 si no tiene actividades.
- Usar null si alguna actividad tiene duración null.
- No repartir una duración manual antigua entre sus actividades.
- Recalcular también las clases de la papelera para que restaurarlas no cambie las reglas.
- No eliminar ni alterar títulos, JSONB, propietarios o Id existentes.
- Registrar la pérdida deliberada del antiguo total manual al pasar a duración calculada.
- Probar la migración sobre una base con clases vacías, completas e incompletas.
- El rollback no puede recuperar estimaciones manuales antiguas; se requiere respaldo antes de migrar datos reales.

### 3.3 Contratos extendidos

Extender SaveLessonRequest de SPEC 01 con activities obligatorio:

```typescript
type LessonActivityInput = {
  id: string | null;
  type: 'Speaking' | 'Reading' | 'Writing' | 'VocabularyGrammar';
  title: string;
  instructions: string;
  estimatedDuration: number;
  transitionAfterMinutes: number;
  content: SpeakingContent | ReadingContent | WritingContent | VocabularyGrammarContent;
};
```

- El orden del array representa el orden solicitado.
- No aceptar UserId, LessonId ni Order como valores autoritativos del cliente.
- El borrador React utiliza una clave local estable separada de id.
- estimatedDuration puede estar vacío solo en el formulario previo a validación.
- LessonActivityDto añade transitionAfterMinutes.
- LessonDetailsDto devuelve el conjunto ordenado y estimatedDuration calculado.
- LessonListItemDto añade estimatedDuration; null se representa como “Duración incompleta”.
- El servidor rechaza campos numéricos fraccionarios, negativos o fuera de rango.
- El esquema Zod utiliza una unión discriminada por type.
- Las claves de errores permiten identificar campos como activities[2].content.text.

### 3.4 Atomicidad, orden y compatibilidad

Se amplían POST /api/lessons y PUT /api/lessons/{id}.
POST admite activities vacío.
PUT exige el array completo y el If-Match de la clase cargada.

- Los errores del conjunto devuelven 400 sin persistencia parcial.
- Los conflictos siguen devolviendo 412.
- La ausencia de If-Match sigue devolviendo 428.
- La respuesta exitosa incluye las actividades canónicas y el nuevo ETag.
- La transacción protege metadatos, inserciones, actualizaciones, eliminaciones, orden y total.
- Bloquear lógicamente la versión de la clase dentro de esa misma transacción.
- Dos guardados de la misma versión no pueden tener éxito simultáneamente.
- No regenerar Id de todas las actividades para simplificar el orden.

El índice único (LessonId, Order) ya existe.
Un intercambio directo de dos posiciones puede violarlo durante SaveChanges.
Aplicar el nuevo orden en dos fases dentro de una transacción:

1. Llevar las actividades persistidas a posiciones temporales no negativas y libres.
2. Aplicar eliminaciones, inserciones y las posiciones finales consecutivas.

Los rangos temporales deben superar tanto el máximo persistido como las posiciones finales.
El cálculo del rango debe rechazar desbordamientos.
Ninguna lectura externa debe observar las posiciones temporales.
Si algo falla, se revierte también el cambio de versión.

La duplicación de SPEC 01 copia TransitionAfterMinutes y recalcula el total.
La papelera conserva contenido, tiempos e intervalos.
No se cambia el límite de retención ni se crea una papelera de actividades.

## 4. Archivos previstos

**Modificar los archivos existentes o creados por SPEC 01:**

- backend/Domain/Activity.cs — edición, duración, transición y copia.
- backend/Domain/Lesson.cs — aplicar conjunto, validar orden y calcular total.
- backend/Application/Lessons/LessonDtos.cs — array editable y tiempos.
- backend/Application/Lessons/ILessonService.cs — guardado del conjunto.
- backend/Infrastructure/LessonService.cs — transacción y orden en dos fases.
- backend/Infrastructure/LessonReader.cs — devolver actividades y duración calculada.
- backend/Infrastructure/AppDbContext.cs — transición y restricciones.
- backend/Infrastructure/Migrations/AppDbContextModelSnapshot.cs.
- backend/Api/LessonEndpoints.cs — validar y mapear el contrato ampliado.
- frontend/src/lessons/lesson-api.ts — transporte del conjunto completo.
- frontend/src/lessons/lesson-schema.ts — unión por tipo y validación del borrador.
- frontend/src/lessons/LessonEditorPage.tsx — integración de la lista y formularios.
- frontend/src/lessons/LessonsPage.tsx — total o duración incompleta.
- frontend/src/lessons/LessonEditorPage.test.tsx.
- frontend/src/styles.css — editor adaptable y estados.
- tests/Domain.Tests/LessonTests.cs.
- tests/Integration.Tests/LessonManagementTests.cs — copiar/restaurar también intervalos.

**Crear:**

- backend/Infrastructure/Migrations/<timestamp>_AddActivityTransitionsAndCalculatedDuration.cs y Designer.
- frontend/src/lessons/ActivityList.tsx.
- frontend/src/lessons/ActivityForm.tsx.
- frontend/src/lessons/lesson-duration.ts.
- frontend/src/lessons/ActivityList.test.tsx.
- frontend/src/lessons/ActivityForm.test.tsx.
- frontend/src/lessons/lesson-duration.test.ts.
- tests/Domain.Tests/ActivityEditingTests.cs.
- tests/Integration.Tests/LessonEditorTests.cs.
- frontend/e2e/lesson-builder.spec.ts.

El borrador no fija una dependencia externa de drag-and-drop.
El contrato exige puntero, táctil y botones accesibles.
Si se necesita una biblioteca, su incorporación debe justificarse al revisar la implementación.
No se autoriza actualizar el resto de dependencias por conveniencia.

## 5. Plan de implementación

Cada paso mantiene ejecutables las funciones ya conectadas.
Dividir los cambios manuales mayores de aproximadamente 30–50 líneas en subpasos compilables.
Las migraciones generadas se mantienen íntegras.
No exponer un guardado ampliado hasta que su validación y transacción estén completas.

1. Añadir TransitionAfterMinutes y sus reglas a Activity sin cambiar aún la interfaz.
2. Incorporar pruebas del intervalo de la última actividad y su conservación.
3. Añadir el cálculo de duración de Lesson con ejemplos de orden y datos incompletos.
4. Añadir los métodos de modificación de contenido preservando identidad.
5. Añadir aplicación del conjunto de actividades con validación de Id y duración.
6. Configurar el campo y las restricciones de base de datos.
7. Generar la migración y validar sus resultados sobre datos heredados preparados.
8. Extender los DTO de lectura con intervalos y total calculado.
9. Extender la duplicación para conservar los nuevos intervalos.
10. Definir el contrato de guardado completo y su validación por tipo.
11. Implementar validación de pertenencia e identidad de todas las actividades recibidas.
12. Implementar actualización de metadatos y actividades dentro de una transacción.
13. Incorporar asignación de posiciones temporales y finales sin colisiones.
14. Incorporar cálculo de total y cambio de versión dentro de esa transacción.
15. Exponer el contrato ampliado en POST/PUT, con pruebas de fallo atómico.
16. Crear el modelo local de editor y las validaciones Zod.
17. Implementar el cálculo local puro con los mismos casos del dominio.
18. Añadir lista de actividades y selección sin perder cambios locales.
19. Implementar formulario Speaking con filas de preguntas.
20. Implementar formulario Reading con texto y preguntas.
21. Implementar formulario Writing con consigna.
22. Implementar formulario VocabularyGrammar con explicación y ejercicios.
23. Conectar duración obligatoria y transición individual con el total visible.
24. Conectar cambio de tipo y su confirmación de descarte.
25. Conectar eliminación local de actividad y su intervalo.
26. Añadir botones Subir/Bajar y verificar extremos.
27. Añadir arrastre con puntero/táctil reutilizando la misma operación de orden.
28. Conectar Guardar para enviar el conjunto, aplicar Id retornados y limpiar cambios solo al éxito.
29. Integrar conflictos, errores por actividad y bloqueo de navegación.
30. Mostrar duración calculada o incompleta en listado y detalle.
31. Documentar el flujo completo y las reglas de tiempos al cerrar la entrega.

Cada paso incorpora las pruebas focalizadas de la regla o componente conectado.
El flujo E2E se amplía durante la integración de la interfaz.
No se sustituye la prueba con PostgreSQL por EF InMemory.

## 6. Criterios de aceptación

### Edición y contenido

- [ ] Se puede crear, editar y quitar una actividad de cada uno de los cuatro tipos.
- [ ] Cambiar la selección de actividad conserva el borrador de las demás.
- [ ] Texto HTML se presenta como texto sin ejecución.
- [ ] El servidor rechaza contenido incompatible con el tipo.
- [ ] Cancelar cambio de tipo conserva todos los valores.
- [ ] Confirmarlo vacía solo el contenido específico y conserva identidad, instrucciones y tiempos.
- [ ] Una actividad inválida impide guardar toda la clase e identifica el campo afectado.
- [ ] El borrador local permanece disponible tras un error de validación o red.

### Duración

- [ ] La clase vacía muestra y persiste total 0.
- [ ] Guardar una actividad sin duración, con cero, negativa o fraccionaria se rechaza.
- [ ] Una transición negativa o fraccionaria se rechaza.
- [ ] Las nuevas transiciones empiezan en 0.
- [ ] El ejemplo A/B/C produce 35, 36 y 24 minutos en los tres estados definidos.
- [ ] La última transición no se suma, pero conserva su valor tras guardar y recargar.
- [ ] Al mover esa actividad a una posición intermedia, su transición vuelve a sumarse.
- [ ] Los datos heredados sin duración muestran “Duración incompleta”.
- [ ] Ninguna migración asigna 5 minutos ni otro tiempo ficticio.
- [ ] Guardar una clase heredada exige completar todas sus duraciones.
- [ ] La duración persistida coincide con el cálculo del servidor.

### Orden y persistencia

- [ ] Subir/Bajar y arrastrar producen el mismo orden final.
- [ ] El orden puede cambiarse sin ratón mediante los botones.
- [ ] Los extremos no permiten movimientos fuera de la lista.
- [ ] Cada actividad conserva Id, contenido e intervalo al moverse.
- [ ] Editar o reordenar localmente no produce escrituras antes de Guardar.
- [ ] Guardar persiste metadatos, contenido, orden, eliminaciones y total conjuntamente.
- [ ] Recargar tras guardar reproduce el estado completo.
- [ ] Un Id ajeno o duplicado en el payload rechaza todo el guardado.
- [ ] Omitir activities no elimina silenciosamente las actividades existentes.
- [ ] Guardar un array vacío elimina las actividades y deja total 0.
- [ ] Intercambiar dos actividades no viola el índice único de orden.
- [ ] Un fallo a mitad de la transacción deja intactas actividades, metadatos y versión originales.
- [ ] Dos escrituras con el mismo ETag tienen un único ganador.
- [ ] La duplicación conserva actividades, intervalos y orden con nuevos Id.
- [ ] Enviar a papelera y restaurar conserva todos los tiempos.

**Comprobaciones ejecutables al implementar:**

- dotnet restore y dotnet build desde la raíz.
- ./scripts/Test.ps1 con casos numéricos, contratos y transacciones añadidos.
- ./scripts/Test-E2E.ps1 con creación, edición, ordenamiento, duplicación y restauración.
- Prueba Playwright de dos contextos que editan la misma clase.
- Revisión manual de teclado, puntero y táctil para ordenamiento.

No se han ejecutado estas comprobaciones durante la redacción.

## 7. Decisiones tomadas y descartadas

**Confirmadas por el usuario:**

- Formularios específicos de texto plano y listas, no texto enriquecido.
- Duración automática, no duración total manual.
- Duraciones obligatorias, sin valores inventados para datos antiguos.
- Transiciones individuales en cero inicialmente, no un intervalo global.
- El intervalo acompaña a la actividad anterior.
- La última transición se conserva pero no se suma.
- Botones y drag-and-drop, no solo uno de esos mecanismos.
- Guardado conjunto, no endpoints independientes ni autoguardado.
- Cambio de tipo permitido con confirmación.
- Conflictos visibles, sin sobrescritura silenciosa.

**Diseño técnico propuesto para revisión en este borrador:**

- Mantener duración nullable físicamente para preservar datos heredados.
- Exigir positividad al escribir desde el nuevo editor.
- Reutilizar Lesson.EstimatedDuration como total calculado.
- Campo TransitionAfterMinutes en Activity, sin nueva entidad de pausa.
- Orden derivado del array y actualización en dos fases.
- Conservar los Id existentes al editar.
- Reutilizar el protocolo de concurrencia y cliente HTTP de SPEC 01.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Colisión al intercambiar posiciones únicas | Posiciones temporales libres dentro de la misma transacción |
| Pérdida de cambios por guardado parcial | Validación previa y transacción del conjunto completo |
| Doble guardado desde distintas pestañas | Versión de Lesson e If-Match; conflicto sin sobrescritura |
| Duraciones antiguas desconocidas | Preservar null y exigir completarlas al guardar |
| Total manual antiguo sin correspondencia con actividades | Recalcular sin repartir tiempos ficticios; respaldo previo |
| Cambio de tipo que descarta trabajo | Confirmación y persistencia solo tras Guardar |
| Arrastre inaccesible o fallido en móvil | Botones siempre disponibles y prueba de puntero/táctil |
| Total distinto entre cliente y servidor | Mismos casos de prueba; servidor autoritativo |
| Pérdida del intervalo de la última actividad | Conservar campo y probar ida y vuelta de orden |
| Expiración de sesión durante edición | Renovación acotada y aviso; no prometer recuperación offline |

## 9. Qué NO se hará en esta especificación

No habrá Lesson Player, IA, contenido multimedia ni ejercicios interactivos.
No habrá autoguardado, historial o colaboración simultánea.
No habrá papelera individual de actividades.
No habrá tiempos de apertura o cierre fuera de los intervalos acordados.
No se cambiarán autenticación, framework ni arquitectura.
