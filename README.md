# Profefacilisimo — workspace para profesores de español

Aplicación web orientada a facilitar la preparación, organización y
ejecución de clases de español como lengua extranjera. El profesor puede
crear y estructurar una clase sin preparar cada actividad desde cero,
impartirla con el Lesson Player y, en la siguiente fase, organizar su
trabajo en función de sus estudiantes.

> **Estado:** Fases 1–3 implementadas (base, Class Builder, Lesson Player).\
> **Próxima fase:** Fase 4 — Student Management (documentación conceptual en
> [SPEC 04](docs/student-management.md); sin implementar todavía).\
> **Objetivo inicial:** validar si un creador de clases estructuradas reduce
> el tiempo de preparación para profesores de español.

------------------------------------------------------------------------

## 1. Problema

Preparar una clase de español puede requerir varias tareas
independientes:

-   Elegir un tema y objetivo.
-   Buscar o redactar material de lectura.
-   Crear preguntas de comprensión.
-   Preparar vocabulario.
-   Diseñar ejercicios de gramática.
-   Preparar actividades de escritura y conversación.
-   Organizar las actividades en un orden adecuado.
-   Tener los materiales listos para utilizarlos durante la clase.

El proyecto busca centralizar este proceso en una sola aplicación.

## 2. Propuesta de valor

La promesa principal del producto es:

> **Facilitar a los profesores de español la preparación, organización y
> ejecución de sus clases, permitiendo personalizarlas y gestionarlas en
> función de cada estudiante.**

El profesor podrá seleccionar las características de la clase, organizar
actividades, editar su contenido, guardar la lección y utilizarla mediante
una interfaz sencilla durante la sesión con el estudiante. De forma
progresiva, podrá además reutilizar la misma clase con varios estudiantes y
mantener una ficha básica de cada uno.

La propuesta de valor **evoluciona** desde el foco inicial («crear
rápidamente una clase de español estructurada y lista para utilizar») hacia
la organización del trabajo del profesor alrededor de sus estudiantes. El
producto no deja de ser un creador de clases: amplía el modelo conceptual
para que la preparación pueda tener en cuenta a quién va dirigida.

------------------------------------------------------------------------

## 3. Usuarios objetivo

### MVP

Profesores particulares de español que imparten clases en línea o
presenciales y necesitan preparar material con frecuencia.

Ejemplos:

-   Profesores independientes.
-   Tutores de español.
-   Profesores que trabajan mediante plataformas de clases particulares.
-   Personas que están comenzando a enseñar español y necesitan una
    estructura para sus lecciones.

### Futuro

-   Academias de idiomas.
-   Profesores con múltiples estudiantes (organizados por estudiante desde
    la Fase 4).
-   Creadores de material educativo.
-   Estudiantes que quieran practicar independientemente.

------------------------------------------------------------------------

## 4. Alcance del MVP

El MVP se centra en tres funcionalidades principales, ya implementadas, y
se amplía con una cuarta en la siguiente fase.

### Class Builder (Fase 2 — implementada)

Permite crear y editar una clase.

Información básica:

-   Título.
-   Nivel.
-   Tema.
-   Duración estimada.
-   Objetivo de la clase.
-   Actividades.

### Lesson Player (Fase 3 — implementada)

Permite utilizar la clase mediante una interfaz limpia durante una
sesión.

El profesor puede avanzar entre actividades utilizando un flujo similar
a:

``` text
Warm-up
   ↓
Speaking
   ↓
Reading
   ↓
Vocabulary / Grammar
   ↓
Writing
   ↓
Cierre
```

### Student Management (Fase 4 — próxima, sin implementar)

Permite mantener información básica de cada estudiante y asociar clases
existentes con él, sin convertirse en un sistema de gestión educativa. El
alcance y el modelo conceptual están definidos en
[SPEC 04 — Student Management](docs/student-management.md).

------------------------------------------------------------------------

## 5. Tipos de actividades del MVP

Para evitar aumentar innecesariamente el alcance inicial, el MVP tendrá
cuatro categorías principales.

### Speaking

Preguntas abiertas orientadas a generar conversación.

Ejemplo:

