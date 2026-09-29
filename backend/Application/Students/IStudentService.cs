namespace Profefacilisimo.Application.Students;

public interface IStudentService
{
    Task<StudentSaveResult> CreateAsync(Guid userId, SaveStudentRequest request, CancellationToken ct);
    Task<StudentSaveResult> UpdateAsync(Guid studentId, Guid userId, SaveStudentRequest request, CancellationToken ct);
    Task<StudentTransitionResult> TrashAsync(Guid studentId, Guid userId, CancellationToken ct);
    Task<StudentTransitionResult> RestoreAsync(Guid studentId, Guid userId, CancellationToken ct);
    Task<StudentTransitionResult> DeleteAsync(Guid studentId, Guid userId, CancellationToken ct);
}

// No details and no validation errors means the active owned student was not found.
public record StudentSaveResult(StudentDetailsDto? Details, Dictionary<string, string[]>? Errors = null);

public enum StudentTransitionResult { Success, NotFound, InvalidState }

// The four assignment operations of the two symmetric route pairs share this one service. Assigning a
// pair that already exists succeeds with the existing row instead of failing: repeating the action
// from either screen is safe, and the unique index is what protects the integrity underneath.
public interface ILessonAssignmentService
{
    Task<AssignmentResult<AssignedStudentDto>> AssignStudentAsync(Guid lessonId, Guid studentId, Guid userId, CancellationToken ct);
    Task<AssignmentResult<AssignedLessonDto>> AssignLessonAsync(Guid studentId, Guid lessonId, Guid userId, CancellationToken ct);
    Task<AssignmentRemovalResult> UnassignStudentAsync(Guid lessonId, Guid studentId, Guid userId, CancellationToken ct);
    Task<AssignmentRemovalResult> UnassignLessonAsync(Guid studentId, Guid lessonId, Guid userId, CancellationToken ct);

    // Assignment is an isolated action: it never modifies the lesson's content, activities, total or
    // version, so these are also the only reads the two assigned sections need.
    Task<IReadOnlyList<AssignedLessonDto>?> ListLessonsOfStudentAsync(Guid studentId, Guid userId, CancellationToken ct);
    Task<IReadOnlyList<AssignedStudentDto>?> ListStudentsOfLessonAsync(Guid lessonId, Guid userId, CancellationToken ct);
}

// A resource of the route is missing or belongs to another teacher.
public record AssignmentResult<T>(T? Value, bool NotFound, bool InvalidState = false);
public enum AssignmentRemovalResult { Success, NotFound }
