using Profefacilisimo.Domain;

namespace Profefacilisimo.Tests;

public class LessonTests
{
    private static Lesson Create() => new(Guid.NewGuid(), "Viajes", LessonLevel.B1, "Vacaciones", "Hablar del pasado", 60);

    [Fact]
    public void EmptyDraftIsAllowed() => Assert.Empty(Create().Activities);

    [Fact]
    public void LessonRequiresOwner() => Assert.Throws<ArgumentException>(() => new Lesson(Guid.Empty, "A", LessonLevel.B1, "B", "C"));

    [Fact]
    public void UnsupportedLevelIsRejected() => Assert.Throws<ArgumentException>(() => new Lesson(Guid.NewGuid(), "A", (LessonLevel)99, "B", "C"));

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void NonPositiveDurationIsRejected(int duration) => Assert.Throws<ArgumentOutOfRangeException>(() => new Lesson(Guid.NewGuid(), "A", LessonLevel.A2, "B", "C", duration));

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public void BlankTitleIsRejected(string title) => Assert.Throws<ArgumentException>(() => new Lesson(Guid.NewGuid(), title, LessonLevel.B2, "B", "C"));

    [Fact]
    public void ActivitiesReceiveOwnerAndSequentialOrder()
    {
        var lesson = Create();
        var first = lesson.AddActivity("Conversación", "Responde", new SpeakingContent(["¿Adónde viajaste?"]));
        var second = lesson.AddActivity("Escribe", "Redacta", new WritingContent("Describe tu viaje."));
        Assert.Equal(0, first.Order);
        Assert.Equal(1, second.Order);
        Assert.Equal(lesson.Id, first.LessonId);
    }

    [Fact]
    public void AllContentTypesRoundTrip()
    {
        ActivityContent[] contents = [new SpeakingContent(["Pregunta"]), new ReadingContent("Texto", ["Pregunta"]), new WritingContent("Consigna"), new VocabularyGrammarContent("Explicación", ["Ejercicio"])];
        foreach (var content in contents)
        {
            var activity = Create().AddActivity("Título", "Instrucciones", content);
            Assert.Equal(content.Type, activity.Type);
            Assert.IsType(content.GetType(), activity.ReadContent());
            activity.ReadContent().Validate();
        }
    }

    [Fact]
    public void InvalidContentIsRejectedBeforeAddingActivity()
    {
        var lesson = Create();
        Assert.Throws<ArgumentException>(() => lesson.AddActivity("A", "B", new SpeakingContent([])));
        Assert.Throws<ArgumentException>(() => lesson.AddActivity("A", "B", new ReadingContent("", ["Q"])));
        Assert.Throws<ArgumentException>(() => lesson.AddActivity("A", "B", new WritingContent(" ")));
        Assert.Throws<ArgumentException>(() => lesson.AddActivity("A", "B", new VocabularyGrammarContent("X", [])));
        Assert.Empty(lesson.Activities);
    }

    [Fact]
    public void MetadataUpdateTrimsAndPreservesNonEditableData()
    {
        var lesson = Create();
        var activity = lesson.AddActivity("A", "B", new WritingContent("C"), 12);
        var before = (lesson.Id, lesson.UserId, lesson.CreatedAt, lesson.EstimatedDuration);
        var start = DateTimeOffset.UtcNow;
        lesson.UpdateMetadata(" Nuevo ", LessonLevel.A2, " Tema ", " Objetivo ");
        Assert.Equal(("Nuevo", LessonLevel.A2, "Tema", "Objetivo"),
            (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective));
        Assert.Equal(before, (lesson.Id, lesson.UserId, lesson.CreatedAt, lesson.EstimatedDuration));
        Assert.Same(activity, Assert.Single(lesson.Activities));
        Assert.InRange(lesson.UpdatedAt, start, DateTimeOffset.UtcNow);
    }

    public static IEnumerable<object?[]> InvalidMetadata()
    {
        foreach (var field in new[] { 0, 1, 2 })
        foreach (var invalid in new string?[] { null, "", "   ", new('x', field == 2 ? 2001 : 201) })
        {
            string?[] values = ["Title", "Topic", "Objective"];
            values[field] = invalid;
            yield return [values[0], LessonLevel.B1, values[1], values[2]];
        }
        yield return ["Title", (LessonLevel)99, "Topic", "Objective"];
    }

    [Theory]
    [MemberData(nameof(InvalidMetadata))]
    public void InvalidMetadataIsRejectedWithoutPartialUpdate(string title, LessonLevel level, string topic, string objective)
    {
        Assert.Throws<ArgumentException>(() => new Lesson(Guid.NewGuid(), title, level, topic, objective));
        var lesson = Create();
        var before = (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.UpdatedAt);
        Assert.Throws<ArgumentException>(() => lesson.UpdateMetadata(title, level, topic, objective));
        Assert.Equal(before, (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.UpdatedAt));
    }

    [Theory]
    [InlineData(LessonLevel.A2)]
    [InlineData(LessonLevel.B1)]
    [InlineData(LessonLevel.B2)]
    public void MetadataAcceptsExactLimitsAndSupportedLevels(LessonLevel level)
    {
        var lesson = new Lesson(Guid.NewGuid(), " " + new string('t', 200) + " ", level,
            new string('s', 200), new string('o', 2000));
        lesson.UpdateMetadata(lesson.Title, level, lesson.Topic, lesson.Objective);
        Assert.Equal(200, lesson.Title.Length);
        Assert.Equal(200, lesson.Topic.Length);
        Assert.Equal(2000, lesson.Objective.Length);
        Assert.Null(lesson.EstimatedDuration);
        Assert.Null(lesson.DeletedAt);
        Assert.Equal(TimeSpan.Zero, lesson.CreatedAt.Offset);
    }