> ¿Cuál fue el último lugar que visitaste?

### Reading

Texto corto acompañado de preguntas de comprensión.

### Writing

Actividad en la que el estudiante redacta una respuesta corta.

### Vocabulary / Grammar

Explicación breve seguida de uno o varios ejercicios.

Los ejercicios podrán evolucionar posteriormente hacia componentes
interactivos.

------------------------------------------------------------------------

## 6. Flujo principal

### 6.1 Flujo implementado (Fases 1–3)

``` text
Profesor
   ↓
Dashboard
   ↓
Crear clase
   ↓
Definir nivel, tema y objetivo
   ↓
Agregar actividades
   ↓
Editar / ordenar actividades
   ↓
Guardar clase
   ↓
Iniciar Lesson Player
   ↓
Utilizar la clase con el estudiante
```

### 6.2 Ampliación prevista (Fase 4 — no implementada)

``` text
Profesor
   ↓
Students
   ↓
Ficha del estudiante (nivel, idioma, objetivos, intereses, notas)
   ↓
Asignar clases existentes
   ↓
Ver las clases asignadas desde el perfil
```

La misma clase puede asignarse a varios estudiantes. Ver
[SPEC 04](docs/student-management.md).

------------------------------------------------------------------------

## 7. Tecnologías planeadas

### Frontend

-   React
-   TypeScript
-   Vite
-   React Router
-   TanStack Query
-   React Hook Form
-   Zod

La biblioteca de componentes visuales se decidirá durante la etapa
inicial del proyecto. Se priorizará una interfaz limpia y sencilla sobre
una personalización visual compleja.

### Backend

-   .NET 9
-   ASP.NET Core Web API
-   Entity Framework Core
-   FluentValidation (opcional)
-   JWT para autenticación

### Base de datos

-   PostgreSQL

### Infraestructura

Opciones iniciales:

-   Frontend: Vercel
-   API: Railway, Render o VPS
-   PostgreSQL: Railway, Neon u otro proveedor administrado

La infraestructura definitiva se decidirá antes del primer despliegue
público.

------------------------------------------------------------------------

## 8. Arquitectura

Para el backend se planea utilizar una arquitectura por capas inspirada
en Clean Architecture.

``` text
Presentation / API
        │
        ▼
Application
        │
        ▼
Domain
        ▲
        │
Infrastructure
```

### Domain

Contendrá:

-   Entidades.
-   Reglas de negocio.
-   Enumeraciones.
-   Value Objects cuando sean necesarios.

No deberá depender de infraestructura externa.

### Application

Contendrá:

-   Casos de uso.
-   DTOs.
-   Interfaces.
-   Validaciones.
-   Lógica de aplicación.

### Infrastructure

Contendrá:

-   Entity Framework Core.
-   PostgreSQL.
-   Implementaciones de repositorios.
-   Servicios externos.
-   Autenticación.
-   Integraciones futuras con IA, almacenamiento o TTS.

### API / Presentation

Responsable de:

-   Endpoints.
-   Autenticación/autorización.
-   Recepción de solicitudes.
-   Respuestas HTTP.

------------------------------------------------------------------------

## 9. Modelo de dominio

### 9.1 Modelo implementado

Modelo conceptual simplificado tal como existe hoy:

``` text
User
 └── Lesson
      ├── Title
      ├── Level
      ├── Topic
      ├── Objective
      ├── EstimatedDuration
      │
      └── Activities
           ├── Speaking
           ├── Reading
           ├── Writing
           └── VocabularyGrammar
```

Una `Lesson` contiene múltiples `Activities`.

Cada actividad comparte propiedades básicas:

-   Id.
-   LessonId.
-   Type.
-   Title.
-   Instructions.
-   Content.
-   Order.
-   EstimatedDuration.

### 9.2 Evolución prevista (Fase 4 — no implementada)

La Fase 4 introduce `Student` como entidad en paralelo a `Lesson`, ambas
colgando del profesor:

``` text
User
 ├── Students
 │
 └── Lessons
       └── Activities
```

`Students` **no** contiene clases y `Lesson` **no** contiene estudiantes: la
relación entre ambos se resolverá mediante una entidad intermedia (ver
apartado 9.3).

