using System.Text.Json;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Tests;

public class ActivityEditingTests
{
    private static Lesson Create() => new(Guid.NewGuid(), "Viajes", LessonLevel.B1, "Vacaciones", "Hablar del pasado", 60);

    private static Activity Speaking(Lesson lesson) =>
        lesson.AddActivity("Conversación", "Responde en voz alta", new SpeakingContent(["¿Adónde viajaste?"]), 10);

    private static (Guid, Guid, ActivityType, string, string, string, int, int?) Snapshot(Activity activity) =>
        (activity.Id, activity.LessonId, activity.Type, activity.Title, activity.Instructions,
            activity.Content, activity.Order, activity.EstimatedDuration);

    [Fact]
    public void EditingPreservesIdentityAndOrder()
    {
        var lesson = Create();
        var activity = Speaking(lesson);
        var identity = (activity.Id, activity.LessonId, activity.Order);

        activity.Update(" Conversación guiada ", " Responde en voz alta ", new SpeakingContent(["¿Adónde viajaste?", "¿Con quién?"]), 25);

        Assert.Equal(identity, (activity.Id, activity.LessonId, activity.Order));
        Assert.Equal("Conversación guiada", activity.Title);
        Assert.Equal("Responde en voz alta", activity.Instructions);
        Assert.Equal(25, activity.EstimatedDuration);
        Assert.Equal(ActivityType.Speaking, activity.Type);
        Assert.Equal(["¿Adónde viajaste?", "¿Con quién?"], Assert.IsType<SpeakingContent>(activity.ReadContent()).QuestionsList);
    }

    [Fact]
    public void ChangingTheTypeReplacesOnlyTheSpecificContent()
    {
        var lesson = Create();
        var activity = Speaking(lesson);
        var identity = (activity.Id, activity.LessonId, activity.Order);

        activity.Update("Carta formal", "Escribe una carta", new WritingContent("Escribe una carta al director."), 30);

        Assert.Equal(identity, (activity.Id, activity.LessonId, activity.Order));
        Assert.Equal(ActivityType.Writing, activity.Type);
        Assert.Equal(30, activity.EstimatedDuration);
        Assert.Equal("Escribe una carta al director.", Assert.IsType<WritingContent>(activity.ReadContent()).Prompt);
    }

    [Fact]
    public void EditingAcceptsEveryContentTypeAndKeepsItConsistentWithTheStoredType()
    {
        var lesson = Create();
        var activity = Speaking(lesson);
        ActivityContent[] contents =
        [
            new SpeakingContent(["Pregunta"]),
            new ReadingContent("Texto", ["Pregunta"]),
            new WritingContent("Consigna"),
            new VocabularyGrammarContent("Explicación", ["Ejercicio"])
        ];

        foreach (var content in contents)
        {
            activity.Update("Título", "Instrucciones", content, 5);
            Assert.Equal(content.Type, activity.Type);
            Assert.IsType(content.GetType(), activity.ReadContent());
            activity.ReadContent().Validate();
        }
    }

    [Fact]
    public void EditingOneActivityLeavesTheLessonAndItsSiblingsUntouched()
    {
        var lesson = Create();
        var edited = Speaking(lesson);
        var sibling = lesson.AddActivity("Escribe", "Redacta", new WritingContent("Describe tu viaje."), 5);
        var siblingBefore = Snapshot(sibling);
        var lessonBefore = (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.EstimatedDuration, lesson.UpdatedAt);

        edited.Update("Otro título", "Otras instrucciones", new WritingContent("Otra consigna."), 45);

        Assert.Equal(siblingBefore, Snapshot(sibling));
        Assert.Equal(lessonBefore,
            (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.EstimatedDuration, lesson.UpdatedAt));
        Assert.Equal(2, lesson.Activities.Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(-90)]
    public void NonPositiveDurationIsRejectedWithoutPartialUpdate(int duration)
    {
        var lesson = Create();
        var activity = Speaking(lesson);
        var before = Snapshot(activity);

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            activity.Update("Otro título", "Otras instrucciones", new WritingContent("Otra consigna."), duration));

        Assert.Equal(before, Snapshot(activity));
    }

