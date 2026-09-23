using Profefacilisimo.Domain;

namespace Profefacilisimo.Tests;

public class LessonTests
{
    private static Lesson Create() => new(Guid.NewGuid(), "Viajes", LessonLevel.B1, "Vacaciones", "Hablar del pasado");

    private static ActivityDraft Draft(string title, int minutes, ActivityContent content, Guid? id = null) =>
        new(id, title, "Instrucciones", content, minutes);

    [Fact]
    public void EmptyDraftIsAllowed() => Assert.Empty(Create().Activities);

    [Fact]
    public void LessonRequiresOwner() => Assert.Throws<ArgumentException>(() => new Lesson(Guid.Empty, "A", LessonLevel.B1, "B", "C"));

    [Fact]
    public void UnsupportedLevelIsRejected() => Assert.Throws<ArgumentException>(() => new Lesson(Guid.NewGuid(), "A", (LessonLevel)99, "B", "C"));

    [Fact]
    public void NewLessonStartsWithZeroTotalInsteadOfNull() => Assert.Equal(0, Create().EstimatedDuration);

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
        Assert.Equal(0, lesson.EstimatedDuration);
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

    [Fact]
    public void DuplicatePreservesAllActivityDataWithIndependentIdentities()
    {
        var lesson = new Lesson(Guid.NewGuid(), "Viajes", LessonLevel.B1, "Tema", "Objetivo");
        ActivityContent[] contents = [new SpeakingContent(["Pregunta"]), new ReadingContent("Texto", ["Pregunta"]),
            new WritingContent("Consigna"), new VocabularyGrammarContent("Explicación", ["Ejercicio"])];
        for (var i = 0; i < contents.Length; i++)
            lesson.AddActivity($"Actividad {i}", "Instrucciones", contents[i], i % 2 == 0 ? null : 5);
        // Two activities still lack a duration, so the source total is "incomplete".
        Assert.Null(lesson.EstimatedDuration);
        var originalUpdatedAt = lesson.UpdatedAt;
        var start = DateTimeOffset.UtcNow;
        var copy = lesson.Duplicate();
        Assert.NotEqual(lesson.Id, copy.Id);
        Assert.Equal("Viajes (copia)", copy.Title);
        Assert.Equal((lesson.UserId, lesson.Level, lesson.Topic, lesson.Objective, lesson.EstimatedDuration),
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
        Assert.Equal(0, copy.EstimatedDuration);
    }

    [Fact]
    public void TotalIsTheSumOfActivityDurations()
    {
        var lesson = Create();
        var first = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var second = lesson.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]), 15);
        var third = lesson.AddActivity("C", "Instrucciones", new ReadingContent("Texto", ["Pregunta"]), 5);
        Assert.Equal(30, lesson.EstimatedDuration);

        // Dropping the 10-minute activity leaves 20.
        lesson.ApplyActivities([
            Draft("B", 15, new SpeakingContent(["Pregunta"]), second.Id),
            Draft("C", 5, new ReadingContent("Texto", ["Pregunta"]), third.Id)]);

        Assert.Equal(20, lesson.EstimatedDuration);
        Assert.DoesNotContain(first.Id, lesson.Activities.Select(x => x.Id));
    }

    [Fact]
    public void TotalIsNullWhileAnyActivityLacksADuration()
    {
        var lesson = Create();
        var complete = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var legacy = lesson.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]));
        Assert.Null(lesson.EstimatedDuration);

        // Completing the missing duration turns the incomplete total into a real sum.
        lesson.ApplyActivities([
            Draft("A", 10, new WritingContent("Consigna"), complete.Id),
            Draft("B", 15, new SpeakingContent(["Pregunta"]), legacy.Id)]);

        Assert.Equal(25, lesson.EstimatedDuration);
    }

    [Fact]
    public void EmptyActivitySetLeavesZeroTotal()
    {
        var lesson = Create();
        lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);

        lesson.ApplyActivities([]);

        Assert.Empty(lesson.Activities);
        Assert.Equal(0, lesson.EstimatedDuration);
    }

    [Fact]
    public void TotalDoesNotDependOnOrder()
    {
        var lesson = Create();
        var first = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var second = lesson.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]), 15);
        var third = lesson.AddActivity("C", "Instrucciones", new ReadingContent("Texto", ["Pregunta"]), 5);

        lesson.ApplyActivities([
            Draft("C", 5, new ReadingContent("Texto", ["Pregunta"]), third.Id),
            Draft("B", 15, new SpeakingContent(["Pregunta"]), second.Id),
            Draft("A", 10, new WritingContent("Consigna"), first.Id)]);

        Assert.Equal(30, lesson.EstimatedDuration);
        Assert.Equal([third.Id, second.Id, first.Id], lesson.Activities.Select(x => x.Id));
    }

    [Fact]
    public void ApplyingASetAssignsConsecutiveOrderFromZeroAndKeepsIdentities()
    {
        var lesson = Create();
        var first = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var second = lesson.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]), 15);

        lesson.ApplyActivities([
            Draft("B", 15, new SpeakingContent(["Pregunta"]), second.Id),
            Draft("Nueva", 5, new ReadingContent("Texto", ["Pregunta"])),
            Draft("A", 10, new WritingContent("Consigna"), first.Id)]);

        var applied = lesson.Activities.ToArray();
        Assert.Equal([0, 1, 2], applied.Select(x => x.Order));
        // Persisted activities keep their instance and their Id; the new one gets its own identity.
        Assert.Same(second, applied[0]);
        Assert.Same(first, applied[2]);
        Assert.Equal(second.Id, applied[0].Id);
        Assert.Equal(first.Id, applied[2].Id);
        Assert.NotEqual(Guid.Empty, applied[1].Id);
        Assert.Equal(lesson.Id, applied[1].LessonId);
        Assert.Equal("Nueva", applied[1].Title);
        Assert.Equal(5, applied[1].EstimatedDuration);
        Assert.Equal(30, lesson.EstimatedDuration);
    }

    [Fact]
    public void ApplyingASetRewritesEditableDataWithoutTouchingMetadata()
    {
        var lesson = Create();
        var activity = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var metadata = (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.CreatedAt);
        var start = DateTimeOffset.UtcNow;

        // Title and instructions are trimmed; the type-specific content keeps its phase-1 format.
        lesson.ApplyActivities([Draft(" Cambiada ", 45, new WritingContent("Nueva consigna"), activity.Id)]);

        Assert.Same(activity, Assert.Single(lesson.Activities));
        Assert.Equal("Cambiada", activity.Title);
        Assert.Equal("Instrucciones", activity.Instructions);
        Assert.Equal(45, activity.EstimatedDuration);
        Assert.Equal("Nueva consigna", Assert.IsType<WritingContent>(activity.ReadContent()).Prompt);
        Assert.Equal(metadata, (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.CreatedAt));
        Assert.InRange(lesson.UpdatedAt, start, DateTimeOffset.UtcNow);
    }

    [Fact]
    public void UnknownOrForeignActivityIdRejectsTheWholeSetWithoutPartialUpdate()
    {
        var lesson = Create();
        var activity = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var before = (lesson.EstimatedDuration, lesson.Activities.Count, activity.Title, activity.EstimatedDuration, lesson.UpdatedAt);

        Assert.Throws<ArgumentException>(() => lesson.ApplyActivities([
            Draft("Cambiada", 99, new WritingContent("Consigna"), activity.Id),
            Draft("Ajena", 5, new WritingContent("Consigna"), Guid.NewGuid())]));

        Assert.Equal(before, (lesson.EstimatedDuration, lesson.Activities.Count, activity.Title, activity.EstimatedDuration, lesson.UpdatedAt));
        Assert.Equal("A", activity.Title);
        Assert.Equal(10, activity.EstimatedDuration);
    }

    [Fact]
    public void RepeatedActivityIdRejectsTheWholeSetWithoutPartialUpdate()
    {
        var lesson = Create();
        var activity = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var before = (lesson.EstimatedDuration, activity.Title, activity.EstimatedDuration, lesson.UpdatedAt);

        Assert.Throws<ArgumentException>(() => lesson.ApplyActivities([
            Draft("Primera", 20, new WritingContent("Consigna"), activity.Id),
            Draft("Segunda", 30, new WritingContent("Consigna"), activity.Id)]));

        Assert.Equal(before, (lesson.EstimatedDuration, activity.Title, activity.EstimatedDuration, lesson.UpdatedAt));
    }

    [Fact]
    public void OneInvalidActivityRejectsTheWholeSetWithoutPartialUpdate()
    {
        var lesson = Create();
        var activity = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        var before = (lesson.EstimatedDuration, activity.Title, activity.EstimatedDuration);

        Assert.Throws<ArgumentException>(() => lesson.ApplyActivities([
            Draft("Cambiada", 99, new WritingContent("Consigna"), activity.Id),
            Draft("Inválida", 5, new SpeakingContent([]))]));
        Assert.Throws<ArgumentOutOfRangeException>(() => lesson.ApplyActivities([Draft("Sin duración", 0, new WritingContent("Consigna"))]));
        Assert.Throws<ArgumentOutOfRangeException>(() => lesson.ApplyActivities([Draft("Negativa", -5, new WritingContent("Consigna"))]));

        Assert.Equal(before, (lesson.EstimatedDuration, activity.Title, activity.EstimatedDuration));
        Assert.Single(lesson.Activities);
    }

    [Fact]
    public void TotalRejectsOverflowInsteadOfTruncating()
    {
        var lesson = Create();
        var activity = lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), int.MaxValue);

        Assert.Throws<OverflowException>(() => lesson.ApplyActivities([
            Draft("A", int.MaxValue, new WritingContent("Consigna"), activity.Id),
            Draft("B", 1, new WritingContent("Consigna"))]));

        Assert.Equal(int.MaxValue, lesson.EstimatedDuration);
        Assert.Single(lesson.Activities);
    }

    [Fact]
    public void DuplicateRecalculatesTheTotalFromTheCopiedActivities()
    {
        var lesson = Create();
        lesson.AddActivity("A", "Instrucciones", new WritingContent("Consigna"), 10);
        lesson.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]), 15);

        var copy = lesson.Duplicate();

        Assert.Equal(25, copy.EstimatedDuration);
        Assert.Equal(lesson.EstimatedDuration, copy.EstimatedDuration);
    }
}
