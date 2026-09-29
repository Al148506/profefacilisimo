namespace Profefacilisimo.Application.Students;

// One save carries every field of the record. The optional ones arrive as null when the client leaves
// them empty: a blank string is never a value, and it is normalised to null before it is stored.
// `UserId` never travels from the client: the owner comes from the JWT.
public record SaveStudentRequest(string Name, string Level, string? Email, string? NativeLanguage,
    string? Interests, string? Goals, string? Notes);

public record StudentListItemDto(Guid Id, string Name, string Level, string? Interests,
    int AssignedLessonCount, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt);

public record StudentDetailsDto(Guid Id, string Name, string Level, string? Interests,
    int AssignedLessonCount, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt,
    string? Email, string? NativeLanguage, string? Goals, string? Notes, DateTimeOffset CreatedAt,
    IReadOnlyList<AssignedLessonDto> AssignedLessons);

// A lesson assigned to a student. A lesson in the trash stays assigned and is shown marked; its
// persisted total is null while any activity still lacks a duration.
public record AssignedLessonDto(Guid Id, string Title, string Level, int? EstimatedDuration,
    bool InTrash, DateTimeOffset AssignedAt);

// A student assigned to a lesson. A student in the trash stays assigned and is shown marked.
public record AssignedStudentDto(Guid Id, string Name, string Level, bool InTrash, DateTimeOffset AssignedAt);

// The body of the two symmetric assignment operations. Each route takes only the side it is not
// already in: the lesson routes receive a student, the student routes receive a lesson.
public record AssignStudentRequest(Guid StudentId);
public record AssignLessonRequest(Guid LessonId);
