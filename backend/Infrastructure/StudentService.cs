using Microsoft.EntityFrameworkCore;
using Profefacilisimo.Application.Students;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Infrastructure;

public sealed class StudentService(AppDbContext db, IStudentReader reader) : IStudentService
{
    public async Task<StudentSaveResult> CreateAsync(Guid userId, SaveStudentRequest request, CancellationToken ct)
    {
        var errors = Validate(request);
        if (errors.Count > 0) return new(null, errors);
        var student = new Student(userId, request.Name, ParseLevel(request.Level), request.Email,
            request.NativeLanguage, request.Interests, request.Goals, request.Notes);
        db.Students.Add(student);
        await db.SaveChangesAsync(ct);
        return new(await Details(student.Id, userId, ct));
    }

    public async Task<StudentSaveResult> UpdateAsync(Guid studentId, Guid userId, SaveStudentRequest request, CancellationToken ct)
    {
        var student = await db.Students
            .SingleOrDefaultAsync(x => x.Id == studentId && x.UserId == userId && x.DeletedAt == null, ct);
        // A foreign, missing or trashed student is a 404 even when the body itself is invalid.
        if (student is null) return new(null);

        var errors = Validate(request);
        if (errors.Count > 0) return new(null, errors);

        student.Update(request.Name, ParseLevel(request.Level), request.Email, request.NativeLanguage,
            request.Interests, request.Goals, request.Notes);
        await db.SaveChangesAsync(ct);
        return new(await Details(student.Id, userId, ct));
    }

    public async Task<StudentTransitionResult> TrashAsync(Guid studentId, Guid userId, CancellationToken ct)
    {
        var student = await db.Students.SingleOrDefaultAsync(x => x.Id == studentId && x.UserId == userId, ct);
        if (student is null) return StudentTransitionResult.NotFound;
        if (student.DeletedAt is not null) return StudentTransitionResult.InvalidState;
        // Only the timestamp changes: the assignments stay exactly as they are while it is in the trash.
        student.MoveToTrash();
        await db.SaveChangesAsync(ct);
        return StudentTransitionResult.Success;
    }

    public async Task<StudentTransitionResult> RestoreAsync(Guid studentId, Guid userId, CancellationToken ct)
    {
        var student = await db.Students.SingleOrDefaultAsync(x => x.Id == studentId && x.UserId == userId, ct);
        if (student is null) return StudentTransitionResult.NotFound;
        if (student.DeletedAt is null) return StudentTransitionResult.InvalidState;
        // The assignments were never removed, so restoring brings them back without duplicating any.
        student.Restore();
        await db.SaveChangesAsync(ct);
        return StudentTransitionResult.Success;
    }

    public async Task<StudentTransitionResult> DeleteAsync(Guid studentId, Guid userId, CancellationToken ct)
    {
        var student = await db.Students.SingleOrDefaultAsync(x => x.Id == studentId && x.UserId == userId, ct);
        if (student is null) return StudentTransitionResult.NotFound;
        if (student.DeletedAt is null) return StudentTransitionResult.InvalidState;
        // Do not load children: PostgreSQL's FK cascade removes the assignment rows. The cascade is on
        // the assignment, never on the lesson, so no lesson and no activity is touched.
        db.Students.Remove(student);
        await db.SaveChangesAsync(ct);
        return StudentTransitionResult.Success;
    }

    private Task<StudentDetailsDto?> Details(Guid studentId, Guid userId, CancellationToken ct) =>
        reader.GetOwnedDetailsAsync(studentId, userId, ct);

    // Validates the metadata before anything is written. One invalid field rejects the whole save and
    // the error key points at that field, so the form can mark it. The domain re-applies the same
    // limits, which are the authoritative ones, and mirrors what the Zod schema checks in the editor.
    private static Dictionary<string, string[]> Validate(SaveStudentRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 200)
            errors["name"] = ["Campo obligatorio de máximo 200 caracteres."];
        if (request.Level is not ("A2" or "B1" or "B2")) errors["level"] = ["Usa A2, B1 o B2."];
        CheckOptional(request.Email, 254, "email", errors);
        // The email is deliberately not unique: two students may share a guardian's address.
        if (request.Email is { } email && !string.IsNullOrWhiteSpace(email) && !IsEmail(email.Trim()))
            errors["email"] = ["Usa un correo válido de máximo 254 caracteres."];
        CheckOptional(request.NativeLanguage, 100, "nativeLanguage", errors);
        CheckOptional(request.Interests, 2000, "interests", errors);
        CheckOptional(request.Goals, 2000, "goals", errors);
        CheckOptional(request.Notes, 4000, "notes", errors);
        return errors;
    }

    private static void CheckOptional(string? value, int max, string field, Dictionary<string, string[]> errors)
    {
        if (value is not null && value.Trim().Length > max)
            errors[field] = [$"Máximo {max} caracteres."];
    }

    private static bool IsEmail(string value)
    {
        var at = value.IndexOf('@');
        // One @, something before it, a dotted domain after it, and no whitespace anywhere.
        return at > 0 && at == value.LastIndexOf('@') && at < value.Length - 1
            && !value.Any(char.IsWhiteSpace) && value.IndexOf('.', at) > at + 1
            && value.IndexOf('.', at) < value.Length - 1;
    }

    private static LessonLevel ParseLevel(string level) => level switch
    {
        "A2" => LessonLevel.A2, "B1" => LessonLevel.B1, "B2" => LessonLevel.B2,
        _ => throw new ArgumentException("Unsupported level.", nameof(level))
    };
}