### 9.3 Decisión de dominio: una `Lesson` no pertenece a un único estudiante

Una clase **no** debe pertenecer necesariamente a un único estudiante: la
misma clase puede reutilizarse con varios alumnos.

``` text
Lesson
"B1 - Pretérito vs Imperfecto"
       │
       ├── Student A
       ├── Student B
       └── Student C
```

Por esta razón **se evita diseñar conceptualmente `StudentId` dentro de
`Lesson`** como si una clase solo pudiera pertenecer a un alumno. Un campo
así en `Lesson` haría imposible reutilizar la clase y obligaría a duplicarla
por cada estudiante.

La relación se representa, cuando se implemente, con una entidad intermedia:

``` text
Student
   ↕
LessonAssignment
   ↕
Lesson
```

`LessonAssignment` sería una relación N:M con `Id`, `StudentId`, `LessonId`,
`AssignedAt` y `Status`. **No se implementa todavía**, salvo que sea
estrictamente necesario para la SPEC de Student Management. Su diseño
completo está en [SPEC 04](docs/student-management.md).

------------------------------------------------------------------------

## 10. Entidades

### Implementadas

#### User

Representa al profesor que utiliza la plataforma.

#### Lesson

Representa una clase completa.

#### Activity

Representa una actividad perteneciente a una clase.

### Previstas (Fase 4 — no implementadas)

#### Student

Representa a un alumno del profesor. Propuesta inicial de campos: `Id`,
`Name`, `Email`, `Level`, `NativeLanguage`, `Interests`, `Goals`, `Notes`,
`CreatedAt`, `UpdatedAt`. Son una propuesta que podrá ajustarse durante la
implementación de la SPEC; el sistema almacena únicamente información
relevante para preparar clases (sin teléfono, dirección, datos financieros
ni médicos). Detalle en [SPEC 04](docs/student-management.md).

#### LessonAssignment

Entidad intermedia para la relación N:M entre `Student` y `Lesson` (apartado
9.3). Sólo se implementará si es necesario para la asignación de clases.

Se evita crear entidades adicionales como `Course`, `Classroom` o
`Institution` hasta comprobar que son necesarias.

------------------------------------------------------------------------

## 11. Funcionalidades principales

Las secciones marcadas como implementadas ya existen en el código; las
marcadas como próximas están documentadas pero no implementadas.

### Autenticación — implementada

-   Registro.
-   Inicio de sesión.
-   Cierre de sesión.
-   Protección de clases por usuario.

### Gestión de clases — implementada (Fase 2 / SPEC 01)

-   Crear clase.
-   Consultar clases.
-   Editar clase.
-   Eliminar clase.
-   Duplicar clase.
-   Definir nivel.
-   Definir tema.
-   Definir objetivo.
-   Definir duración estimada.

### Gestión de actividades — implementada (Fase 2 / SPEC 02)

-   Agregar actividades.
-   Editar actividades.
-   Eliminar actividades.
-   Ordenar actividades.
-   Seleccionar tipo de actividad.
-   Agregar instrucciones y contenido.

### Lesson Player — implementado (Fase 3 / SPEC 03)

-   Abrir una clase.
-   Mostrar una actividad a la vez.
-   Avanzar a la siguiente actividad.
-   Regresar a la actividad anterior.
-   Mostrar progreso dentro de la clase.

### Gestión de estudiantes — próxima (Fase 4 / SPEC 04)

Base mínima para personalizar y organizar el trabajo del profesor, sin
convertirse en un sistema completo de gestión educativa:

-   Crear, consultar, editar y eliminar estudiantes.
-   Perfil del estudiante.
-   Nivel, idioma nativo, objetivos, intereses y notas del profesor.
-   Asignar clases existentes a estudiantes.
-   Ver las clases asignadas desde el perfil del estudiante.
-   Identificar desde una clase qué estudiantes la tienen asignada.

### Dashboard

Vista sencilla con:

-   Clases recientes.
-   Clases guardadas.
-   Crear nueva clase.
-   Editar una clase.
-   Iniciar una clase.

