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
}
