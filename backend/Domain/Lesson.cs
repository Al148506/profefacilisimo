namespace Profefacilisimo.Domain;

public enum LessonLevel { A2, B1, B2 }

public sealed class Lesson
{
    private readonly List<Activity> _activities = [];
    private Lesson() { }

    public Lesson(Guid userId, string title, LessonLevel level, string topic, string objective, int? estimatedDuration = null)
    {
        if (userId == Guid.Empty) throw new ArgumentException("A lesson needs an owner.", nameof(userId));
        if (!Enum.IsDefined(level)) throw new ArgumentException("Unsupported level.", nameof(level));
        Id = Guid.NewGuid();
        UserId = userId;
        Title = Rules.Text(title, 200, nameof(title));
        Topic = Rules.Text(topic, 200, nameof(topic));
        Objective = Rules.Text(objective, 2000, nameof(objective));
        Level = level;
        EstimatedDuration = Rules.Duration(estimatedDuration);
        CreatedAt = UpdatedAt = DateTimeOffset.UtcNow;
    }

    public Guid Id { get; private set; }
    public Guid UserId { get; private set; }
    public string Title { get; private set; } = "";
    public LessonLevel Level { get; private set; }
    public string Topic { get; private set; } = "";
    public string Objective { get; private set; } = "";
    public int? EstimatedDuration { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public DateTimeOffset? DeletedAt { get; private set; }
    public IReadOnlyCollection<Activity> Activities => _activities.AsReadOnly();

    public void UpdateMetadata(string title, LessonLevel level, string topic, string objective)
    {
        EnsureActive();
        if (!Enum.IsDefined(level)) throw new ArgumentException("Unsupported level.", nameof(level));
        var validTitle = Rules.Text(title, 200, nameof(title));
        var validTopic = Rules.Text(topic, 200, nameof(topic));
        var validObjective = Rules.Text(objective, 2000, nameof(objective));
        Title = validTitle;
        Topic = validTopic;
        Objective = validObjective;
        Level = level;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void MoveToTrash()
    {
        EnsureActive();
        DeletedAt = DateTimeOffset.UtcNow;
    }

    public void Restore()
    {
        if (DeletedAt is null) throw new InvalidOperationException("The lesson is already active.");
        DeletedAt = null;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public Lesson Duplicate()
    {
        EnsureActive();
        const string suffix = " (copia)";
        var title = Title[..Math.Min(Title.Length, 200 - suffix.Length)] + suffix;
        var copy = new Lesson(UserId, title, Level, Topic, Objective, EstimatedDuration);
        foreach (var activity in _activities)
            copy._activities.Add(activity.CopyTo(copy.Id));
        return copy;
    }

    private void EnsureActive()
    {
        if (DeletedAt is not null) throw new InvalidOperationException("The lesson is in the trash.");
    }

    public Activity AddActivity(string title, string instructions, ActivityContent content, int? estimatedDuration = null)
    {
        EnsureActive();
        var activity = new Activity(Id, title, instructions, content, _activities.Count, estimatedDuration);
        _activities.Add(activity);
        UpdatedAt = DateTimeOffset.UtcNow;
        return activity;
    }
}

internal static class Rules
{
    public static string Text(string? value, int max, string name)
    {
        if (string.IsNullOrWhiteSpace(value) || value.Trim().Length > max)
            throw new ArgumentException($"{name} is required and cannot exceed {max} characters.", name);
        return value.Trim();
    }

    public static int? Duration(int? value) => value is <= 0
        ? throw new ArgumentOutOfRangeException(nameof(value), "Duration must be positive minutes.") : value;
}
