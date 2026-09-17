namespace Profefacilisimo.Application.Lessons;

public interface ILessonService
{
    Task<LessonSaveResult> CreateAsync(Guid userId, SaveLessonRequest request, CancellationToken ct);
    Task<LessonSaveResult> UpdateAsync(Guid lessonId, Guid userId, SaveLessonRequest request, CancellationToken ct);
}

// No details and no validation errors means the active owned lesson was not found.
public record LessonSaveResult(LessonDetailsDto? Details, Dictionary<string, string[]>? Errors = null);
