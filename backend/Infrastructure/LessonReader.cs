using Microsoft.EntityFrameworkCore;
using Profefacilisimo.Application;

namespace Profefacilisimo.Infrastructure;

public sealed class LessonReader(AppDbContext db) : ILessonReader
{
    public Task<LessonSummary?> FindOwnedAsync(Guid lessonId, Guid userId, CancellationToken cancellationToken) =>
        db.Lessons.AsNoTracking().Where(x => x.Id == lessonId && x.UserId == userId)
            .Select(x => new LessonSummary(x.Id, x.Title, x.Activities.Count)).SingleOrDefaultAsync(cancellationToken);
}
