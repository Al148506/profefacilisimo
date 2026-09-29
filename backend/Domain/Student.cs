namespace Profefacilisimo.Domain;

// A student belongs to one teacher, in parallel to Lesson. It is not a user of the system: there is
// no login, no password and no access. The optional fields carry pedagogical context, never personal
// data beyond an optional contact address, and an empty optional is always stored as null.
public sealed class Student
{
    private Student() { }

    public Student(Guid userId, string name, LessonLevel level, string? email = null,
        string? nativeLanguage = null, string? interests = null, string? goals = null, string? notes = null)
    {
        if (userId == Guid.Empty) throw new ArgumentException("A student needs an owner.", nameof(userId));
        if (!Enum.IsDefined(level)) throw new ArgumentException("Unsupported level.", nameof(level));
        Id = Guid.NewGuid();
        UserId = userId;
        Name = Rules.Text(name, 200, nameof(name));
        Level = level;
        Email = Rules.Optional(email, 254, nameof(email));
        NativeLanguage = Rules.Optional(nativeLanguage, 100, nameof(nativeLanguage));
        Interests = Rules.Optional(interests, 2000, nameof(interests));
        Goals = Rules.Optional(goals, 2000, nameof(goals));
        Notes = Rules.Optional(notes, 4000, nameof(notes));
        // Creating a student is one write, so it is also one instant.
        CreatedAt = UpdatedAt = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Name { get; private set; } = "";
    public string? Email { get; private set; }
    public LessonLevel Level { get; private set; }
    public string? NativeLanguage { get; private set; }
    public string? Interests { get; private set; }
    public string? Goals { get; private set; }
    public string? Notes { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }

    // Editing shares the constructor's rules: the same limits, and an empty optional becomes null
    // instead of an empty string, so a saved student never distinguishes "" from "not filled in".
    public void Update(string name, LessonLevel level, string? email, string? nativeLanguage,
        string? interests, string? goals, string? notes)
    {
        EnsureActive();
        if (!Enum.IsDefined(level)) throw new ArgumentException("Unsupported level.", nameof(level));
        var validName = Rules.Text(name, 200, nameof(name));
        var validEmail = Rules.Optional(email, 254, nameof(email));
        var validLanguage = Rules.Optional(nativeLanguage, 100, nameof(nativeLanguage));
        var validInterests = Rules.Optional(interests, 2000, nameof(interests));
        var validGoals = Rules.Optional(goals, 2000, nameof(goals));
        var validNotes = Rules.Optional(notes, 4000, nameof(notes));
        Name = validName;
        Level = level;
        Email = validEmail;
        NativeLanguage = validLanguage;
        Interests = validInterests;
        Goals = validGoals;
        Notes = validNotes;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    // The email is deliberately not unique: two students may share a guardian's address.

    public void MoveToTrash()
    {
        EnsureActive();
        DeletedAt = DateTimeOffset.UtcNow;
    }

    public void Restore()
    {
        if (DeletedAt is null) throw new InvalidOperationException("The student is already active.");
        DeletedAt = null;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    private void EnsureActive()
    {
        if (DeletedAt is not null) throw new InvalidOperationException("The student is in the trash.");
    }
}
