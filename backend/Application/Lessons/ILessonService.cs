namespace Profefacilisimo.Application.Lessons;

public interface ILessonService
{
    Task<LessonTransitionResult> TrashAsync(Guid lessonId, Guid userId, CancellationToken ct);
    Task<LessonTransitionResult> RestoreAsync(Guid lessonId, Guid userId, CancellationToken ct);
    Task<LessonTransitionResult> DeleteAsync(Guid lessonId, Guid userId, CancellationToken ct);
    Task<LessonDetailsDto?> DuplicateAsync(Guid lessonId, Guid userId, CancellationToken ct);
    Task<LessonSaveResult> CreateAsync(Guid userId, SaveLessonRequest request, CancellationToken ct);
    Task<LessonSaveResult> UpdateAsync(Guid lessonId, Guid userId, SaveLessonRequest request, CancellationToken ct);
}

// No details and no validation errors means the active owned lesson was not found.
public record LessonSaveResult(LessonDetailsDto? Details, Dictionary<string, string[]>? Errors = null);

public enum LessonTransitionResult { Success, NotFound, InvalidState }