// One implementation for the four assignment endpoints, which are two symmetric route pairs with the
// same semantics. Both directions do the same four checks in the same order, so acting from the record
// or from the lesson can never give a different answer.
public sealed class LessonAssignmentService(AppDbContext db, StudentReader reader) : ILessonAssignmentService
{
    public Task<AssignmentResult<AssignedStudentDto>> AssignStudentAsync(
        Guid lessonId, Guid studentId, Guid userId, CancellationToken ct) =>
        AssignAsync<AssignedStudentDto>(lessonId, studentId, userId, ct);

    public Task<AssignmentResult<AssignedLessonDto>> AssignLessonAsync(
        Guid studentId, Guid lessonId, Guid userId, CancellationToken ct) =>
        AssignAsync<AssignedLessonDto>(lessonId, studentId, userId, ct);

    // The checks are ordered so the answer is always the most specific one that applies: both sides
    // must exist and belong to the teacher (404), then neither may be in the trash (400), and only
    // then is the row read or created. Both directions take the same path, so acting from the record
    // or from the lesson can never give a different answer.
    private async Task<AssignmentResult<T>> AssignAsync<T>(
        Guid lessonId, Guid studentId, Guid userId, CancellationToken ct)
    {
        var lesson = await db.Lessons.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == lessonId && x.UserId == userId, ct);
        if (lesson is null) return new(default, NotFound: true);

        var student = await db.Students.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == studentId && x.UserId == userId, ct);
        if (student is null) return new(default, NotFound: true);

        if (lesson.DeletedAt is not null || student.DeletedAt is not null)
            return new(default, NotFound: false, InvalidState: true);

        var existing = await db.LessonAssignments.AsNoTracking()
            .SingleOrDefaultAsync(x => x.StudentId == studentId && x.LessonId == lessonId, ct);
        if (existing is null)
        {
            existing = new LessonAssignment(studentId, lessonId);
            db.LessonAssignments.Add(existing);
            await db.SaveChangesAsync(ct);
        }

        // Assigning a pair that already exists returns the existing row: the action is idempotent, so
        // repeating it from either screen is safe. The unique index is what protects the integrity.
        object value = typeof(T) == typeof(AssignedStudentDto)
            ? new AssignedStudentDto(student.Id, student.Name, student.Level.ToString(), false, existing.AssignedAt)
            : new AssignedLessonDto(lesson.Id, lesson.Title, lesson.Level.ToString(),
                lesson.EstimatedDuration, false, existing.AssignedAt);
        return new((T)value, NotFound: false);
    }

    public Task<AssignmentRemovalResult> UnassignStudentAsync(
        Guid lessonId, Guid studentId, Guid userId, CancellationToken ct) =>
        RemoveAsync(lessonId, studentId, userId, ct);

    public Task<AssignmentRemovalResult> UnassignLessonAsync(
        Guid studentId, Guid lessonId, Guid userId, CancellationToken ct) =>
        RemoveAsync(lessonId, studentId, userId, ct);

    // Removing a pair that does not exist is a 404 and changes nothing. It is not a mistake of the
    // teacher: the row is simply already gone, most likely removed from the other screen.
    private async Task<AssignmentRemovalResult> RemoveAsync(
        Guid lessonId, Guid studentId, Guid userId, CancellationToken ct)
    {
        var ownedLesson = await db.Lessons.AsNoTracking()
            .AnyAsync(x => x.Id == lessonId && x.UserId == userId, ct);
        var ownedStudent = await db.Students.AsNoTracking()
            .AnyAsync(x => x.Id == studentId && x.UserId == userId, ct);
        if (!ownedLesson || !ownedStudent) return AssignmentRemovalResult.NotFound;

        var assignment = await db.LessonAssignments
            .SingleOrDefaultAsync(x => x.StudentId == studentId && x.LessonId == lessonId, ct);
        if (assignment is null) return AssignmentRemovalResult.NotFound;

        // Only the join row goes: neither the lesson nor the student is touched, and the lesson's
        // content, activities, total and version stay exactly as they were.
        db.LessonAssignments.Remove(assignment);
        await db.SaveChangesAsync(ct);
        return AssignmentRemovalResult.Success;
    }

    public Task<IReadOnlyList<AssignedLessonDto>?> ListLessonsOfStudentAsync(
        Guid studentId, Guid userId, CancellationToken ct) =>
        reader.ListAssignedLessonsOfOwnedStudentAsync(studentId, userId, ct);

    public Task<IReadOnlyList<AssignedStudentDto>?> ListStudentsOfLessonAsync(
        Guid lessonId, Guid userId, CancellationToken ct) =>
        reader.ListAssignedToLessonAsync(lessonId, userId, ct);
}

