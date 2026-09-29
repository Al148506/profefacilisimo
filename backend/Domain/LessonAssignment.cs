namespace Profefacilisimo.Domain;

// The join between a student and a lesson. The pair is unique, which is what makes the assignment
// idempotent: repeating it never produces a second row. Two cascade foreign keys remove the row when
// either side is deleted for good, but a cascade on the assignment is never a cascade on the lesson:
// deleting a student never deletes a lesson, and deleting a lesson never deletes a student.
//
// There is deliberately no Status field. The conceptual model mentioned it as a future possibility,
// and without a use case consuming it a field is debt, not design.
public sealed class LessonAssignment
{
    private LessonAssignment() { }

    public LessonAssignment(Guid studentId, Guid lessonId)
    {
        if (studentId == Guid.Empty) throw new ArgumentException("An assignment needs a student.", nameof(studentId));
        if (lessonId == Guid.Empty) throw new ArgumentException("An assignment needs a lesson.", nameof(lessonId));
        Id = Guid.NewGuid();
        StudentId = studentId;
        LessonId = lessonId;
        AssignedAt = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid StudentId { get; private set; }
    public Guid LessonId { get; private set; }
    public DateTimeOffset AssignedAt { get; private set; }

    // The domain rule behind the unique index: what makes an assignment "the same" is the pair, never
    // the row identity or the instant it was created.
    public bool SamePair(Guid studentId, Guid lessonId) => StudentId == studentId && LessonId == lessonId;
}