------------------------------------------------------------------------

## 12. Niveles iniciales

El sistema utilizará como referencia los niveles del MCER/CEFR.

Para la primera validación se priorizarán:

-   A2
-   B1
-   B2

Posteriormente podrán incorporarse:

-   A1
-   C1
-   C2

------------------------------------------------------------------------

## 13. Contenido inicial

El producto no dependerá obligatoriamente de inteligencia artificial.

Se pueden crear plantillas y actividades manualmente para validar
primero:

1.  Si el flujo de creación resulta útil.
2.  Si el Lesson Player funciona durante una clase real.
3.  Si los profesores ahorran tiempo.
4.  Qué tipos de actividades utilizan con mayor frecuencia.

A partir de la Fase 4, la validación incorpora además:

5.  Si resulta útil organizar las clases en función de los estudiantes.
6.  Si almacenar información relevante de cada estudiante aporta valor al
    preparar las clases.

Una vez validado el flujo, la IA podrá acelerar la generación del
contenido, usando la información del estudiante como contexto.

------------------------------------------------------------------------

## 14. Fuera del alcance

Las siguientes funcionalidades **no forman parte del producto en su estado
actual ni de la próxima fase**:

-   Generación completa de clases mediante IA.
-   Cursos completos.
-   Videollamadas.
-   Pagos.
-   Suscripciones.
-   Marketplace de clases.
-   Gamificación.
-   Aplicación móvil.
-   Analíticas avanzadas.
-   Reconocimiento de voz.
-   Corrección automática de pronunciación.
-   Sistema avanzado de flashcards.
-   Integración con calendarios.
-   Gestión de academias.
-   Homework.
-   Progreso avanzado del estudiante.

Esta lista existe para proteger el alcance del producto.

### Gestión de estudiantes

La gestión de estudiantes se divide en dos niveles. **Ya no se considera
«fuera del alcance» en bloque**: su versión básica es la próxima fase.

#### Student Management básico — próxima fase (Fase 4 / SPEC 04)

-   Perfil básico (nombre, contacto, nivel, idioma nativo).
-   Información pedagógica (objetivos, intereses).
-   Notas del profesor.
-   Asignación de clases a estudiantes.

#### Student Management avanzado — futuro

-   Progreso del estudiante.
-   Historial detallado de clases.
-   Vocabulario.
-   Homework.
-   Analíticas.

------------------------------------------------------------------------

## 15. Funcionalidades futuras

### Generación de clases con IA

Ejemplo:

> Crea una clase B1 de 60 minutos para un estudiante interesado en
> tecnología que necesita practicar pretérito e imperfecto.

El sistema generaría un borrador estructurado que el profesor podría
modificar.

### Generación individual de actividades

Acciones como:

-   Generar otra lectura.
-   Crear cinco preguntas.
-   Simplificar texto.
-   Aumentar dificultad.
-   Generar vocabulario.
-   Crear ejercicio gramatical.
-   Regenerar actividad.

### Listening

-   Text-to-Speech.
-   Diálogos.
-   Preguntas de comprensión auditiva.
-   Diferentes velocidades.
-   Diferentes voces/accentos.

### Gestión de estudiantes

``` text
User
 ├── Students
 │
 └── Lessons
      └── Activities
```

La relación entre una clase y un estudiante se resuelve con una entidad
intermedia, `LessonAssignment`, porque una misma clase puede reutilizarse
con varios estudiantes (ver apartado 9.3).

La Fase 4 cubre el nivel básico:

-   Perfil del estudiante.
-   Nivel.
-   Idioma nativo.
-   Intereses.
-   Objetivos.
-   Notas del profesor.
-   Asignación de clases.

El nivel avanzado (clases anteriores, vocabulario aprendido, progreso)
pertenece a fases posteriores.

### Sesiones de clase (`LessonSession`)

Una `Lesson` representa el **contenido reutilizable** de una clase; una
futura `LessonSession` representaría una **instancia concreta** de esa clase
impartida a un estudiante.

``` text
Lesson
 │
 ├── Session - Student A - Date
 ├── Session - Student B - Date
 └── Session - Student A - Date
```

Ejemplo:

