# SPEC 04 — Student Management

> **Estado:** Borrador (propuesta conceptual)
> **Depende de:** SPEC 01 — Gestión de clases; SPEC 02 — Editor de actividades; SPEC 03 — Lesson Player.
> **Fecha:** 2026-09-28
> **Objetivo:** Permitir que el profesor mantenga información básica sobre sus estudiantes y pueda
> asociar clases existentes con ellos, sin convertir el producto en un sistema de gestión educativa.
> **Nota:** este documento define el alcance y el modelo conceptual. **No se implementa todavía
> ningún cambio de código, entidad, migración, endpoint ni componente.**

---

## 1. Objetivo

Permitir que el profesor mantenga información básica sobre sus estudiantes y pueda asociar clases
existentes con ellos.

Hasta ahora el producto resuelve **preparar** una clase (Fase 2) e **impartirla** (Fase 3), pero trata
cada clase como una pieza aislada: no hay forma de registrar para quién se prepara, ni de agrupar el
trabajo alrededor de una persona. Esta especificación introduce la base mínima para que el profesor
pueda pensar en su trabajo **en función de sus alumnos**.

El objetivo es **organizar y personalizar la preparación**, no gestionar la trayectoria académica del
estudiante.

---

## 2. Alcance

### Incluido

- CRUD de estudiantes (crear, consultar, editar, eliminar).
- Perfil del estudiante.
- Información pedagógica básica: nivel, idioma nativo, objetivos, intereses y notas del profesor.
- Asignación de clases existentes a estudiantes.
- Visualización de las clases asignadas desde el perfil del estudiante.
- Visualización de los estudiantes asociados desde el detalle de una clase.

### No incluido

- Sesiones (`LessonSession`) y fechas de impartición.
- Historial detallado y línea temporal por estudiante.
- Homework y tareas asignadas.
- Progreso y analíticas de aprendizaje.
- Vocabulario del estudiante.
- IA personalizada.
- Calendario y programación de clases.
- Notificaciones y recordatorios.
- Portal o acceso del estudiante: el estudiante **no** es un usuario del sistema.

---

## 3. Modelo conceptual

### 3.1 Estado actual (implementado)

```text
User
 ├── Students        ← propuesto en SPEC 04
 │
 └── Lessons
       └── Activities
```

`Students` cuelga directamente del profesor, en paralelo a `Lessons`. Un estudiante **no** contiene
clases; una clase **no** contiene estudiantes.

### 3.2 Relación futura entre Student y Lesson

```text
Student
   ↕
LessonAssignment
   ↕
Lesson
```

La relación entre una clase y un estudiante se representa mediante una entidad intermedia,
`LessonAssignment`, y **no** como una clave foránea directa.

### 3.3 Decisión de dominio: una `Lesson` no pertenece a un único estudiante

Una clase **no** debe pertenecer necesariamente a un único estudiante. Una misma clase puede
reutilizarse con varios estudiantes:

```text
Lesson
"B1 - Pretérito vs Imperfecto"
       │
       ├── Student A
       ├── Student B
       └── Student C
```

Por esta razón **se evita diseñar conceptualmente `StudentId` dentro de `Lesson`** como si una clase
solo pudiera pertenecer a un alumno. Un campo `StudentId` en `Lesson` sería una relación 1:N que
haría imposible reutilizar la clase y obligaría a duplicarla por cada estudiante.

La relación N:M se modela, cuando llegue el momento, con una entidad intermedia:

```text
LessonAssignment
├── Id
├── StudentId
├── LessonId
├── AssignedAt
└── Status
```

**No se implementa `LessonAssignment` todavía**, salvo que sea estrictamente necesario para resolver
la asignación de clases descrita en el apartado 5. Si en la implementación se confirma que hace falta,
debe introducirse como entidad propia y no como campo en `Lesson` ni en `Student`.

---

## 4. Entidad `Student`

Propuesta inicial de propiedades. **No son definitivas**: podrán ajustarse durante la implementación
de la SPEC sin cambiar el modelo conceptual.

| Campo            | Propósito                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| `Id`             | Identificador único del estudiante.                                        |
| `Name`           | Nombre con el que el profesor reconoce al estudiante.                      |
| `Email`          | Contacto opcional del estudiante; no es una cuenta ni un login.            |
| `Level`          | Nivel MCER/CEFR actual (A2/B1/B2, alineado con `Lesson.Level`).            |
| `NativeLanguage` | Lengua materna, útil para anticipar interferencias al preparar la clase.   |
| `Interests`      | Temas que motivan al estudiante, para elegir contextos y ejemplos.         |
| `Goals`          | Objetivos de aprendizaje declarados por el estudiante.                     |
| `Notes`          | Notas libres del profesor sobre el estudiante.                             |
| `CreatedAt`      | Fecha de alta (UTC).                                                       |
| `UpdatedAt`      | Fecha de última modificación (UTC).                                        |

### Deliberadamente fuera del modelo

El sistema debe almacenar **únicamente información relevante para preparar clases**. No se añaden:

- Teléfono.
- Dirección.
- Información financiera (tarifas, pagos, facturación).
- Información médica o de salud.
- Cualquier otro dato excesivamente personal.

