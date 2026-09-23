using Microsoft.EntityFrameworkCore;
using Profefacilisimo.Application.Lessons;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Infrastructure;

public sealed class LessonService(AppDbContext db) : ILessonService
{
    public async Task<LessonSaveResult> CreateAsync(Guid userId, SaveLessonRequest request, CancellationToken ct)
    {
        var errors = Validate(request);
        if (errors.Count > 0) return new(null, errors);
        var lesson = new Lesson(userId, request.Title, ParseLevel(request.Level), request.Topic, request.Objective);
        db.Lessons.Add(lesson);
        await db.SaveChangesAsync(ct);
        return new(LessonReader.ToDetails(lesson));
    }

    public async Task<LessonSaveResult> UpdateAsync(Guid lessonId, Guid userId, SaveLessonRequest request, CancellationToken ct)
    {
        var lesson = await db.Lessons.Include(x => x.Activities)
            .SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId && x.DeletedAt == null, ct);
        if (lesson is null) return new(null);
        var errors = Validate(request);
        if (errors.Count > 0) return new(null, errors);
        lesson.UpdateMetadata(request.Title, ParseLevel(request.Level), request.Topic, request.Objective);
        await db.SaveChangesAsync(ct);
        return new(LessonReader.ToDetails(lesson));
    }

    public async Task<LessonDetailsDto?> DuplicateAsync(Guid lessonId, Guid userId, CancellationToken ct)
    {
        // A stable snapshot covers both the source graph and insertion of the independent copy.
        await using var transaction = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var source = await db.Lessons.AsNoTracking().Include(x => x.Activities)
            .SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId && x.DeletedAt == null, ct);
        if (source is null) return null;
        var copy = source.Duplicate();
        db.Lessons.Add(copy);
        await db.SaveChangesAsync(ct);
        var details = LessonReader.ToDetails(copy);
        await transaction.CommitAsync(ct);
        return details;
    }

    public async Task<LessonTransitionResult> TrashAsync(Guid lessonId, Guid userId, CancellationToken ct)
    {
        var lesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId, ct);
        if (lesson is null) return LessonTransitionResult.NotFound;
        if (lesson.DeletedAt is not null) return LessonTransitionResult.InvalidState;
        lesson.MoveToTrash();
        await db.SaveChangesAsync(ct);
        return LessonTransitionResult.Success;
    }

    public async Task<LessonTransitionResult> RestoreAsync(Guid lessonId, Guid userId, CancellationToken ct)
    {
        var lesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId, ct);
        if (lesson is null) return LessonTransitionResult.NotFound;
        if (lesson.DeletedAt is null) return LessonTransitionResult.InvalidState;
        lesson.Restore();
        await db.SaveChangesAsync(ct);
        return LessonTransitionResult.Success;
    }

    public async Task<LessonTransitionResult> DeleteAsync(Guid lessonId, Guid userId, CancellationToken ct)
    {
        var lesson = await db.Lessons.SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId, ct);
        if (lesson is null) return LessonTransitionResult.NotFound;
        if (lesson.DeletedAt is null) return LessonTransitionResult.InvalidState;
        // Do not load children: PostgreSQL's existing FK cascade removes the activities.
        db.Lessons.Remove(lesson);
        await db.SaveChangesAsync(ct);
        return LessonTransitionResult.Success;
    }

    private static Dictionary<string, string[]> Validate(SaveLessonRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        CheckText(request.Title, 200, "title", errors);
        CheckText(request.Topic, 200, "topic", errors);
        CheckText(request.Objective, 2000, "objective", errors);
        if (request.Level is not ("A2" or "B1" or "B2")) errors["level"] = ["Usa A2, B1 o B2."];
        return errors;
    }

    private static void CheckText(string? value, int max, string field, Dictionary<string, string[]> errors)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length > max)
            errors[field] = [$"Campo obligatorio de máximo {max} caracteres."];
    }

    private static LessonLevel ParseLevel(string level) => level switch
    {
        "A2" => LessonLevel.A2, "B1" => LessonLevel.B1, "B2" => LessonLevel.B2,
        _ => throw new ArgumentException("Unsupported level.", nameof(level))
    };
}
