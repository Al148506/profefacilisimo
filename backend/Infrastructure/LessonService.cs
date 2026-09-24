using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Profefacilisimo.Application.Lessons;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Infrastructure;

public sealed class LessonService(AppDbContext db) : ILessonService
{
    public async Task<LessonSaveResult> CreateAsync(Guid userId, SaveLessonRequest request, CancellationToken ct)
    {
        // POST may omit the activity set: a lesson is allowed to start empty.
        var (drafts, errors) = Validate(request, requireActivities: false, new HashSet<Guid>());
        if (errors.Count > 0) return new(null, errors);
        var lesson = new Lesson(userId, request.Title, ParseLevel(request.Level), request.Topic, request.Objective, drafts);
        // The new lesson and its activities enter the graph together as Added, so one insert covers both.
        db.Lessons.Add(lesson);
        await db.SaveChangesAsync(ct);
        return new(LessonReader.ToDetails(lesson));
    }

    public async Task<LessonSaveResult> UpdateAsync(Guid lessonId, Guid userId, SaveLessonRequest request, CancellationToken ct)
    {
        var lesson = await db.Lessons.Include(x => x.Activities)
            .SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId && x.DeletedAt == null, ct);
        // A foreign, missing or trashed lesson is a 404 even when the body itself is invalid.
        if (lesson is null) return new(null);

        // PUT carries the complete set: an omitted array is rejected instead of deleting everything.
        var (drafts, errors) = Validate(request, requireActivities: true, lesson.Activities.Select(x => x.Id).ToHashSet());
        if (errors.Count > 0) return new(null, errors);

        // Metadata, deletions, insertions, order and total move together: either the whole save is
        // visible or none of it is.
        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var requested = drafts.Where(x => x.Id is not null).Select(x => x.Id!.Value).ToHashSet();
        // An activity the request omits is deleted, so the set to remove is captured before applying.
        var removed = lesson.Activities.Where(x => !requested.Contains(x.Id)).ToArray();

        // Phase 1 of the order: the unique (LessonId, Order) index admits no transient collision, so
        // the persisted activities move above every final position before the final pass. Both halves
        // run inside this transaction, so no reader observes the parked positions.
        lesson.ParkActivityOrder(drafts.Count);
        await db.SaveChangesAsync(ct);

        // Phase 2: final consecutive positions, deletions, insertions and the recalculated total.
        var created = lesson.ApplyActivities(drafts);
        lesson.UpdateMetadata(request.Title, ParseLevel(request.Level), request.Topic, request.Objective);
        db.Activities.RemoveRange(removed);
        // Activities created for an already tracked lesson would otherwise be discovered as Modified
        // (their Guid key is ValueGeneratedOnAdd and already set), which emits an UPDATE affecting no
        // rows. Registering them explicitly turns them into INSERTs.
        db.Activities.AddRange(created);
        await db.SaveChangesAsync(ct);

        var details = LessonReader.ToDetails(lesson);
        await transaction.CommitAsync(ct);
        return new(details);
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

    // Validates the metadata and the whole activity set before anything is written. One invalid
    // activity rejects the entire save, and its error key points at the exact activity and field,
    // for example `activities[2].content`. `ownedActivityIds` holds the activities of the lesson
    // being saved, so a foreign or unknown Id is rejected instead of being read as a new activity.
    private static (IReadOnlyList<ActivityDraft> Drafts, Dictionary<string, string[]> Errors) Validate(
        SaveLessonRequest request, bool requireActivities, IReadOnlySet<Guid> ownedActivityIds)
    {
        var errors = new Dictionary<string, string[]>();
        CheckText(request.Title, 200, "title", errors);
        CheckText(request.Topic, 200, "topic", errors);
        CheckText(request.Objective, 2000, "objective", errors);
        if (request.Level is not ("A2" or "B1" or "B2")) errors["level"] = ["Usa A2, B1 o B2."];

        if (request.Activities is null)
        {
            // An absent array is never read as "delete every activity".
            if (requireActivities) errors["activities"] = ["Envía el conjunto completo de actividades."];
            return ([], errors);
        }

        var drafts = new List<ActivityDraft>(request.Activities.Count);
        var seen = new HashSet<Guid>();
        for (var index = 0; index < request.Activities.Count; index++)
        {
            var input = request.Activities[index];
            var key = $"activities[{index}]";
            if (input is null)
            {
                errors[key] = ["Actividad no válida."];
                continue;
            }
            CheckText(input.Title, 200, key + ".title", errors);
            CheckText(input.Instructions, 2000, key + ".instructions", errors);
            if (input.EstimatedDuration <= 0)
                errors[key + ".estimatedDuration"] = ["Indica una duración en minutos enteros mayor que cero."];
            if (input.Id is { } id)
            {
                if (!seen.Add(id)) errors[key + ".id"] = ["La misma actividad aparece más de una vez."];
                else if (!ownedActivityIds.Contains(id)) errors[key + ".id"] = ["La actividad no pertenece a esta clase."];
            }

            if (ParseActivityType(input.Type) is not { } type)
            {
                errors[key + ".type"] = ["Usa Speaking, Reading, Writing o VocabularyGrammar."];
                continue;
            }
            var (content, contentError) = ReadContent(type, input.Content);
            if (content is null)
            {
                errors[key + ".content"] = [contentError];
                continue;
            }
            drafts.Add(new ActivityDraft(input.Id, input.Title, input.Instructions, content, input.EstimatedDuration));
        }
        return (drafts, errors);
    }

    // Reads the request JSON as the domain content of the declared type, then applies the domain
    // rules, which are the authoritative ones and mirror the limits the editor checks in Zod.
    private static (ActivityContent? Content, string Error) ReadContent(ActivityType type, JsonElement content)
    {
        if (content.ValueKind != JsonValueKind.Object)
            return (null, "Envía el objeto de contenido del tipo indicado.");
        try
        {
            var parsed = ActivityContent.Read(type, content);
            parsed.Validate();
            return (parsed, "");
        }
        catch (Exception exception) when (exception is JsonException or ArgumentException)
        {
            return (null, "El contenido no cumple las reglas del tipo indicado.");
        }
    }

    private static ActivityType? ParseActivityType(string? type) => type switch
    {
        "Speaking" => ActivityType.Speaking, "Reading" => ActivityType.Reading,
        "Writing" => ActivityType.Writing, "VocabularyGrammar" => ActivityType.VocabularyGrammar,
        _ => null
    };

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