``` text
Lesson:
"B1 - Conversación sobre viajes"

Session:
Carlos
28/09/2026
Notas:
"Necesita practicar el uso del pretérito."
```

Esta funcionalidad **permanece fuera de la implementación actual** y se
sitúa en la Fase 5.

### Personalización con IA

La generación podría utilizar información del estudiante.

Ejemplo:

> Crear una clase B1 para un estudiante angloparlante interesado en
> videojuegos y programación.

### Homework

-   Asignar ejercicios.
-   Compartir enlace.
-   Registrar respuestas.
-   Revisar tareas.

### Biblioteca de actividades

Permitir reutilizar actividades entre diferentes clases.

### Plantillas

Ejemplos:

-   Primera clase.
-   Clase conversacional.
-   Clase de gramática.
-   Repaso.
-   Preparación de examen.
-   Clase de vocabulario.

### Compartir clases

Generar un enlace para mostrar determinada clase o actividad al
estudiante.

### Exportación

Posibles formatos:

-   PDF.
-   Material imprimible.
-   Documento para el profesor.
-   Hoja de ejercicios para el estudiante.

### Analíticas

-   Tiempo promedio de preparación.
-   Actividades más utilizadas.
-   Temas más utilizados.
-   Número de clases impartidas.
-   Progreso por estudiante.

------------------------------------------------------------------------

## 16. Roadmap

Estado real del proyecto, sin marcar como implementado nada que no exista
en el código.

### Fase 1 — Base — COMPLETADA

-   Configuración frontend.
-   Configuración backend.
-   PostgreSQL.
-   Autenticación.
-   Modelo `Lesson`.
-   Modelo `Activity`.

Ver [Fase 1](docs/phase-1.md).

### Fase 2 — Class Builder — COMPLETADA

-   Crear clase.
-   Editar clase.
-   Eliminar clase.
-   Crear actividades.
-   Editar actividades.
-   Ordenarlas.

Ver [SPEC 01](docs/class-management.md) (gestión de clases) y
[SPEC 02](docs/activity-editor.md) (editor de actividades).

### Fase 3 — Lesson Player — COMPLETADA

-   Mostrar actividades.
-   Navegación anterior/siguiente.
-   Indicador de progreso.
-   Vista optimizada para utilizar durante una clase.

### Fase 4 — Student Management — PRÓXIMA

-   CRUD de estudiantes.
-   Perfil básico y pedagógico.
-   Asignación de clases existentes a estudiantes.
-   Ver las clases asignadas desde el perfil y los estudiantes desde la clase.

Ver [SPEC 04](docs/student-management.md). **Sin implementar todavía.**

### Fase 5 — Lesson Sessions — FUTURA

-   Registrar cada instancia concreta de una clase impartida.
-   Fecha, estudiante y notas de la sesión.

### Fase 6 — Content Reuse — FUTURA

-   Reutilizar actividades entre clases.
-   Biblioteca de actividades.
-   Plantillas.

### Fase 7 — AI Assisted Creation — FUTURA

-   Generación de actividades y clases mediante IA.
-   Personalización a partir de la información del estudiante.

Cada fase depende de la validación de la anterior y se desarrolla de forma
incremental.

------------------------------------------------------------------------

## 17. Criterios de éxito

El producto habrá cumplido su objetivo si permite comprobar que:

-   Un profesor puede crear una clase sin instrucciones externas.
-   Preparar la clase es más rápido que hacerlo manualmente. *(reducción del
    tiempo de preparación)*
-   La estructura generada/creada resulta útil y **las clases se pueden crear
    y reutilizar con facilidad**.
-   El profesor puede modificar fácilmente el contenido.
-   El Lesson Player **se puede utilizar durante una clase real**.
-   **Es posible organizar las clases en función de los estudiantes.**
-   **Almacenar información relevante de cada estudiante aporta valor**.
-   Los usuarios desean reutilizar la aplicación para preparar nuevas clases.

El objetivo inicial **no es conseguir una gran cantidad de
funcionalidades**, sino validar que el flujo principal aporta valor.

------------------------------------------------------------------------

## 18. Principios de desarrollo

