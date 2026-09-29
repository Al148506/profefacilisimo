using Profefacilisimo.Domain;

namespace Profefacilisimo.Tests;

public class StudentTests
{
    private static Student Create(string name = "Lucía", LessonLevel level = LessonLevel.B1) =>
        new(Guid.NewGuid(), name, level);

    [Fact]
    public void StudentRequiresOwner() => Assert.Throws<ArgumentException>(() => new Student(Guid.Empty, "A", LessonLevel.B1));

    [Fact]
    public void UnsupportedLevelIsRejected() =>
        Assert.Throws<ArgumentException>(() => new Student(Guid.NewGuid(), "A", (LessonLevel)99));

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("\t\n")]
    public void BlankNameIsRejected(string name) =>
        Assert.Throws<ArgumentException>(() => new Student(Guid.NewGuid(), name, LessonLevel.B1));

    [Fact]
    public void NameOverTwoHundredCharactersIsRejected()
    {
        Assert.Throws<ArgumentException>(() => Create(new string('a', 201)));
        Assert.Equal(200, Create(new string('a', 200)).Name.Length);
    }

    [Fact]
    public void NameIsTrimmed() => Assert.Equal("Lucía", Create("  Lucía  ").Name);

    // The name is deliberately not unique: two students may be called the same.
    [Fact]
    public void TwoStudentsMayShareTheSameName()
    {
        var owner = Guid.NewGuid();
        var first = new Student(owner, "Ana", LessonLevel.A2);
        var second = new Student(owner, "Ana", LessonLevel.A2);
        Assert.Equal(first.Name, second.Name);
        Assert.NotEqual(first.Id, second.Id);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void EmptyOptionalFieldsAreStoredAsNull(string? value)
    {
        var student = new Student(Guid.NewGuid(), "Lucía", LessonLevel.B1, value, value, value, value, value);
        Assert.Null(student.Email);
        Assert.Null(student.NativeLanguage);
        Assert.Null(student.Interests);
        Assert.Null(student.Goals);
        Assert.Null(student.Notes);
    }

    [Fact]
    public void OptionalFieldsAreTrimmedAndKept()
    {
        var student = new Student(Guid.NewGuid(), "Lucía", LessonLevel.B1, "  lucia@example.com  ",
            "  Español  ", "  Cine  ", "  Aprobar el B2  ", "  Muy motivada  ");
        Assert.Equal("lucia@example.com", student.Email);
        Assert.Equal("Español", student.NativeLanguage);
        Assert.Equal("Cine", student.Interests);
        Assert.Equal("Aprobar el B2", student.Goals);
        Assert.Equal("Muy motivada", student.Notes);
    }

    // The same limits the DTO and the Zod schema use, so the three can never drift apart.
    [Fact]
    public void OptionalLengthLimitsAreEnforced()
    {
        var owner = Guid.NewGuid();
        Assert.Throws<ArgumentException>(() => new Student(owner, "A", LessonLevel.B1, new string('a', 255)));
        Assert.Throws<ArgumentException>(() => new Student(owner, "A", LessonLevel.B1, nativeLanguage: new string('a', 101)));
        Assert.Throws<ArgumentException>(() => new Student(owner, "A", LessonLevel.B1, interests: new string('a', 2001)));
        Assert.Throws<ArgumentException>(() => new Student(owner, "A", LessonLevel.B1, goals: new string('a', 2001)));
        Assert.Throws<ArgumentException>(() => new Student(owner, "A", LessonLevel.B1, notes: new string('a', 4001)));

        Assert.Equal(254, new Student(owner, "A", LessonLevel.B1, new string('a', 254)).Email!.Length);
        Assert.Equal(100, new Student(owner, "A", LessonLevel.B1, nativeLanguage: new string('a', 100)).NativeLanguage!.Length);
        Assert.Equal(2000, new Student(owner, "A", LessonLevel.B1, interests: new string('a', 2000)).Interests!.Length);
    }

    // A new student and a save are both one instant, and neither stamps DeletedAt.
    [Fact]
    public void NewStudentIsActiveAndStampsBothInstants()
    {
        var student = Create();
        Assert.Equal(student.CreatedAt, student.UpdatedAt);
        Assert.Null(student.DeletedAt);
    }

    [Fact]
    public void UpdateAppliesTheSameRulesAndNormalisesEmptiesToNull()
    {
        var student = new Student(Guid.NewGuid(), "Lucía", LessonLevel.B1, "lucia@example.com", "Español");
        student.Update("  Lucía Gómez  ", LessonLevel.B2, "", "   ", null, "  Meta  ", "");
        Assert.Equal("Lucía Gómez", student.Name);
        Assert.Equal(LessonLevel.B2, student.Level);
        Assert.Null(student.Email);
        Assert.Null(student.NativeLanguage);
        Assert.Null(student.Interests);
        Assert.Equal("Meta", student.Goals);
        Assert.Null(student.Notes);
        Assert.True(student.UpdatedAt >= student.CreatedAt);
    }

    [Fact]
    public void UpdateRejectsInvalidNameAndLevel()
    {
        var student = Create();
        Assert.Throws<ArgumentException>(() => student.Update("  ", LessonLevel.B1, null, null, null, null, null));
        Assert.Throws<ArgumentException>(() => student.Update("A", (LessonLevel)99, null, null, null, null, null));
    }

    [Fact]
    public void ThrowingAwayAndRestoringFlipsTheState()
    {
        var student = Create();
        student.MoveToTrash();
        Assert.NotNull(student.DeletedAt);
        Assert.Throws<InvalidOperationException>(() => student.MoveToTrash());
        // A trashed student is not editable: the record is read-only until it comes back.
        Assert.Throws<InvalidOperationException>(() => student.Update("Otra", LessonLevel.B1, null, null, null, null, null));
        student.Restore();
        Assert.Null(student.DeletedAt);
        Assert.Throws<InvalidOperationException>(() => student.Restore());
    }
}

