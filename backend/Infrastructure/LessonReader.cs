using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Profefacilisimo.Application;
using Profefacilisimo.Application.Lessons;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Infrastructure;

public sealed class LessonReader(AppDbContext db) : ILessonReader
{
    public Task<LessonSummary?> FindOwnedAsync(Guid lessonId, Guid userId, CancellationToken cancellationToken) =>
        db.Lessons.AsNoTracking().Where(x => x.Id == lessonId && x.UserId == userId)
            .Select(x => new LessonSummary(x.Id, x.Title, x.Activities.Count)).SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<LessonListItemDto>> ListOwnedAsync(
        Guid userId, bool trash, string? search, LessonLevel? level, CancellationToken cancellationToken)
    {
        var query = db.Lessons.AsNoTracking().Where(x => x.UserId == userId);
        if (trash)
            query = query.Where(x => x.DeletedAt != null).OrderByDescending(x => x.DeletedAt).ThenBy(x => x.Id);
        else
        {
            query = query.Where(x => x.DeletedAt == null);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var pattern = "%" + search.Trim().Replace("!", "!!").Replace("%", "!%").Replace("_", "!_") + "%";
                query = query.Where(x => EF.Functions.ILike(x.Title, pattern, "!"));
            }
            if (level is not null) query = query.Where(x => x.Level == level);
            query = query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id);
        }
        return await query.Select(x => new LessonListItemDto(x.Id, x.Title, x.Level.ToString(),
            x.Topic, x.EstimatedDuration, x.UpdatedAt, x.DeletedAt)).ToListAsync(cancellationToken);
    }

    public async Task<LessonDetailsDto?> GetOwnedDetailsAsync(Guid lessonId, Guid userId, CancellationToken cancellationToken)
    {
        var lesson = await db.Lessons.AsNoTracking().Include(x => x.Activities)
            .SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId && x.DeletedAt == null, cancellationToken);
        return lesson is null ? null : ToDetails(lesson);
    }

    internal static LessonDetailsDto ToDetails(Lesson lesson)
    {
        var activities = lesson.Activities.OrderBy(x => x.Order).ThenBy(x => x.Id)
            .Select(x => new LessonActivityDto(x.Id, x.Type.ToString(), x.Title, x.Instructions,
                ParseContent(x.Content), x.Order, x.EstimatedDuration)).ToArray();
        return new LessonDetailsDto(lesson.Id, lesson.Title, lesson.Level.ToString(), lesson.Topic,
            lesson.Objective, lesson.EstimatedDuration, lesson.CreatedAt, lesson.UpdatedAt, lesson.DeletedAt, activities);
    }

    private static JsonElement ParseContent(string content)
    {
        using var document = JsonDocument.Parse(content);
        return document.RootElement.Clone();
    }
}