    [Fact]
    public void FractionalDurationsCannotBeExpressedInTheWriteContract()
    {
        // EstimatedDuration is an int end to end, so a fractional duration has no representation
        // on the editor write path: the contract itself rules it out and the wire format rejects
        // it before the domain is reached.
        var parameter = typeof(Activity).GetMethod(nameof(Activity.Update))!
            .GetParameters().Single(x => x.Name == "estimatedDuration");
        Assert.Equal(typeof(int), parameter.ParameterType);
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<int>("12.5"));
    }

    [Fact]
    public void NullContentIsRejected()
    {
        var activity = Speaking(Create());
        var before = Snapshot(activity);

        Assert.Throws<ArgumentNullException>(() => activity.Update("Título", "Instrucciones", null!, 5));

        Assert.Equal(before, Snapshot(activity));
    }

    [Fact]
    public void ContentIsValidatedByTypeWithoutPartialUpdate()
    {
        ActivityContent[] invalid =
        [
            new SpeakingContent([]),
            new SpeakingContent([""]),
            new SpeakingContent([new string('q', 2001)]),
            new SpeakingContent(Enumerable.Range(0, 51).Select(i => $"Pregunta {i}").ToList()),
            new ReadingContent("", ["Pregunta"]),
            new ReadingContent("Texto", []),
            new WritingContent("  "),
            new WritingContent(new string('p', 5001)),
            new VocabularyGrammarContent("", ["Ejercicio"]),
            new VocabularyGrammarContent("Explicación", [])
        ];

        foreach (var content in invalid)
        {
            var lesson = Create();
            var activity = Speaking(lesson);
            var before = Snapshot(activity);

            Assert.Throws<ArgumentException>(() => activity.Update("Otro título", "Otras instrucciones", content, 20));

            Assert.Equal(before, Snapshot(activity));
        }
    }

    [Fact]
    public void ExactContentLimitsAreAcceptedForEveryType()
    {
        var lesson = Create();
        var activity = Speaking(lesson);
        var questions = Enumerable.Range(0, 50).Select(_ => new string('q', 2000)).ToList();

        activity.Update("T", "I", new SpeakingContent(questions), 5);
        Assert.Equal(50, Assert.IsType<SpeakingContent>(activity.ReadContent()).QuestionsList.Count);

        activity.Update("T", "I", new ReadingContent(new string('x', 20000), questions), 5);
        Assert.Equal(20000, Assert.IsType<ReadingContent>(activity.ReadContent()).Text.Length);

        activity.Update("T", "I", new WritingContent(new string('p', 5000)), 5);
        Assert.Equal(5000, Assert.IsType<WritingContent>(activity.ReadContent()).Prompt.Length);

        activity.Update("T", "I", new VocabularyGrammarContent(new string('e', 10000), questions), 5);
        Assert.Equal(10000, Assert.IsType<VocabularyGrammarContent>(activity.ReadContent()).Explanation.Length);
    }

    [Fact]
    public void TitleAndInstructionsLimitsAreEnforcedWithoutPartialUpdate()
    {
        var lesson = Create();
        var activity = Speaking(lesson);

        activity.Update(new string('t', 200), new string('i', 2000), new SpeakingContent(["Pregunta"]), 5);
        Assert.Equal(200, activity.Title.Length);
        Assert.Equal(2000, activity.Instructions.Length);
        var accepted = (activity.Title, activity.Instructions, activity.EstimatedDuration);

        (string, string)[] rejected =
        [
            ("", "Instrucciones"),
            ("   ", "Instrucciones"),
            (new string('t', 201), "Instrucciones"),
            ("Título", ""),
            ("Título", "   "),
            ("Título", new string('i', 2001))
        ];

        foreach (var (title, instructions) in rejected)
        {
            Assert.Throws<ArgumentException>(() => activity.Update(title, instructions, new SpeakingContent(["Pregunta"]), 5));
            Assert.Equal(accepted, (activity.Title, activity.Instructions, activity.EstimatedDuration));
        }
    }
}
