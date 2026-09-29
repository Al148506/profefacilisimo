using Microsoft.EntityFrameworkCore;
using Profefacilisimo.Application.Students;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Infrastructure;

public sealed class StudentReader(AppDbContext db) : IStudentReader
{
    public async Task<IReadOnlyList<StudentListItemDto>> ListOwnedAsync(
        Guid userId, bool trash, string? search, LessonLevel? level, CancellationToken cancellationToken)
    {
        var query = db.Students.AsNoTracking().Where(x => x.UserId == userId);
        if (trash)
            // The trash lives in its own route and its own order: the most recently trashed first.
            query = query.Where(x => x.DeletedAt != null).OrderByDescending(x => x.DeletedAt).ThenBy(x => x.Id);
        else
        {
            query = query.Where(x => x.DeletedAt == null);
            if (!string.IsNullOrWhiteSpace(search))
            {
                // The search matches the name and the interests: a teacher looks for a student by
                // either of them. The pattern is escaped so a literal % or _ never widens the match.
                var pattern = "%" + search.Trim().Replace("!", "!!").Replace("%", "!%").Replace("_", "!_") + "%";
                query = query.Where(x => EF.Functions.ILike(x.Name, pattern, "!")
                    || (x.Interests != null && EF.Functions.ILike(x.Interests, pattern, "!")));
            }
            if (level is not null) query = query.Where(x => x.Level == level);
            query = query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id);
        }

        // The count includes the lessons in the trash, so the list and the record never disagree.
        return await query.Select(x => new StudentListItemDto(x.Id, x.Name, x.Level.ToString(),
            x.Interests, db.LessonAssignments.Count(a => a.StudentId == x.Id), x.UpdatedAt, x.DeletedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<StudentListItemDto>> ListActiveOwnedAsync(Guid userId, CancellationToken cancellationToken) =>
        await db.Students.AsNoTracking().Where(x => x.UserId == userId && x.DeletedAt == null)
            .OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id)
            .Select(x => new StudentListItemDto(x.Id, x.Name, x.Level.ToString(), x.Interests,
                db.LessonAssignments.Count(a => a.StudentId == x.Id), x.UpdatedAt, x.DeletedAt))
            .ToListAsync(cancellationToken);

    public async Task<StudentDetailsDto?> GetOwnedDetailsAsync(Guid studentId, Guid userId, CancellationToken cancellationToken)
    {
        // A student in the trash is still readable: only its state changes, never its availability.
        var student = await db.Students.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == studentId && x.UserId == userId, cancellationToken);
        if (student is null) return null;

        var assigned = await AssignedLessons(studentId, cancellationToken);
        return new StudentDetailsDto(student.Id, student.Name, student.Level.ToString(), student.Interests,
            assigned.Count, student.UpdatedAt, student.DeletedAt, student.Email, student.NativeLanguage,
            student.Goals, student.Notes, student.CreatedAt, assigned);
    }

    public async Task<IReadOnlyList<AssignedStudentDto>?> ListAssignedToLessonAsync(
        Guid lessonId, Guid userId, CancellationToken cancellationToken)
    {
        // The lesson is checked first: a foreign or missing lesson is a 404 whatever the assignments are.
        var owned = await db.Lessons.AsNoTracking()
            .AnyAsync(x => x.Id == lessonId && x.UserId == userId, cancellationToken);
        if (!owned) return null;

        return await db.LessonAssignments.AsNoTracking()
            .Where(x => x.LessonId == lessonId)
            .Join(db.Students, a => a.StudentId, s => s.Id, (a, s) => new { a.AssignedAt, Student = s })
            .OrderBy(x => x.AssignedAt).ThenBy(x => x.Student.Id)
            .Select(x => new AssignedStudentDto(x.Student.Id, x.Student.Name, x.Student.Level.ToString(),
                x.Student.DeletedAt != null, x.AssignedAt))
            .ToListAsync(cancellationToken);
    }

    internal async Task<IReadOnlyList<AssignedLessonDto>> AssignedLessons(Guid studentId, CancellationToken cancellationToken) =>
        await db.LessonAssignments.AsNoTracking()
            .Where(x => x.StudentId == studentId)
            .Join(db.Lessons, a => a.LessonId, l => l.Id, (a, l) => new { a.AssignedAt, Lesson = l })
            .OrderBy(x => x.AssignedAt).ThenBy(x => x.Lesson.Id)
            .Select(x => new AssignedLessonDto(x.Lesson.Id, x.Lesson.Title, x.Lesson.Level.ToString(),
                x.Lesson.EstimatedDuration, x.Lesson.DeletedAt != null, x.AssignedAt))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<AssignedLessonDto>?> ListAssignedLessonsOfOwnedStudentAsync(
        Guid studentId, Guid userId, CancellationToken cancellationToken)
    {
        // Whether the student is trashed is irrelevant: its record stays readable in the trash,
        // together with the lessons still assigned to it.
        var owned = await db.Students.AsNoTracking()
            .AnyAsync(x => x.Id == studentId && x.UserId == userId, cancellationToken);
        return owned ? await AssignedLessons(studentId, cancellationToken) : null;
    }
}
