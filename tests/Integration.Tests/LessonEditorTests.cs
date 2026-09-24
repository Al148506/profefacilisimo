using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Profefacilisimo.Application.Lessons;
using Profefacilisimo.Domain;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

// The editor writes the metadata and the complete activity set in one request. These tests cover the
// save as a whole: identity of the activities, order, deletions, total and the single transaction.
public class LessonEditorTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private HttpClient Client(Guid owner)
    {
        var client = fixture.Browser();
        var token = new JwtSecurityToken("Profefacilisimo", "Profefacilisimo.Web",
            [new Claim("sub", owner.ToString())], expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFixture.SigningKey)),
                SecurityAlgorithms.HmacSha256));
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        return client;
    }

    private async Task<Guid> SeedOwnerAsync()
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var owner = Guid.NewGuid();
        db.Users.Add(new AppUser { Id = owner, UserName = owner.ToString() });
        await db.SaveChangesAsync();
        return owner;
    }

    // A lesson written straight through the domain, which is also how the legacy rows look: a null
    // duration means the activity was never completed in the editor.
    private async Task<Guid> SeedLessonAsync(Guid owner, string title, params (string Title, int? Duration)[] activities)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lesson = new Lesson(owner, title, LessonLevel.B1, "Tema", "Objetivo");
        foreach (var (activityTitle, duration) in activities)
            lesson.AddActivity(activityTitle, "Instrucciones", new WritingContent("Consigna"), duration);
        db.Lessons.Add(lesson);
        await db.SaveChangesAsync();
        return lesson.Id;
    }

    private static LessonActivityInput Input(string type, string title, int duration, object content, Guid? id = null) =>
        new(id, type, title, "Instrucciones de " + title, duration,
            JsonSerializer.SerializeToElement(content, content.GetType(), JsonOptions));

    private async Task<int> CountActivitiesAsync(Guid lessonId)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Activities.CountAsync(x => x.LessonId == lessonId);
    }

    private async Task<int?> TotalAsync(Guid lessonId)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == lessonId)).EstimatedDuration;
    }

    private async Task<bool> ActivityExistsAsync(Guid activityId)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Activities.AnyAsync(x => x.Id == activityId);
    }

    private async Task<Guid> FirstActivityIdAsync(Guid lessonId)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Activities.Where(x => x.LessonId == lessonId)
            .OrderBy(x => x.Order).Select(x => x.Id).FirstAsync();
    }

    // Everything the owner has persisted, as PostgreSQL sees it. Comparing two snapshots proves that
    // a rejected or aborted save changed nothing at all: not metadata, not order, not the total.
    private async Task<string[]> SnapshotAsync(Guid owner)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lessons = await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(l)::text AS "Value" FROM "Lessons" l WHERE l."UserId" = {0} ORDER BY l."Id"
            """, owner).ToArrayAsync();
        var activities = await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(a)::text AS "Value" FROM "Activities" a
            JOIN "Lessons" l ON l."Id" = a."LessonId" WHERE l."UserId" = {0} ORDER BY a."Id"
            """, owner).ToArrayAsync();
        return [.. lessons, "---", .. activities];
    }

    [Fact]
    public async Task CreateSavesMetadataAndTheWholeSetInOneRequest()
    {
        var owner = await SeedOwnerAsync();
        using var client = Client(owner);
        var response = await client.PostAsJsonAsync("/api/lessons", new SaveLessonRequest("Clase", "B1", "Tema", "Objetivo",
        [
            Input("Speaking", "Hablar", 10, new { questionsList = new[] { "¿Qué tal?" } }),
            Input("Reading", "Leer", 15, new { text = "Lectura", questionsList = new[] { "Pregunta" } }),
            Input("Writing", "Escribir", 5, new { prompt = "Consigna" }),
            Input("VocabularyGrammar", "Gramática", 20, new { explanation = "Explicación", exercises = new[] { "Ejercicio" } }),
        ]));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal($"/api/lessons/{detail.Id}", response.Headers.Location!.OriginalString);
        // The server assigns the order from the position in the array and calculates the total itself.
        Assert.Equal(new[] { 0, 1, 2, 3 }, detail.Activities.Select(x => x.Order));
        Assert.Equal(new[] { "Speaking", "Reading", "Writing", "VocabularyGrammar" }, detail.Activities.Select(x => x.Type));
        Assert.Equal(new int?[] { 10, 15, 5, 20 }, detail.Activities.Select(x => x.EstimatedDuration));
        Assert.Equal(50, detail.EstimatedDuration);
        Assert.All(detail.Activities, x => Assert.NotEqual(Guid.Empty, x.Id));

        // Reloading reproduces exactly the state that was saved. The content is compared by value,
        // because jsonb normalizes the key order of the stored object and the legacy content also
        // carries a redundant `type` that the column overrides.
        var reloaded = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{detail.Id}"))!;
        Assert.Equal(
            detail.Activities.Select(x => (x.Id, x.Order, x.Type, x.Title, x.Instructions, x.EstimatedDuration)),
            reloaded.Activities.Select(x => (x.Id, x.Order, x.Type, x.Title, x.Instructions, x.EstimatedDuration)));
        Assert.Equal("¿Qué tal?", reloaded.Activities[0].Content.GetProperty("questionsList")[0].GetString());
        Assert.Equal("Lectura", reloaded.Activities[1].Content.GetProperty("text").GetString());
        Assert.Equal("Pregunta", reloaded.Activities[1].Content.GetProperty("questionsList")[0].GetString());
        Assert.Equal("Consigna", reloaded.Activities[2].Content.GetProperty("prompt").GetString());
        Assert.Equal("Explicación", reloaded.Activities[3].Content.GetProperty("explanation").GetString());
        Assert.Equal("Ejercicio", reloaded.Activities[3].Content.GetProperty("exercises")[0].GetString());
        Assert.Equal(50, reloaded.EstimatedDuration);
        Assert.Equal(4, await CountActivitiesAsync(detail.Id));
    }

    [Fact]
    public async Task CreateAcceptsAnAbsentOrEmptySetAndLeavesTotalZero()
    {
        var owner = await SeedOwnerAsync();
        using var client = Client(owner);
        var absent = (await (await client.PostAsJsonAsync("/api/lessons",
            new SaveLessonRequest("Sin actividades", "A2", "Tema", "Objetivo", null)))
            .Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        var empty = (await (await client.PostAsJsonAsync("/api/lessons",
            new SaveLessonRequest("Array vacío", "A2", "Tema", "Objetivo", [])))
            .Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Empty(absent.Activities);
        Assert.Equal(0, absent.EstimatedDuration);
        Assert.Empty(empty.Activities);
        Assert.Equal(0, empty.EstimatedDuration);
        Assert.Equal(0, await CountActivitiesAsync(absent.Id));
        Assert.Equal(0, await TotalAsync(empty.Id));
    }

    [Fact]
    public async Task UpdateSavesEditsAdditionsDeletionsAndOrderTogether()
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Original", ("A", 10), ("B", 15), ("C", 5));
        using var client = Client(owner);
        var before = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lessonId}"))!;
        Assert.Equal(30, before.EstimatedDuration);
        var (a, b, c) = (before.Activities[0], before.Activities[1], before.Activities[2]);

        var response = await client.PutAsJsonAsync($"/api/lessons/{lessonId}", new SaveLessonRequest("Actualizada", "B2", "Nuevo tema", "Nuevo objetivo",
        [
            Input("Writing", "B", 15, new { prompt = "Consigna" }, b.Id),   // keeps its Id, moves to the front
            Input("Writing", "Nueva", 7, new { prompt = "Otra consigna" }), // no Id, so the server creates it
            Input("Writing", "A", 10, new { prompt = "Consigna" }, a.Id),   // keeps its Id, moves to the end
        ]));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal(("Actualizada", "B2", "Nuevo tema", "Nuevo objetivo"), (detail.Title, detail.Level, detail.Topic, detail.Objective));
        Assert.Equal(new[] { 0, 1, 2 }, detail.Activities.Select(x => x.Order));
        Assert.Equal(new[] { b.Id, a.Id }, new[] { detail.Activities[0].Id, detail.Activities[2].Id });
        Assert.NotEqual(Guid.Empty, detail.Activities[1].Id);
        Assert.DoesNotContain(c.Id, detail.Activities.Select(x => x.Id));
        Assert.Equal(new int?[] { 15, 7, 10 }, detail.Activities.Select(x => x.EstimatedDuration));
        Assert.Equal(32, detail.EstimatedDuration);

        // Omitting an activity is its deletion, and the total is persisted, not only returned.
        Assert.Equal(3, await CountActivitiesAsync(lessonId));
        Assert.False(await ActivityExistsAsync(c.Id));
        Assert.Equal(32, await TotalAsync(lessonId));
    }

    [Fact]
    public async Task SwappingTwoActivitiesDoesNotViolateTheUniqueOrderIndex()
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Original", ("A", 10), ("B", 15), ("C", 5));
        using var client = Client(owner);
        var before = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lessonId}"))!;
        var stored = before.Activities.Select(x => x.Id).ToArray();
        var titles = new Dictionary<Guid, (string Title, int Duration)>
        {
            [stored[0]] = ("A", 10), [stored[1]] = ("B", 15), [stored[2]] = ("C", 5),
        };
        // Positions 0 and 1 are exchanged, so the final orders collide with the stored ones unless the
        // persisted rows are parked above them first.
        var swapped = new[] { stored[1], stored[0], stored[2] };
        var response = await client.PutAsJsonAsync($"/api/lessons/{lessonId}", new SaveLessonRequest("Original", "B1", "Tema", "Objetivo",
            swapped.Select(id => Input("Writing", titles[id].Title, titles[id].Duration, new { prompt = "Consigna" }, id)).ToArray()));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal(swapped, detail.Activities.Select(x => x.Id));
        Assert.Equal(new[] { 0, 1, 2 }, detail.Activities.Select(x => x.Order));
        // With no intervals between activities, reordering never changes the sum.
        Assert.Equal(30, detail.EstimatedDuration);
    }

    [Theory]
    [InlineData("other-lesson")]
    [InlineData("other-owner")]
    [InlineData("repeated")]
    [InlineData("unknown")]
    public async Task UpdateRejectsForeignRepeatedAndUnknownIdsWithoutPartialPersistence(string scenario)
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Original", ("A", 10), ("B", 15));
        var otherOwner = await SeedOwnerAsync();
        var foreignLessonId = await SeedLessonAsync(otherOwner, "Ajena", ("De otro profesor", 5));
        using var client = Client(owner);
        var before = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lessonId}"))!;
        var a = before.Activities[0];
        var second = scenario switch
        {
            // An activity of another lesson, whether it belongs to this owner or to a different one.
            "other-lesson" => await FirstActivityIdAsync(await SeedLessonAsync(owner, "Otra propia", ("De otra clase", 5))),
            "other-owner" => await FirstActivityIdAsync(foreignLessonId),
            "repeated" => a.Id,
            _ => Guid.NewGuid()
        };

        var snapshot = await SnapshotAsync(owner);
        var response = await client.PutAsJsonAsync($"/api/lessons/{lessonId}", new SaveLessonRequest("Cambio", "B2", "Tema", "Objetivo",
        [
            Input("Writing", "A", 10, new { prompt = "Consigna" }, a.Id),
            Input("Writing", "B", 15, new { prompt = "Consigna" }, second),
        ]));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(problem.GetProperty("errors").TryGetProperty("activities[1].id", out _));
        // An Id that is repeated, foreign or unknown is never read as a new activity: nothing is saved.
        Assert.Equal(snapshot, await SnapshotAsync(owner));
    }

    [Fact]
    public async Task UpdateWithoutTheActivitySetIsRejectedAndNeverDeletes()
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Original", ("A", 10));
        using var client = Client(owner);
        var snapshot = await SnapshotAsync(owner);
        var response = await client.PutAsJsonAsync($"/api/lessons/{lessonId}",
            new SaveLessonRequest("Cambio", "B2", "Tema", "Objetivo", null));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(problem.GetProperty("errors").TryGetProperty("activities", out _));
        // An omitted array is a rejected request, never a request to delete every activity.
        Assert.Equal(snapshot, await SnapshotAsync(owner));
    }

    [Fact]
    public async Task UpdateWithAnEmptySetDeletesEveryActivityAndLeavesTotalZero()
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Original", ("A", 10), ("B", 15));
        using var client = Client(owner);
        var response = await client.PutAsJsonAsync($"/api/lessons/{lessonId}",
            new SaveLessonRequest("Original", "B1", "Tema", "Objetivo", []));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Empty(detail.Activities);
        Assert.Equal(0, detail.EstimatedDuration);
        Assert.Equal(0, await CountActivitiesAsync(lessonId));
        Assert.Equal(0, await TotalAsync(lessonId));
    }

    [Theory]
    [InlineData("duration-zero", "activities[1].estimatedDuration")]
    [InlineData("duration-negative", "activities[1].estimatedDuration")]
    [InlineData("unknown-type", "activities[1].type")]
    [InlineData("content-of-another-type", "activities[1].content")]
    [InlineData("empty-questions", "activities[1].content")]
    [InlineData("too-many-questions", "activities[1].content")]
    [InlineData("blank-title", "activities[1].title")]
    [InlineData("blank-prompt", "activities[1].content")]
    [InlineData("content-not-an-object", "activities[1].content")]
    public async Task OneInvalidActivityRejectsTheWholeSaveAndPointsAtIt(string scenario, string field)
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Original", ("A", 10));
        using var client = Client(owner);
        var invalid = scenario switch
        {
            "duration-zero" => Input("Writing", "A", 10, new { prompt = "Consigna" }) with { EstimatedDuration = 0 },
            "duration-negative" => Input("Writing", "A", -5, new { prompt = "Consigna" }),
            "unknown-type" => Input("Nope", "A", 10, new { prompt = "Consigna" }),
            "content-of-another-type" => Input("Reading", "A", 10, new { prompt = "Consigna" }),
            "empty-questions" => Input("Speaking", "A", 10, new { questionsList = Array.Empty<string>() }),
            "too-many-questions" => Input("Speaking", "A", 10, new { questionsList = Enumerable.Repeat("x", 51).ToArray() }),
            "blank-title" => Input("Writing", "   ", 10, new { prompt = "Consigna" }),
            "blank-prompt" => Input("Writing", "A", 10, new { prompt = "" }),
            _ => new LessonActivityInput(null, "Writing", "A", "Instrucciones", 10, JsonSerializer.SerializeToElement("texto"))
        };

        var snapshot = await SnapshotAsync(owner);
        var response = await client.PutAsJsonAsync($"/api/lessons/{lessonId}", new SaveLessonRequest("Cambio", "B2", "Tema", "Objetivo",
        [
            Input("Writing", "Válida", 10, new { prompt = "Consigna" }),
            invalid,
        ]));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<JsonElement>();
        // The key identifies the exact activity and field, so the editor can mark it in the list.
        Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _));
        // One invalid activity rejects the entire class, and nothing is written partially.
        Assert.Equal(snapshot, await SnapshotAsync(owner));
    }

    [Fact]
    public async Task LegacyActivityWithoutDurationMustBeCompletedBeforeSaving()
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Heredada", ("A", null), ("B", 15));
        using var client = Client(owner);
        var before = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lessonId}"))!;
        Assert.Null(before.EstimatedDuration);
        var (a, b) = (before.Activities[0], before.Activities[1]);

        // The editor re-sends the loaded activity with no duration yet, and the save is rejected.
        var incomplete = await client.PutAsJsonAsync($"/api/lessons/{lessonId}", new SaveLessonRequest("Heredada", "B1", "Tema", "Objetivo",
        [
            Input("Writing", "A", 0, new { prompt = "Consigna" }, a.Id),
            Input("Writing", "B", 15, new { prompt = "Consigna" }, b.Id),
        ]));
        Assert.Equal(HttpStatusCode.BadRequest, incomplete.StatusCode);
        var problem = await incomplete.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(problem.GetProperty("errors").TryGetProperty("activities[0].estimatedDuration", out _));
        Assert.Null(await TotalAsync(lessonId));

        // Completing the missing duration is what turns the lesson complete again.
        var completed = await client.PutAsJsonAsync($"/api/lessons/{lessonId}", new SaveLessonRequest("Heredada", "B1", "Tema", "Objetivo",
        [
            Input("Writing", "A", 10, new { prompt = "Consigna" }, a.Id),
            Input("Writing", "B", 15, new { prompt = "Consigna" }, b.Id),
        ]));
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        var detail = (await completed.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal(25, detail.EstimatedDuration);
        Assert.Equal(new[] { a.Id, b.Id }, detail.Activities.Select(x => x.Id));
        Assert.Equal(25, await TotalAsync(lessonId));
    }

    [Fact]
    public async Task RollsBackMetadataActivitiesOrderAndTotalWhenAFailureHappensBeforeCommit()
    {
        var owner = await SeedOwnerAsync();
        var lessonId = await SeedLessonAsync(owner, "Original", ("A", 10), ("B", 15));
        using var client = Client(owner);
        var before = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lessonId}"))!;
        var (a, b) = (before.Activities[0], before.Activities[1]);
        var snapshot = await SnapshotAsync(owner);

        var interceptor = new FailOnSecondSave(lessonId);
        await using (var failingDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor).Options))
        {
            var service = new LessonService(failingDb);
            // Metadata, a deletion, an insertion and a new order all change in the same save.
            var request = new SaveLessonRequest("Cambiada", "B2", "Otro tema", "Otro objetivo",
            [
                Input("Writing", "B", 15, new { prompt = "Consigna" }, b.Id),
                Input("Writing", "Nueva", 25, new { prompt = "Otra consigna" }),
            ]);
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateAsync(lessonId, owner, request, default));
        }

        Assert.True(interceptor.ObservedFinalChangesBeforeCommit);
        // Nothing of the aborted save survives: not the parked order, not the metadata, not the total.
        Assert.Equal(snapshot, await SnapshotAsync(owner));
        Assert.True(await ActivityExistsAsync(a.Id));
    }

    // The service saves twice inside one transaction: the first pass parks the persisted activities
    // and the second applies the final set. Failing at the end of the second save proves that the
    // transaction, and not only the last statement, is what protects the lesson.
    private sealed class FailOnSecondSave(Guid lessonId) : Microsoft.EntityFrameworkCore.Diagnostics.SaveChangesInterceptor
    {
        private int _saves;
        public bool ObservedFinalChangesBeforeCommit { get; private set; }

        public override async ValueTask<int> SavedChangesAsync(
            Microsoft.EntityFrameworkCore.Diagnostics.SaveChangesCompletedEventData eventData,
            int result, CancellationToken cancellationToken = default)
        {
            _saves++;
            if (_saves < 2) return result;
            var db = (AppDbContext)eventData.Context!;
            Assert.NotNull(db.Database.CurrentTransaction);
            // Inside the transaction the final state is already visible, which is what makes the
            // rollback assertion meaningful.
            Assert.Equal("Cambiada", (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == lessonId, cancellationToken)).Title);
            Assert.Equal(new[] { 0, 1 }, await db.Activities.Where(x => x.LessonId == lessonId)
                .OrderBy(x => x.Order).Select(x => x.Order).ToArrayAsync(cancellationToken));
            ObservedFinalChangesBeforeCommit = true;
            throw new InvalidOperationException("Injected failure after the final save, before commit.");
        }
    }
}
