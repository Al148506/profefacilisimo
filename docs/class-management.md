# Gestión de clases — SPEC 01

## Uso
1. Inicia sesión. **Mis clases** muestra tus clases activas, más recientes primero.
2. Busca por título y combina con A2/B1/B2. Pulsa **Buscar**; **Limpiar filtros** vuelve al listado completo. Los filtros son locales, sin URL.
3. **Crear clase** solicita título, nivel, tema y objetivo. Título/tema admiten 200 caracteres y objetivo 2000; se recortan espacios. No necesitas actividades.
4. **Guardar** crea la clase y abre su editor. **Editar** modifica los metadatos y, desde SPEC 02, también las actividades y sus duraciones: ver [activity-editor.md](activity-editor.md).
5. **Duplicar** copia los datos persistidos y actividades con nuevos IDs y abre la copia. Si falla la red, revisa el listado antes de repetir: podría haberse completado.
6. **Enviar a papelera** pide confirmación y conserva clase/actividades.
7. En **Papelera**, **Restaurar** pide confirmación y conserva los IDs. No hay caducidad automática.
8. **Eliminar definitivamente** solo está disponible en papelera; advierte que se perderán la clase y todas sus actividades. No se puede deshacer.

## Límites deliberados
- Guardado explícito, sin autoguardado ni borradores en almacenamiento local.
- Aviso de descarte al volver desde el editor o pulsar la marca. Cerrar/recargar puede mostrar el aviso nativo; no se interceptan todos los mecanismos de navegación.
- Cambios entre pestañas usan last write wins, sin versiones ni detección de conflictos.
- Sin paginación. El editor de actividades y el total calculado por duración son de SPEC 02: ver [activity-editor.md](activity-editor.md).
- Sin reintentos automáticos de escrituras ante errores de red; renovación de sesión una vez ante un 401 explícito.

## Desarrollo y pruebas
Configuración local: [Fase 1](phase-1.md). No cambian SDK, dependencias ni arquitectura.

    dotnet restore Profefacilisimo.slnx
    dotnet build Profefacilisimo.slnx --no-restore -c Release
    ./scripts/Test.ps1 -Configuration Release
    ./scripts/Test-E2E.ps1 -Configuration Release

Los scripts aceptan Debug (por defecto) o Release. Release permite probar sin detener la API Debug en Visual Studio.
Integración usa bases efímeras pf_test_*; E2E usa pf_e2e_*, aplica migraciones y levanta API dedicada en 5081. Se eliminan al terminar. Las pruebas no siembran ni migran la base de desarrollo.
Para usar cambios en desarrollo, aplica la migración local siguiendo Fase 1. AddLessonSoftDelete solo añade DeletedAt nullable; los datos previos quedan activos.

## Evidencia de aceptación
Numeración de las 24 casillas de la sección 10 de SPEC 01. La revisión humana del diff y aprobación final siguen pendientes.

| Criterios | Evidencia |
| --- | --- |
| 1–4: JWT, propietarios, 404, UserId | LessonManagementTests: autorización en GET/POST/PUT/duplicate/trash/restore/delete, dos usuarios y campos extras ignorados |
| 5–6: listado, orden y filtros | ListIsPrivateUnpaginatedAndOrderedWithStableTies, SearchTrimsIgnoresCaseAndCombinesWithLevel, búsqueda SQL literal y E2E |
| 7–10: creación, validación, edición selectiva y sin versiones | Domain.Tests, POST/PUT integración, LessonEditorPage.test.tsx y E2E crear/editar/recargar |
| 11–13: copia, independencia y rollback | DuplicateCopiesPersistedGraphWithNewIdsAndIndependentMetadata, DuplicateRollsBackWhenFailureOccursAfterInsertsBeforeCommit y E2E |
| 14–17: papelera/restauración/cascada | TrashRestoreAndPermanentDeletePreserveThenCascadeOnlyTarget, migración y E2E |
| 18: cancelar y estados inválidos | UI/E2E cancelan trash/restore/delete; InvalidTransitionsReturn409AndLeaveDataUnchanged |
| 19–21: vacíos, pending, errores y borrador | LessonsPage.test.tsx, LessonEditorPage.test.tsx, E2E con respuesta duplicación retenida y descarte cancelado |
| 22: migración preserva datos | LessonMigrationTests compara filas/JSONB/índices, downgrade/reupgrade, DeletedAt null |
| 23: sesión | AuthTests/AuthHardeningTests/RateLimitTests y session.spec.ts |
| 24: sin edición individual de actividades | DTO y formulario limitados a cuatro metadatos; ninguna ruta de edición individual añadida |

Las pruebas comprueban actividades existentes, aunque este MVP no permite crearlas desde la interfaz.
Antes de implementar SPEC 02 deben revisarse sus referencias antiguas a Version/ETag/If-Match.
