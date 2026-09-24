using System.Text.Json;

namespace Profefacilisimo.Domain;

public enum ActivityType { Speaking, Reading, Writing, VocabularyGrammar }

public abstract record ActivityContent
{
    public abstract ActivityType Type { get; }
    public abstract void Validate();

    // The declared type is the authoritative discriminator: the concrete record is chosen from it,
    // so a redundant `type` left inside legacy JSON can never contradict the stored column.
    public static ActivityContent Read(ActivityType type, JsonElement content)
    {
        ActivityContent? value = type switch
        {
            ActivityType.Speaking => content.Deserialize<SpeakingContent>(ContentJson.Options),
            ActivityType.Reading => content.Deserialize<ReadingContent>(ContentJson.Options),
            ActivityType.Writing => content.Deserialize<WritingContent>(ContentJson.Options),
            ActivityType.VocabularyGrammar => content.Deserialize<VocabularyGrammarContent>(ContentJson.Options),
            _ => throw new ArgumentOutOfRangeException(nameof(type), "Unsupported activity type.")
        };
        return value ?? throw new JsonException("The content does not match the declared activity type.");
    }

    protected static void Questions(IReadOnlyList<string>? questions)
    {
        if (questions is null || questions.Count is < 1 or > 50)
            throw new ArgumentException("Provide between 1 and 50 questions/exercises.");
        foreach (var question in questions) Rules.Text(question, 2000, "question");
    }
}

public sealed record SpeakingContent(IReadOnlyList<string> QuestionsList) : ActivityContent
{
    public override ActivityType Type => ActivityType.Speaking;
    public override void Validate() => Questions(QuestionsList);
}
public sealed record ReadingContent(string Text, IReadOnlyList<string> QuestionsList) : ActivityContent
{
    public override ActivityType Type => ActivityType.Reading;
    public override void Validate() { Rules.Text(Text, 20000, nameof(Text)); Questions(QuestionsList); }
}
public sealed record WritingContent(string Prompt) : ActivityContent
{
    public override ActivityType Type => ActivityType.Writing;
    public override void Validate() => Rules.Text(Prompt, 5000, nameof(Prompt));
}
public sealed record VocabularyGrammarContent(string Explanation, IReadOnlyList<string> Exercises) : ActivityContent
{
    public override ActivityType Type => ActivityType.VocabularyGrammar;
    public override void Validate() { Rules.Text(Explanation, 10000, nameof(Explanation)); Questions(Exercises); }
}

public sealed class Activity
{
    private Activity() { }
    internal Activity(Guid lessonId, string title, string instructions, ActivityContent content, int order, int? duration)
    {
        ArgumentNullException.ThrowIfNull(content);
        content.Validate();
        Id = Guid.NewGuid();
        LessonId = lessonId;
        Title = Rules.Text(title, 200, nameof(title));
        Instructions = Rules.Text(instructions, 2000, nameof(instructions));
        Type = content.Type;
        Content = JsonSerializer.Serialize(content, content.GetType(), ContentJson.Options);
        Order = order;
        EstimatedDuration = Rules.Duration(duration);
    }
    public Guid Id { get; private set; }
    public Guid LessonId { get; private set; }
    public ActivityType Type { get; private set; }
    public string Title { get; private set; } = "";
    public string Instructions { get; private set; } = "";
    public string Content { get; private set; } = "";
    public int Order { get; private set; }
    public int? EstimatedDuration { get; private set; }

    // Editor write path: the activity keeps its identity (Id, LessonId, Order) and only its
    // editable data changes. Everything is validated before anything is assigned, so a rejected
    // update never leaves the activity half-modified. The declared type is the content's own
    // type, so an incompatible type/content pair cannot be stored.
    public void Update(string title, string instructions, ActivityContent content, int estimatedDuration)
    {
        var (validTitle, validInstructions, validDuration) =
            ValidateEditableData(title, instructions, content, estimatedDuration);
        Type = content.Type;
        Content = JsonSerializer.Serialize(content, content.GetType(), ContentJson.Options);
        Title = validTitle;
        Instructions = validInstructions;
        EstimatedDuration = validDuration;
    }

    // Validation without mutation, so a caller applying a whole set can reject the request before
    // changing any activity.
    internal static (string Title, string Instructions, int Duration) ValidateEditableData(
        string title, string instructions, ActivityContent content, int estimatedDuration)
    {
        ArgumentNullException.ThrowIfNull(content);
        content.Validate();
        return (Rules.Text(title, 200, nameof(title)),
            Rules.Text(instructions, 2000, nameof(instructions)),
            Rules.RequiredDuration(estimatedDuration));
    }

    internal void SetOrder(int order)
    {
        if (order < 0) throw new ArgumentOutOfRangeException(nameof(order), "Order cannot be negative.");
        Order = order;
    }

    // Copy the stored JSON verbatim; do not reinterpret or normalize legacy content.
    internal Activity CopyTo(Guid lessonId) => new()
    {
        Id = Guid.NewGuid(),
        LessonId = lessonId,
        Type = Type,
        Title = Title,
        Instructions = Instructions,
        Content = Content,
        Order = Order,
        EstimatedDuration = EstimatedDuration
    };

    public ActivityContent ReadContent()
    {
        using var document = JsonDocument.Parse(Content);
        return ActivityContent.Read(Type, document.RootElement);
    }
}

internal static class ContentJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}
