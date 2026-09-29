using Profefacilisimo.Domain;

namespace Profefacilisimo.Application.Students;

// An explicit query boundary, not a generic repository, like ILessonReader.
public interface IStudentReader
{
    Task<IReadOnlyList<StudentListItemDto>> ListOwnedAsync(Guid userId, bool trash, string? search,
        LessonLevel? level, CancellationToken cancellationToken);

    // The full record with the lessons assigned to it, including any lesson in the trash. Returns
    // null when the student does not exist or belongs to another teacher: both are a 404, never a 403.
    Task<StudentDetailsDto?> GetOwnedDetailsAsync(Guid studentId, Guid userId, CancellationToken cancellationToken);

    // The students assigned to one owned lesson, including those in the trash. Null when the lesson
    // does not exist or belongs to another teacher.
    Task<IReadOnlyList<AssignedStudentDto>?> ListAssignedToLessonAsync(Guid lessonId, Guid userId, CancellationToken cancellationToken);

    // The active students of the teacher, the only candidates an assignment may offer.
    Task<IReadOnlyList<StudentListItemDto>> ListActiveOwnedAsync(Guid userId, CancellationToken cancellationToken);

    // The lessons assigned to one owned student, including those in the trash. Null when the student
    // does not exist or belongs to another teacher.
    Task<IReadOnlyList<AssignedLessonDto>?> ListAssignedLessonsOfOwnedStudentAsync(Guid studentId, Guid userId, CancellationToken cancellationToken);
}
