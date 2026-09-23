# Spanish Lesson Builder

Aplicación web orientada a facilitar la preparación y ejecución de
clases de español como lengua extranjera. El objetivo del MVP es
permitir que un profesor cree, organice y utilice una clase estructurada
sin tener que preparar cada actividad desde cero.

> **Estado:** Fase 1 implementada / MVP\
> **Objetivo inicial:** validar si un creador de clases estructuradas
> reduce el tiempo de preparación para profesores de español.

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

> **Crear rápidamente una clase de español estructurada y lista para
> utilizar.**

El profesor podrá seleccionar las características de la clase, organizar
actividades, editar su contenido, guardar la lección y posteriormente
utilizarla mediante una interfaz sencilla durante la sesión con el
estudiante.

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
-   Profesores con múltiples estudiantes.
-   Creadores de material educativo.
-   Estudiantes que quieran practicar independientemente.

------------------------------------------------------------------------

## 4. Alcance del MVP

El MVP se centrará en dos funcionalidades principales:

### Class Builder

Permite crear y editar una clase.

Información básica:

-   Título.
-   Nivel.
-   Tema.
-   Duración estimada.
-   Objetivo de la clase.
-   Actividades.

### Lesson Player

Permite utilizar la clase mediante una interfaz limpia durante una
sesión.

El profesor podrá avanzar entre actividades utilizando un flujo similar
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

-   .NET 10
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

## 9. Modelo de dominio inicial

Modelo conceptual simplificado:

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

Cada actividad deberá compartir propiedades básicas como:

-   Id.
-   LessonId.
-   Type.
-   Title.
-   Instructions.
-   Content.
-   Order.
-   EstimatedDuration.

Los campos específicos de cada actividad podrán modelarse posteriormente
conforme evolucione el MVP.

------------------------------------------------------------------------

## 10. Entidades iniciales

### User

Representa al profesor que utiliza la plataforma.

### Lesson

Representa una clase completa.

### Activity

Representa una actividad perteneciente a una clase.

Inicialmente se evitará crear entidades adicionales como Student,
Course, Classroom o Institution hasta comprobar que son necesarias.

------------------------------------------------------------------------

## 11. Funcionalidades principales del MVP

### Autenticación

-   Registro.
-   Inicio de sesión.
-   Cierre de sesión.
-   Protección de clases por usuario.

### Gestión de clases

-   Crear clase.
-   Consultar clases.
-   Editar clase.
-   Eliminar clase.
-   Duplicar clase.
-   Definir nivel.
-   Definir tema.
-   Definir objetivo.
-   Definir duración estimada.

### Gestión de actividades

-   Agregar actividades.
-   Editar actividades.
-   Eliminar actividades.
-   Ordenar actividades.
-   Seleccionar tipo de actividad.
-   Agregar instrucciones y contenido.

### Lesson Player

-   Abrir una clase.
-   Mostrar una actividad a la vez.
-   Avanzar a la siguiente actividad.
-   Regresar a la actividad anterior.
-   Mostrar progreso dentro de la clase.

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

El MVP no dependerá obligatoriamente de inteligencia artificial.

Se podrán crear plantillas y actividades manualmente para validar
primero:

1.  Si el flujo de creación resulta útil.
2.  Si el Lesson Player funciona durante una clase real.
3.  Si los profesores ahorran tiempo.
4.  Qué tipos de actividades utilizan con mayor frecuencia.

Una vez validado el flujo, la IA podrá acelerar la generación del
contenido.

------------------------------------------------------------------------

## 14. Fuera del alcance del MVP

Las siguientes funcionalidades **no forman parte de la primera
versión**:

-   Generación completa de clases mediante IA.
-   Gestión avanzada de estudiantes.
-   Cursos completos.
-   Videollamadas.
-   Pagos.
-   Suscripciones.
-   Marketplace de clases.
-   Gamificación.
-   Aplicación móvil.
-   Analíticas avanzadas.
-   Corrección automática de pronunciación.
-   Reconocimiento de voz.
-   Sistema avanzado de flashcards.
-   Integración con calendarios.
-   Gestión de academias.

Esta lista existe para proteger el alcance del MVP.

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
Teacher
 └── Students
      └── Lessons
           └── Activities
```

Posibles funciones:

-   Perfil del estudiante.
-   Nivel.
-   Intereses.
-   Clases anteriores.
-   Notas del profesor.
-   Vocabulario aprendido.
-   Objetivos.
-   Progreso.

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

## 16. Roadmap preliminar

### Fase 1 --- Base

-   Configuración frontend.
-   Configuración backend.
-   PostgreSQL.
-   Autenticación.
-   Modelo `Lesson`.
-   Modelo `Activity`.

### Fase 2 --- Class Builder

-   Crear clase.
-   Editar clase.
-   Eliminar clase.
-   Crear actividades.
-   Editar actividades.
-   Ordenarlas.

### Fase 3 --- Lesson Player

-   Mostrar actividades.
-   Navegación anterior/siguiente.
-   Indicador de progreso.
-   Vista optimizada para utilizar durante una clase.

### Fase 4 --- Contenido y validación

-   Crear clases de ejemplo.
-   Probar el flujo completo.
-   Utilizarlo en escenarios reales.
-   Recoger feedback.
-   Corregir problemas de UX.

### Fase 5 --- Primera funcionalidad inteligente

Después de validar el MVP:

-   Generación de una actividad mediante IA.

En lugar de generar inicialmente una clase completa, se recomienda
comenzar con algo limitado como:

> Generar preguntas de conversación para este tema y nivel.

Esto permitirá evaluar costes, calidad y utilidad antes de ampliar la
integración.

------------------------------------------------------------------------

## 17. Criterios de éxito del MVP

El MVP habrá cumplido su objetivo si permite comprobar que:

-   Un profesor puede crear una clase sin instrucciones externas.
-   Preparar la clase es más rápido que hacerlo manualmente.
-   La estructura generada/creada resulta útil.
-   El profesor puede modificar fácilmente el contenido.
-   El Lesson Player puede utilizarse durante una clase real.
-   Los usuarios desean reutilizar la aplicación para preparar nuevas
    clases.

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
-   Librería de componentes UI.
-   Proveedor de hosting para la API.
-   Proveedor de PostgreSQL.
-   Modelo definitivo para los distintos tipos de actividad.
-   Estrategia de almacenamiento del contenido de actividades.
-   Necesidad de drag & drop para ordenar actividades.
-   Implementación inicial de autenticación.
-   Proveedor de IA para versiones futuras.
-   Proveedor de Text-to-Speech.
-   Estrategia de monetización, si el producto se valida.

------------------------------------------------------------------------

## 20. Visión a largo plazo

La visión del proyecto es evolucionar de un simple creador de lecciones
a un **workspace para profesores de idiomas**, donde sea posible
preparar, impartir, reutilizar y personalizar clases desde un mismo
lugar.

La evolución esperada sería:

``` text
Class Builder
      ↓
Lesson Player
      ↓
AI Assisted Creation
      ↓
Student Management
      ↓
Homework & Progress
      ↓
Complete Teaching Workspace
```

El desarrollo deberá realizarse incrementalmente y cada nueva etapa
dependerá de la validación de la anterior.


## Desarrollo local — Fase 1

Consulta [la guía de implementación y pruebas](docs/phase-1.md) para arrancar la aplicación y revisar las decisiones técnicas.


## Gestión de clases — SPEC 01
Consulta [la guía de gestión de clases](docs/class-management.md) para crear, editar, duplicar, restaurar y eliminar clases, conocer los límites del MVP y ejecutar sus pruebas.