public class LessonAssignmentTests
{
    [Fact]
    public void AssignmentNeedsBothSides()
    {
        Assert.Throws<ArgumentException>(() => new LessonAssignment(Guid.Empty, Guid.NewGuid()));
        Assert.Throws<ArgumentException>(() => new LessonAssignment(Guid.NewGuid(), Guid.Empty));
    }

    [Fact]
    public void NewAssignmentStampsTheInstant()
    {
        var assignment = new LessonAssignment(Guid.NewGuid(), Guid.NewGuid());
        Assert.NotEqual(Guid.Empty, assignment.Id);
        Assert.NotEqual(default, assignment.AssignedAt);
    }

    // The rule the unique index guards: what makes an assignment "the same" is the pair.
    [Fact]
    public void ThePairIsWhatIdentifiesTheAssignment()
    {
        var student = Guid.NewGuid();
        var lesson = Guid.NewGuid();
        var first = new LessonAssignment(student, lesson);
        var second = new LessonAssignment(student, lesson);
        Assert.True(first.SamePair(student, lesson));
        Assert.True(second.SamePair(student, lesson));
        // Two attempts are the same pair even though they are two different row identities.
        Assert.NotEqual(first.Id, second.Id);
        Assert.False(first.SamePair(student, Guid.NewGuid()));
        Assert.False(first.SamePair(Guid.NewGuid(), lesson));
    }

    // There is deliberately no Status: without a consumer it would be debt, not design.
    [Fact]
    public void AssignmentHasNoStatusField()
    {
        var names = typeof(LessonAssignment).GetProperties().Select(x => x.Name).ToArray();
        Assert.Equal(["AssignedAt", "Id", "LessonId", "StudentId"], names.OrderBy(x => x).ToArray());
    }

    // The lesson keeps a read-only navigation, and never a collection it can be written through.
    [Fact]
    public void LessonExposesAssignmentsReadOnly()
    {
        var lesson = new Lesson(Guid.NewGuid(), "Título", LessonLevel.B1, "Tema", "Objetivo");
        var assignments = lesson.Assignments;
        Assert.Empty(assignments);
        Assert.IsAssignableFrom<IReadOnlyCollection<LessonAssignment>>(assignments);
        Assert.Null(typeof(Lesson).GetProperty("StudentId"));
    }
}
