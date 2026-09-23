using System.Text.Json;

namespace Profefacilisimo.Domain;

public enum ActivityType { Speaking, Reading, Writing, VocabularyGrammar }

public abstract record ActivityContent
{
    public abstract ActivityType Type { get; }
    public abstract void Validate();
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

    public ActivityContent ReadContent() => Type switch
    {
        ActivityType.Speaking => JsonSerializer.Deserialize<SpeakingContent>(Content, ContentJson.Options)!,
        ActivityType.Reading => JsonSerializer.Deserialize<ReadingContent>(Content, ContentJson.Options)!,
        ActivityType.Writing => JsonSerializer.Deserialize<WritingContent>(Content, ContentJson.Options)!,
        ActivityType.VocabularyGrammar => JsonSerializer.Deserialize<VocabularyGrammarContent>(Content, ContentJson.Options)!,
        _ => throw new InvalidOperationException("Unsupported activity type.")
    };
}

internal static class ContentJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}
