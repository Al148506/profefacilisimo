using System.Security.Claims;
using Profefacilisimo.Application.Students;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Api;

public static class StudentEndpoints
{
    public static void MapStudentEndpoints(this WebApplication app)
    {
        var students = app.MapGroup("/api/students").RequireAuthorization();
        students.MapGet("", List);
        students.MapGet("/{id:guid}", Details);
        students.MapPost("", Create);
        students.MapPut("/{id:guid}", Update);
        students.MapPost("/{id:guid}/trash", Trash);
        students.MapPost("/{id:guid}/restore", Restore);
        students.MapDelete("/{id:guid}", Delete);

        // The four assignment endpoints are two symmetric route pairs with the same semantics. Each
        // route is registered under the resource it starts from, and all four share one service.
        students.MapGet("/{id:guid}/lessons", AssignedLessons);
        students.MapPost("/{id:guid}/lessons", AssignLesson);
        students.MapDelete("/{id:guid}/lessons/{lessonId:guid}", UnassignLesson);

        var lessons = app.MapGroup("/api/lessons").RequireAuthorization();
        lessons.MapGet("/{id:guid}/students", AssignedStudents);
        lessons.MapPost("/{id:guid}/students", AssignStudent);
        lessons.MapDelete("/{id:guid}/students/{studentId:guid}", UnassignStudent);
    }

    private static async Task<IResult> List(ClaimsPrincipal principal, IStudentReader reader,
        string? state, string? search, string? level, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        state ??= "active";
        if (state is not ("active" or "trash"))
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["state"] = ["Usa active o trash."] });
        LessonLevel? parsedLevel = null;
        if (state == "active")
        {
            search = search?.Trim();
            level = level?.Trim();
            var errors = new Dictionary<string, string[]>();
            if (search?.Length > 200) errors["search"] = ["Máximo 200 caracteres."];
            if (!string.IsNullOrEmpty(level))
            {
                parsedLevel = level switch { "A2" => LessonLevel.A2, "B1" => LessonLevel.B1, "B2" => LessonLevel.B2, _ => null };
                if (parsedLevel is null) errors["level"] = ["Usa A2, B1 o B2."];
            }
            if (errors.Count > 0) return Results.ValidationProblem(errors);
        }
        return Results.Ok(await reader.ListOwnedAsync(userId, state == "trash", search, parsedLevel, ct));
    }

    private static async Task<IResult> Details(Guid id, ClaimsPrincipal principal, IStudentReader reader, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        var student = await reader.GetOwnedDetailsAsync(id, userId, ct);
        return student is null ? StudentNotFound() : Results.Ok(student);
    }

    private static async Task<IResult> Create(SaveStudentRequest request, ClaimsPrincipal principal,
        IStudentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        var result = await service.CreateAsync(userId, request, ct);
        if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
        return Results.Created($"/api/students/{result.Details!.Id}", result.Details);
    }

    private static async Task<IResult> Update(Guid id, SaveStudentRequest request, ClaimsPrincipal principal,
        IStudentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        var result = await service.UpdateAsync(id, userId, request, ct);
        if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
        return result.Details is null ? StudentNotFound() : Results.Ok(result.Details);
    }

    private static async Task<IResult> Trash(Guid id, ClaimsPrincipal principal, IStudentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        return TransitionResponse(await service.TrashAsync(id, userId, ct));
    }

    private static async Task<IResult> Restore(Guid id, ClaimsPrincipal principal, IStudentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        return TransitionResponse(await service.RestoreAsync(id, userId, ct));
    }

    private static async Task<IResult> Delete(Guid id, ClaimsPrincipal principal, IStudentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        return TransitionResponse(await service.DeleteAsync(id, userId, ct));
    }

    // Assigning the student of the route's lesson. `{ lessonId }` is the lesson, `{ studentId }` the body.
    private static async Task<IResult> AssignStudent(Guid id, AssignStudentRequest request, ClaimsPrincipal principal,
        ILessonAssignmentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        var result = await service.AssignStudentAsync(id, request.StudentId, userId, ct);
        return AssignmentResponse(result, value => Results.Created(
            $"/api/lessons/{id}/students/{value.Id}", value));
    }

    private static async Task<IResult> AssignLesson(Guid id, AssignLessonRequest request, ClaimsPrincipal principal,
        ILessonAssignmentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        var result = await service.AssignLessonAsync(id, request.LessonId, userId, ct);
        return AssignmentResponse(result, value => Results.Created(
            $"/api/students/{id}/lessons/{value.Id}", value));
    }

    private static async Task<IResult> UnassignStudent(Guid id, Guid studentId, ClaimsPrincipal principal,
        ILessonAssignmentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        return RemovalResponse(await service.UnassignStudentAsync(id, studentId, userId, ct));
    }

    private static async Task<IResult> UnassignLesson(Guid id, Guid lessonId, ClaimsPrincipal principal,
        ILessonAssignmentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        return RemovalResponse(await service.UnassignLessonAsync(id, lessonId, userId, ct));
    }

    private static async Task<IResult> AssignedStudents(Guid id, ClaimsPrincipal principal,
        ILessonAssignmentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        var assigned = await service.ListStudentsOfLessonAsync(id, userId, ct);
        return assigned is null ? LessonNotFound() : Results.Ok(assigned);
    }

    private static async Task<IResult> AssignedLessons(Guid id, ClaimsPrincipal principal,
        ILessonAssignmentService service, CancellationToken ct)
    {
        if (!TryUser(principal, out var userId)) return Results.Unauthorized();
        var assigned = await service.ListLessonsOfStudentAsync(id, userId, ct);
        return assigned is null ? StudentNotFound() : Results.Ok(assigned);
    }

    private static bool TryUser(ClaimsPrincipal principal, out Guid userId) =>
        Guid.TryParse(principal.FindFirstValue("sub"), out userId) && userId != Guid.Empty;

    private static IResult TransitionResponse(StudentTransitionResult result) => result switch
    {
        StudentTransitionResult.Success => Results.NoContent(),
        StudentTransitionResult.NotFound => StudentNotFound(),
        StudentTransitionResult.InvalidState => Results.Problem(statusCode: 409,
            title: "El estudiante no está en el estado requerido para esta operación."),
        _ => throw new ArgumentOutOfRangeException(nameof(result))
    };

    // An idempotent assignment returns 201 with the row that already existed, so repeating the action
    // from either screen never fails and never creates a second row. A trashed entity is a 400 with a
    // message that explains it instead of a silent success.
    private static IResult AssignmentResponse<T>(AssignmentResult<T> result, Func<T, IResult> created)
    {
        if (result.NotFound) return Results.Problem(statusCode: 404, title: "El estudiante o la clase no existe o no está disponible.");
        if (result.InvalidState) return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["assignment"] = ["No puedes asignar un estudiante o una clase que está en la papelera."]
        });
        return created(result.Value!);
    }

    private static IResult RemovalResponse(AssignmentRemovalResult result) => result switch
    {
        AssignmentRemovalResult.Success => Results.NoContent(),
        AssignmentRemovalResult.NotFound => Results.Problem(statusCode: 404, title: "La asignación no existe."),
        _ => throw new ArgumentOutOfRangeException(nameof(result))
    };

    private static IResult StudentNotFound() => Results.Problem(statusCode: 404, title: "Estudiante no encontrado.");
    private static IResult LessonNotFound() => Results.Problem(statusCode: 404, title: "Clase no encontrada.");
}