1.  Mantener pequeño el alcance.
2.  Priorizar el flujo completo sobre funcionalidades aisladas.
3.  No introducir IA hasta que aporte una ventaja clara.
4.  Evitar abstracciones prematuras.
5.  Diseñar primero para profesores individuales.
6.  Construir componentes reutilizables para las actividades.
7.  Validar cada nueva funcionalidad con un caso de uso real.
8.  Mantener separadas la lógica de dominio y la infraestructura.
9.  Priorizar facilidad de uso sobre personalización avanzada.
10. Documentar las decisiones técnicas importantes.

------------------------------------------------------------------------

## 19. Preguntas pendientes

Decisiones que deberán resolverse durante el desarrollo:

-   Nombre definitivo del producto.
-   Librería de componentes UI (el proyecto usa por ahora CSS propio).
-   Proveedor de hosting para la API.
-   Proveedor de PostgreSQL.
-   Modelo definitivo para los distintos tipos de actividad.
-   Estrategia de almacenamiento del contenido de actividades.
-   Necesidad de drag & drop para ordenar actividades.
-   Implementación inicial de autenticación.
-   **Modelo definitivo de `Student` y necesidad real de `LessonAssignment`
    en la Fase 4** (ver [SPEC 04](docs/student-management.md)).
-   **Cómo se materializa la asignación de clases: entidad intermedia o
    relación directa, según lo que exija la SPEC.**
-   Proveedor de IA para versiones futuras.
-   Proveedor de Text-to-Speech.
-   Estrategia de monetización, si el producto se valida.

------------------------------------------------------------------------

## 20. Visión a largo plazo

La visión del proyecto es evolucionar de un simple creador de lecciones
a un **workspace para profesores de español**, donde sea posible
preparar, organizar, impartir, reutilizar y personalizar clases desde un
mismo lugar, teniendo en cuenta a los estudiantes.

La evolución esperada sería:

``` text
Class Builder
      ↓
Lesson Player
      ↓
Student Management
      ↓
Lesson Sessions / History
      ↓
Content Reuse
      ↓
AI Assisted Creation
      ↓
Homework & Progress
      ↓
Complete Teaching Workspace
```

La **IA se mantiene como una capa posterior**: primero se valida el flujo
manual completo (crear, impartir, organizar por estudiante y reutilizar) y
sólo después se añade la generación automática.

La información del estudiante será especialmente relevante para una futura
generación personalizada. Por ejemplo:

``` text
Crear una clase B1 para Carlos
```

podría utilizar:

-   nivel;
-   idioma nativo;
-   intereses;
-   objetivos;
-   notas del profesor;
-   historial de clases.

Esto pertenece al futuro y **no debe implementarse ahora**.

El desarrollo deberá realizarse incrementalmente y cada nueva etapa
dependerá de la validación de la anterior.


## Documentación de las especificaciones

| SPEC | Documento | Estado |
| --- | --- | --- |
| Fase 1 | [Base implementada](docs/phase-1.md) | Implementada |
| SPEC 01 | [Gestión de clases](docs/class-management.md) | Implementada |
| SPEC 02 | [Editor de actividades](docs/activity-editor.md) | Implementada |
| SPEC 03 | [Reproductor de clases](specs/03-reproductor-de-clases.md) | Implementada |
| SPEC 04 | [Student Management](docs/student-management.md) | Documentada — sin implementar |

-   [Fase 1 — Base](docs/phase-1.md): arranque de la aplicación y decisiones
    técnicas iniciales.
-   [SPEC 01 — Gestión de clases](docs/class-management.md): crear, editar,
    duplicar, restaurar y eliminar clases, límites del MVP y sus pruebas.
-   [SPEC 02 — Editor de actividades](docs/activity-editor.md): agregar,
    editar, quitar y reordenar actividades, reglas de duración y contenido.
-   [SPEC 03 — Reproductor de clases](specs/03-reproductor-de-clases.md):
    impartición de una clase actividad por actividad.
-   [SPEC 04 — Student Management](docs/student-management.md): modelo
    conceptual, entidad `Student`, asignación de clases y reglas de negocio
    de la próxima fase.
