namespace Profefacilisimo.Domain;

public enum LessonLevel { A2, B1, B2 }

// One activity as requested by an editor save: a null Id means "new", and an existing Id must
// belong to the lesson being saved. The whole set travels in a single request.
public sealed record ActivityDraft(Guid? Id, string Title, string Instructions, ActivityContent Content, int EstimatedDuration);

public sealed class Lesson
{
    private readonly List<Activity> _activities = [];
    private Lesson() { }

    public Lesson(Guid userId, string title, LessonLevel level, string topic, string objective)
    {
        if (userId == Guid.Empty) throw new ArgumentException("A lesson needs an owner.", nameof(userId));
        if (!Enum.IsDefined(level)) throw new ArgumentException("Unsupported level.", nameof(level));
        Id = Guid.NewGuid();
        UserId = userId;
        Title = Rules.Text(title, 200, nameof(title));
        Topic = Rules.Text(topic, 200, nameof(topic));
        Objective = Rules.Text(objective, 2000, nameof(objective));
        Level = level;
        // The total is never supplied by the caller: a new lesson has no activities, so it starts at 0.
        RecalculateDuration();
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
        var copy = new Lesson(UserId, title, Level, Topic, Objective);
        foreach (var activity in _activities)
            copy._activities.Add(activity.CopyTo(copy.Id));
        // The copy holds the same activities, so the total stays coherent with them.
        copy.RecalculateDuration();
        return copy;
    }

    // Applies the complete activity set of an editor save: validates identity, updates the
    // activities that keep their Id, creates the ones without one, removes the ones the request
    // omits, and assigns consecutive order from zero following the request order.
    // The whole set is validated before anything changes, so a rejected save leaves the lesson
    // exactly as it was.
    public void ApplyActivities(IReadOnlyList<ActivityDraft> activities)
    {
        EnsureActive();
        ArgumentNullException.ThrowIfNull(activities);

        var persisted = _activities.ToDictionary(x => x.Id);
        var requested = new HashSet<Guid>();
        var validated = new List<(ActivityDraft Draft, string Title, string Instructions, int Duration)>(activities.Count);

        foreach (var draft in activities)
        {
            ArgumentNullException.ThrowIfNull(draft);
            if (draft.Id is { } id)
            {
                // A repeated, foreign or unknown Id is never treated as a new activity.
                if (!requested.Add(id)) throw new ArgumentException("The same activity appears more than once.", nameof(activities));
                if (!persisted.ContainsKey(id)) throw new ArgumentException("The activity does not belong to this lesson.", nameof(activities));
            }
            var (title, instructions, duration) =
                Activity.ValidateEditableData(draft.Title, draft.Instructions, draft.Content, draft.EstimatedDuration);
            validated.Add((draft, title, instructions, duration));
        }

        // Derived from the requested set, so an overflow is reported before anything changes.
        var total = TotalOf(validated.Select(x => (int?)x.Duration));

        var applied = new List<Activity>(validated.Count);
        for (var order = 0; order < validated.Count; order++)
        {
            var (draft, title, instructions, duration) = validated[order];
            if (draft.Id is { } id)
            {
                var existing = persisted[id];
                existing.Update(title, instructions, draft.Content, duration);
                existing.SetOrder(order);
                applied.Add(existing);
            }
            else
            {
                applied.Add(new Activity(Id, title, instructions, draft.Content, order, duration));
            }
        }

        _activities.Clear();
        _activities.AddRange(applied);
        EstimatedDuration = total;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    private void EnsureActive()
    {
        if (DeletedAt is not null) throw new InvalidOperationException("The lesson is in the trash.");
    }

    public Activity AddActivity(string title, string instructions, ActivityContent content, int? estimatedDuration = null)
    {
        EnsureActive();
        var activity = new Activity(Id, title, instructions, content, _activities.Count, estimatedDuration);
        var total = TotalOf(_activities.Select(x => x.EstimatedDuration).Append(activity.EstimatedDuration));
        _activities.Add(activity);
        EstimatedDuration = total;
        UpdatedAt = DateTimeOffset.UtcNow;
        return activity;
    }

    // The persisted total is always derived from the activities: 0 when there are none, their sum
    // when every one has a duration, and null while any legacy activity still lacks one.
    private void RecalculateDuration() => EstimatedDuration = TotalOf(_activities.Select(x => x.EstimatedDuration));

    private static int? TotalOf(IEnumerable<int?> durations)
    {
        var total = 0;
        var any = false;
        foreach (var duration in durations)
        {
            any = true;
            if (duration is not { } minutes) return null;
            // Checked arithmetic: an overflow is reported instead of silently wrapping around.
            total = checked(total + minutes);
        }
        return any ? total : 0;
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

    // Editor writes always carry a duration, unlike legacy rows where null is preserved.
    public static int RequiredDuration(int value) => value <= 0
        ? throw new ArgumentOutOfRangeException(nameof(value), "Duration must be a positive whole number of minutes.")
        : value;
}