    [Fact]
    public void TrashAndRestorePreserveDataAndRejectInvalidTransitions()
    {
        var lesson = Create();
        var activity = lesson.AddActivity("A", "B", new WritingContent("C"));
        var before = (lesson.Id, lesson.UserId, lesson.Title, lesson.Level, lesson.Topic,
            lesson.Objective, lesson.CreatedAt, lesson.EstimatedDuration);
        Assert.Throws<InvalidOperationException>(() => lesson.Restore());
        var start = DateTimeOffset.UtcNow;
        lesson.MoveToTrash();
        Assert.NotNull(lesson.DeletedAt);
        Assert.InRange(lesson.DeletedAt.Value, start, DateTimeOffset.UtcNow);
        var deletedAt = lesson.DeletedAt;
        var updatedAt = lesson.UpdatedAt;
        Assert.Throws<InvalidOperationException>(() => lesson.MoveToTrash());
        Assert.Throws<InvalidOperationException>(() => lesson.Duplicate());
        Assert.Throws<InvalidOperationException>(() => lesson.UpdateMetadata("X", LessonLevel.A2, "Y", "Z"));
        Assert.Throws<InvalidOperationException>(() => lesson.AddActivity("A", "B", new WritingContent("C")));
        Assert.Equal(deletedAt, lesson.DeletedAt);
        Assert.Equal(updatedAt, lesson.UpdatedAt);
        Assert.Same(activity, Assert.Single(lesson.Activities));
        start = DateTimeOffset.UtcNow;
        lesson.Restore();
        Assert.Null(lesson.DeletedAt);
        Assert.InRange(lesson.UpdatedAt, start, DateTimeOffset.UtcNow);
        Assert.Equal(before, (lesson.Id, lesson.UserId, lesson.Title, lesson.Level, lesson.Topic,
            lesson.Objective, lesson.CreatedAt, lesson.EstimatedDuration));
        Assert.Same(activity, Assert.Single(lesson.Activities));
        lesson.UpdateMetadata("X", LessonLevel.A2, "Y", "Z");
        Assert.NotNull(lesson.Duplicate());
    }

    [Theory]
    [InlineData(null)]
    [InlineData(60)]
    public void DuplicatePreservesAllActivityDataWithIndependentIdentities(int? duration)
    {
        var lesson = new Lesson(Guid.NewGuid(), "Viajes", LessonLevel.B1, "Tema", "Objetivo", duration);
        ActivityContent[] contents = [new SpeakingContent(["Pregunta"]), new ReadingContent("Texto", ["Pregunta"]),
            new WritingContent("Consigna"), new VocabularyGrammarContent("Explicación", ["Ejercicio"])];
        for (var i = 0; i < contents.Length; i++)
            lesson.AddActivity($"Actividad {i}", "Instrucciones", contents[i], i % 2 == 0 ? null : 5);
        var originalUpdatedAt = lesson.UpdatedAt;
        var start = DateTimeOffset.UtcNow;
        var copy = lesson.Duplicate();
        Assert.NotEqual(lesson.Id, copy.Id);
        Assert.Equal("Viajes (copia)", copy.Title);
        Assert.Equal((lesson.UserId, lesson.Level, lesson.Topic, lesson.Objective, duration),
            (copy.UserId, copy.Level, copy.Topic, copy.Objective, copy.EstimatedDuration));
        Assert.Null(copy.DeletedAt);
        Assert.InRange(copy.CreatedAt, start, DateTimeOffset.UtcNow);
        Assert.Equal(copy.CreatedAt, copy.UpdatedAt);
        Assert.Equal(originalUpdatedAt, lesson.UpdatedAt);
        Assert.Equal(4, copy.Activities.Count);
        foreach (var (original, cloned) in lesson.Activities.Zip(copy.Activities))
        {
            Assert.NotSame(original, cloned);
            Assert.NotEqual(original.Id, cloned.Id);
            Assert.Equal(copy.Id, cloned.LessonId);
            Assert.Equal((original.Type, original.Title, original.Instructions, original.Content, original.Order, original.EstimatedDuration),
                (cloned.Type, cloned.Title, cloned.Instructions, cloned.Content, cloned.Order, cloned.EstimatedDuration));
        }
        Assert.Equal(4, copy.Activities.Select(x => x.Id).Distinct().Count());
        copy.AddActivity("Nueva", "Instrucciones", new WritingContent("Consigna"));
        copy.UpdateMetadata("Copia editada", LessonLevel.B2, "Otro", "Objetivo");
        copy.MoveToTrash();
        Assert.Equal(4, lesson.Activities.Count);
        Assert.Equal("Viajes", lesson.Title);
        Assert.Null(lesson.DeletedAt);
        Assert.Equal(originalUpdatedAt, lesson.UpdatedAt);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(192)]
    [InlineData(193)]
    [InlineData(200)]
    public void EmptyLessonDuplicateRespectsTitleLimit(int length)
    {
        var lesson = new Lesson(Guid.NewGuid(), new string('a', length), LessonLevel.A2, "Tema", "Objetivo");
        var copy = lesson.Duplicate();
        Assert.Equal(new string('a', Math.Min(length, 192)) + " (copia)", copy.Title);
        Assert.Empty(copy.Activities);
        Assert.Null(copy.EstimatedDuration);
    }
}