**No se afirma** que estos sean los campos definitivos de la tabla; son la propuesta inicial. El nivel,
por ejemplo, podría evolucionar hacia un historial de niveles con el tiempo, y los intereses podrían
estructurarse como lista. Cualquier ajuste se decidirá al implementar la SPEC.

---

## 5. Casos de uso

| Caso de uso                                    | Descripción                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Crear estudiante                               | Alta con los datos básicos del apartado 4.                                  |
| Editar estudiante                              | Modificar cualquier campo del perfil.                                       |
| Consultar estudiante                           | Ver el perfil con su información pedagógica y sus clases asignadas.         |
| Eliminar estudiante                            | Dar de baja al estudiante sin afectar a las clases.                         |
| Asignar clase                                  | Asociar una clase existente a un estudiante.                                |
| Quitar asignación                              | Desasociar una clase de un estudiante sin borrar la clase.                  |
| Ver clases asignadas                           | Desde el perfil del estudiante, listar las clases que tiene asignadas.      |
| Ver estudiantes asociados a una clase          | Desde el detalle de una clase, listar los estudiantes que la tienen asignada. |

La asignación se realiza siempre **desde una clase existente**: esta SPEC no incluye crear clases
desde el perfil del estudiante.

---

## 6. UX propuesta

Pantallas principales y su navegación. **No se definen detalles visuales concretos**: se reutilizan
los componentes, el estilo y el patrón de rutas protegidas existentes.

### 6.1 Carril de estudiantes

```text
Dashboard
   ↓
Students
   ↓
Student Profile
```

- **Students:** listado de estudiantes del profesor.
- **Student Profile:** perfil con información pedagógica y clases asignadas.

### 6.2 Carril de clases (punto de entrada a la asignación)

```text
Dashboard
   ↓
Lessons
   ↓
Lesson
   ↓
Assigned Students
```

- El detalle de la clase incorpora una sección de **estudiantes asignados**, con la acción de asignar
  y quitar asignaciones.

Ambos carriles son simétricos: la relación clase ↔ estudiante se puede leer y gestionar desde los dos
lados.

---

## 7. Reglas de negocio

1. Un profesor solo puede acceder a **sus propios** estudiantes.
2. Un estudiante **pertenece a un profesor**.
3. Una clase **pertenece a un profesor**.
4. Una clase **puede ser reutilizada con múltiples estudiantes**.
5. Un estudiante **puede tener múltiples clases asignadas**.
6. Eliminar un estudiante **no debe eliminar sus clases**.
7. Eliminar una clase **no debe eliminar al estudiante**.
8. Una clase **puede existir sin estudiantes asignados**, y un estudiante sin clases asignadas.
9. Las reglas de propiedad y aislamiento ya vigentes para `Lesson` (SPEC 01) se extienden a `Student`.

---

## 8. Dependencias

Esta SPEC depende de:

- **Autenticación** (SPEC 01): registro, login, sesión y `User`.
- **`User`**: propietario de estudiantes y clases.
- **`Lesson`** (SPEC 01): clases que se asignan.
- **`Activity`** (SPEC 02): contenido de las clases asignadas; no se modifica.

Las **Fases 1, 2 y 3 ya están implementadas**: la base, la gestión de clases, el editor de actividades
y el Lesson Player. `Student` es la primera entidad nueva desde la Fase 1.

---

## 9. Funcionalidades futuras relacionadas

Documentadas aquí **sin implementarlas**, para mantener la coherencia del modelo:

- **`LessonAssignment`** — entidad intermedia entre `Student` y `Lesson`. Se implementará si la
  asignación de clases lo requiere (ver apartado 3.3).
- **`LessonSession`** — instancia concreta de una clase impartida a un estudiante en una fecha.
  Ver apartados 7 y 8 de la documentación principal.
- **`StudentProgress`** — seguimiento del avance del estudiante.
- **`Homework`** — tareas asignadas al estudiante.
- **`StudentVocabulary`** — vocabulario trabajado por el estudiante.
- **IA Personalization** — generación de clases a partir del perfil del estudiante (nivel, idioma
  nativo, intereses, objetivos, notas, historial). Pertenecen al futuro y **no deben implementarse
  ahora**.

```text
Student
 └── (futuro) LessonAssignment → LessonSession
                              → StudentProgress
                              → Homework
                              → StudentVocabulary
                              → AI Personalization
```

---

## 10. Diferenciación por estado

### Actualmente implementado

```text
User
Lesson
Activity
```

### Próxima funcionalidad (SPEC 04)

```text
Student
Lesson ↔ Student
```

### Funcionalidad futura

```text
LessonSession
StudentProgress
Homework
StudentVocabulary
```

---

## 11. Preservación del alcance

Esta SPEC no autoriza, por sí misma:

- Implementar código, migraciones ni entidades.
- Modificar las funcionalidades de las Fases 1–3.
- Convertir Student Management en un CRM o en un LMS.
- Implementar `LessonSession`, IA o cualquier elemento de la sección 9.

Su única contribución es fijar el **modelo conceptual** de la Fase 4 antes de escribir código.
