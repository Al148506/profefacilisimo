using Profefacilisimo.Application.Lessons;
using System.Security.Claims;
using Profefacilisimo.Application;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Api;

public static class LessonEndpoints
{
    public static void MapLessonEndpoints(this WebApplication app)
    {
        var lessons = app.MapGroup("/api/lessons").RequireAuthorization();
        lessons.MapGet("", List);
        lessons.MapGet("/{id:guid}", Details);
        lessons.MapPost("", Create);
        lessons.MapPut("/{id:guid}", Update);
        lessons.MapPost("/{id:guid}/duplicate", Duplicate);
    }

    private static async Task<IResult> List(ClaimsPrincipal principal, ILessonReader reader,
        string? state, string? search, string? level, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var userId) || userId == Guid.Empty)
            return Results.Unauthorized();
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

    private static async Task<IResult> Details(Guid id, ClaimsPrincipal principal, ILessonReader reader, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var userId) || userId == Guid.Empty)
            return Results.Unauthorized();
        var lesson = await reader.GetOwnedDetailsAsync(id, userId, ct);
        return lesson is null ? Results.Problem(statusCode: 404, title: "Clase no encontrada.") : Results.Ok(lesson);
    }

    private static async Task<IResult> Create(SaveLessonRequest request, ClaimsPrincipal principal, ILessonService service, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var userId) || userId == Guid.Empty)
            return Results.Unauthorized();
        var result = await service.CreateAsync(userId, request, ct);
        if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
        return Results.Created($"/api/lessons/{result.Details!.Id}", result.Details);
    }

    private static async Task<IResult> Update(Guid id, SaveLessonRequest request, ClaimsPrincipal principal, ILessonService service, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var userId) || userId == Guid.Empty)
            return Results.Unauthorized();
        var result = await service.UpdateAsync(id, userId, request, ct);
        if (result.Errors is not null) return Results.ValidationProblem(result.Errors);
        return result.Details is null
            ? Results.Problem(statusCode: 404, title: "Clase no encontrada.")
            : Results.Ok(result.Details);
    }

    private static async Task<IResult> Duplicate(Guid id, ClaimsPrincipal principal, ILessonService service, CancellationToken ct)
    {
        if (!Guid.TryParse(principal.FindFirstValue("sub"), out var userId) || userId == Guid.Empty)
            return Results.Unauthorized();
        var copy = await service.DuplicateAsync(id, userId, ct);
        return copy is null
            ? Results.Problem(statusCode: 404, title: "Clase no encontrada.")
            : Results.Created($"/api/lessons/{copy.Id}", copy);
    }
}
