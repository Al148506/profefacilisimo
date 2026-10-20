using System.Text.Json;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Tests;

public class ActivityEditingTests
{
    private static Lesson Create() => new(Guid.NewGuid(), "Viajes", LessonLevel.B1, "Vacaciones", "Hablar del pasado");

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
        // The lesson total is owned by the lesson and refreshed when it applies a set, so editing
        // one activity directly must not touch the lesson metadata.
        var lessonBefore = (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.UpdatedAt);

        edited.Update("Otro título", "Otras instrucciones", new WritingContent("Otra consigna."), 45);

        Assert.Equal(siblingBefore, Snapshot(sibling));
        Assert.Equal(lessonBefore, (lesson.Title, lesson.Level, lesson.Topic, lesson.Objective, lesson.UpdatedAt));
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
        Assert.Equal(50, Assert.IsType<SpeakingContent>(activity.ReadContent()).QuestionsList!.Count);

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

    private static SpeakingContent Roleplay(
        string context = "Cena en un restaurante",
        IReadOnlyList<SpeakingRole>? roles = null,
        RoleplayPracticeMode? practiceMode = RoleplayPracticeMode.Guided,
        string? script = null) =>
        new(null, SpeakingSubtype.Roleplay, context,
            roles ?? [new SpeakingRole("Waiter", "Toma el pedido"), new SpeakingRole("Customer", null)],
            null, null, script, practiceMode, null);

    private static SpeakingContent Presentation(
        string context = "Mi ciudad",
        IReadOnlyList<string>? talkingPoints = null) =>
        new(null, SpeakingSubtype.Presentation, context, null, null, null, null, null, talkingPoints);

    [Fact]
    public void LegacySpeakingContentWithoutSubtypeReadsAsConversation()
    {
        using var document = JsonDocument.Parse("""{ "questionsList": ["¿Qué tal?"] }""");

        var content = Assert.IsType<SpeakingContent>(ActivityContent.Read(ActivityType.Speaking, document.RootElement));

        Assert.Equal(SpeakingSubtype.Conversation, content.Subtype);
        content.Validate();
    }

    [Fact]
    public void RoleplayAndPresentationContentRoundTripWithEveryField()
    {
        var lesson = Create();
        var activity = Speaking(lesson);
        var roleplay = Roleplay(script: "Waiter: Good evening!\nCustomer: Not yet.", practiceMode: RoleplayPracticeMode.Scripted);
        var roleplayWithExtras = roleplay with { Objective = "Pedir la cuenta", Material = "Tarjetas de vocabulario" };
        var presentation = Presentation(talkingPoints: ["Lugares", "Comida"]);

        activity.Update("Roleplay", "Instrucciones", roleplayWithExtras, 10);
        var readRoleplay = Assert.IsType<SpeakingContent>(activity.ReadContent());
        Assert.Equal(SpeakingSubtype.Roleplay, readRoleplay.Subtype);
        Assert.Equal("Cena en un restaurante", readRoleplay.Context);
        Assert.Equal([new SpeakingRole("Waiter", "Toma el pedido"), new SpeakingRole("Customer", null)], readRoleplay.Roles);
        Assert.Equal("Pedir la cuenta", readRoleplay.Objective);
        Assert.Equal("Tarjetas de vocabulario", readRoleplay.Material);
        Assert.Equal("Waiter: Good evening!\nCustomer: Not yet.", readRoleplay.Script);
        Assert.Equal(RoleplayPracticeMode.Scripted, readRoleplay.PracticeMode);

        activity.Update("Presentación", "Instrucciones", presentation, 10);
        var readPresentation = Assert.IsType<SpeakingContent>(activity.ReadContent());
        Assert.Equal(SpeakingSubtype.Presentation, readPresentation.Subtype);
        Assert.Equal(["Lugares", "Comida"], readPresentation.TalkingPoints);
        Assert.Null(readPresentation.QuestionsList);
    }

    [Fact]
    public void EnumsAreStoredAsCamelCaseStringsInContentJson()
    {
        var lesson = Create();
        var activity = Speaking(lesson);

        activity.Update("Roleplay", "Instrucciones", Roleplay(), 10);

        Assert.Contains("\"subtype\":\"roleplay\"", activity.Content);
        Assert.Contains("\"practiceMode\":\"guided\"", activity.Content);
    }

    [Fact]
    public void SubtypeRulesRejectIncompatibleContentWithoutPartialUpdate()
    {
        SpeakingContent[] invalid =
        [
            // Conversation still needs its 1–50 questions.
            new([], SpeakingSubtype.Conversation),
            new(null, SpeakingSubtype.Conversation),
            // Roleplay: context and roles are required within their own limits.
            Roleplay(context: ""),
            Roleplay(roles: [new SpeakingRole("Waiter", null)]),
            Roleplay(roles: Enumerable.Range(0, 7).Select(i => new SpeakingRole($"Rol {i}", null)).ToList()),
            Roleplay(roles: [new SpeakingRole(new string('n', 101), null), new SpeakingRole("B", null)]),
            Roleplay(roles: [new SpeakingRole("A", new string('d', 501)), new SpeakingRole("B", null)]),
            // Roleplay: the practice mode is mandatory, and scripted needs a non-blank script.
            Roleplay(practiceMode: null),
            Roleplay(practiceMode: RoleplayPracticeMode.Scripted, script: null),
            Roleplay(practiceMode: RoleplayPracticeMode.Scripted, script: "   "),
            // Presentation: context is required; talking points stay optional but bounded.
            Presentation(context: "   "),
            Presentation(talkingPoints: Enumerable.Range(0, 21).Select(i => $"Punto {i}").ToList()),
            Presentation(talkingPoints: [new string('p', 501)])
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
    public void ExactSubtypeLimitsAreAccepted()
    {
        var lesson = Create();
        var activity = Speaking(lesson);
        var roleplay = Roleplay(
            context: new string('c', 2000),
            roles: [new SpeakingRole(new string('n', 100), new string('d', 500)), new SpeakingRole("B", null)],
            practiceMode: RoleplayPracticeMode.Scripted,
            script: new string('s', 10000)) with { Objective = new string('o', 2000), Material = new string('m', 5000) };

        activity.Update("T", "I", roleplay, 5);
        var readRoleplay = Assert.IsType<SpeakingContent>(activity.ReadContent());
        Assert.Equal(2000, readRoleplay.Context!.Length);
        Assert.Equal(100, readRoleplay.Roles![0].Name.Length);
        Assert.Equal(500, readRoleplay.Roles[0].Description!.Length);
        Assert.Equal(2000, readRoleplay.Objective!.Length);
        Assert.Equal(5000, readRoleplay.Material!.Length);
        Assert.Equal(10000, readRoleplay.Script!.Length);

        activity.Update("T", "I", Presentation(
            talkingPoints: Enumerable.Range(0, 20).Select(_ => new string('p', 500)).ToList()), 5);
        var readPresentation = Assert.IsType<SpeakingContent>(activity.ReadContent());
        Assert.Equal(20, readPresentation.TalkingPoints!.Count);
        Assert.Equal(500, readPresentation.TalkingPoints[0].Length);
    }
}
