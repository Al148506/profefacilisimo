using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Profefacilisimo.Application.Lessons;
using Profefacilisimo.Domain;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

public class LessonManagementTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private HttpClient Client(string? sub)
    {
        var client = fixture.Browser();
        if (sub is not null)
        {
            var token = new JwtSecurityToken("Profefacilisimo", "Profefacilisimo.Web",
                [new Claim("sub", sub)], expires: DateTime.UtcNow.AddMinutes(5),
                signingCredentials: new SigningCredentials(
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(ApiFixture.SigningKey)),
                    SecurityAlgorithms.HmacSha256));
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        }
        return client;
    }

    private async Task<(Guid Owner, Lesson[] Lessons)> Seed(params string[] titles)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var owner = Guid.NewGuid();
        db.Users.Add(new AppUser { Id = owner, UserName = owner.ToString() });
        var lessons = titles.Select((title, i) => new Lesson(owner, title,
            i % 2 == 0 ? LessonLevel.B1 : LessonLevel.B2, "Tema", "Objetivo")).ToArray();
        db.Lessons.AddRange(lessons);
        await db.SaveChangesAsync();
        return (owner, lessons);
    }

    private static async Task<LessonListItemDto[]> List(HttpClient client, string query = "") =>
        (await client.GetFromJsonAsync<LessonListItemDto[]>("/api/lessons" + query))!;

    [Theory]
    [InlineData(null)]
    [InlineData("invalid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task ReadsRequireAuthenticatedValidSubject(string? sub)
    {
        using var client = Client(sub);
        foreach (var path in new[] { "/api/lessons", "/api/lessons?state=trash", $"/api/lessons/{Guid.NewGuid()}" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
    }

    [Fact]
    public async Task ListIsPrivateUnpaginatedAndOrderedWithStableTies()
    {
        var (owner, lessons) = await Seed(Enumerable.Range(0, 25).Select(i => $"Clase {i}").ToArray());
        var (other, others) = await Seed("Secreto");
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var time = new DateTimeOffset(2026, 9, 1, 12, 0, 0, TimeSpan.Zero);
        await db.Lessons.Where(x => x.UserId == owner)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UpdatedAt, time));
        await db.Lessons.Where(x => x.Id == lessons[0].Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UpdatedAt, time.AddDays(1)));
        using var client = Client(owner.ToString());
        var list = await List(client, $"?userId={other}&pageSize=1");
        Assert.Equal(25, list.Length);
        Assert.Equal(lessons[0].Id, list[0].Id);
        Assert.Equal(lessons.Skip(1).Select(x => x.Id).OrderBy(x => x), list.Skip(1).Select(x => x.Id));
        Assert.DoesNotContain(list, x => x.Id == others[0].Id);
        using var otherClient = Client(other.ToString());
        Assert.Equal(others[0].Id, Assert.Single(await List(otherClient)).Id);
        var (empty, _) = await Seed();
        using var emptyClient = Client(empty.ToString());
        Assert.Empty(await List(emptyClient));
    }

    [Fact]
    public async Task ListAndDetailExposeTheCalculatedTotalOrNullWhenIncomplete()
    {
        var (owner, lessons) = await Seed("Completa", "Incompleta", "Vacía");
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var complete = await db.Lessons.SingleAsync(x => x.Id == lessons[0].Id);
        complete.AddActivity("A", "Instrucciones", new WritingContent("Texto"), 10);
        complete.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]), 20);
        var incomplete = await db.Lessons.SingleAsync(x => x.Id == lessons[1].Id);
        incomplete.AddActivity("A", "Instrucciones", new WritingContent("Texto"), 10);
        incomplete.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]));
        await db.SaveChangesAsync();

        using var client = Client(owner.ToString());
        var list = (await List(client)).ToDictionary(x => x.Id);
        // The listing carries the persisted total: the sum when complete, null while incomplete and
        // 0 for a lesson without activities.
        Assert.Equal(30, list[complete.Id].EstimatedDuration);
        Assert.Null(list[incomplete.Id].EstimatedDuration);
        Assert.Equal(0, list[lessons[2].Id].EstimatedDuration);

        var detail = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{complete.Id}"))!;
        Assert.Equal(30, detail.EstimatedDuration);
        Assert.Null((await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{incomplete.Id}"))!.EstimatedDuration);
        Assert.Equal(0, (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lessons[2].Id}"))!.EstimatedDuration);
    }

    [Theory]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("\\")]
    [InlineData("!")]
    public async Task SearchTreatsSqlPatternCharactersLiterally(string literal)
    {
        var (owner, lessons) = await Seed("Prefijo " + literal + " fin", "Prefijo x fin");
        using var client = Client(owner.ToString());
        var list = await List(client, "?search=" + Uri.EscapeDataString(literal));
        Assert.Equal(lessons[0].Id, Assert.Single(list).Id);
    }

    [Fact]
    public async Task SearchTrimsIgnoresCaseAndCombinesWithLevel()
    {
        var (owner, lessons) = await Seed("Viajes", "VIAJES largos", "Otra");
        using var client = Client(owner.ToString());
        Assert.Equal(2, (await List(client, "?search=%20viaj%20")).Length);
        Assert.Equal(lessons[1].Id, Assert.Single(await List(client, "?search=viaj&level=B2")).Id);
        Assert.Empty(await List(client, "?search=viaj&level=A2"));
        Assert.Equal(3, (await List(client, "?search=%20&level=")).Length);
    }

    [Theory]
    [InlineData("?state=unknown", "state")]
    [InlineData("?state=", "state")]
    [InlineData("?level=0", "level")]
    [InlineData("?level=B3", "level")]
    [InlineData("?level=b1", "level")]
    public async Task InvalidFiltersReturnValidationProblem(string query, string key)
    {
        using var client = Client(Guid.NewGuid().ToString());
        var response = await client.GetAsync("/api/lessons" + query);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
        Assert.True(problem.GetProperty("errors").TryGetProperty(key, out _));
    }

    [Fact]
    public async Task SearchLengthIsValidatedOnlyForActiveList()
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/lessons?search=" + new string('x', 200))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/lessons?search=" + new string('x', 201))).StatusCode);
        Assert.Empty(await List(client, "?state=trash&level=invalid&search=" + new string('x', 201)));
    }

    [Fact]
    public async Task TrashIsPrivateOrderedAndIgnoresFiltersWhileDetailsHideDeletedAndForeignLessons()
    {
        var (owner, lessons) = await Seed("Activa", "Eliminada1", "Eliminada2", "Eliminada3");
        var (other, others) = await Seed("Ajena");
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var time = new DateTimeOffset(2026, 9, 1, 12, 0, 0, TimeSpan.Zero);
        await db.Lessons.Where(x => x.UserId == owner && x.Id != lessons[0].Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.DeletedAt, time));
        await db.Lessons.Where(x => x.Id == lessons[1].Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.DeletedAt, time.AddDays(1)));
        await db.Lessons.Where(x => x.UserId == other).ExecuteUpdateAsync(s => s.SetProperty(x => x.DeletedAt, time));
        using var client = Client(owner.ToString());
        Assert.Equal(lessons[0].Id, Assert.Single(await List(client)).Id);
        var trash = await List(client, "?state=trash&search=nomatch&level=A2");
        Assert.Equal(3, trash.Length);
        Assert.Equal(lessons[1].Id, trash[0].Id);
        Assert.Equal(lessons.Skip(2).Select(x => x.Id).OrderBy(x => x), trash.Skip(1).Select(x => x.Id));
        Assert.All(trash, x => Assert.NotNull(x.DeletedAt));
        foreach (var id in new[] { lessons[1].Id, others[0].Id, Guid.NewGuid() })
        {
            var response = await client.GetAsync($"/api/lessons/{id}");
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        using var foreignClient = Client(other.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await foreignClient.GetAsync($"/api/lessons/{lessons[0].Id}")).StatusCode);
        Assert.Equal(others[0].Id, Assert.Single(await List(foreignClient, "?state=trash")).Id);
    }

    [Fact]
    public async Task DetailsContainOrderedReadonlyActivitiesAndJsonObjectsWithoutOwner()
    {
        var (owner, lessons) = await Seed("Detalle");
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lesson = await db.Lessons.SingleAsync(x => x.Id == lessons[0].Id);
        var first = lesson.AddActivity("Primera", "Instrucciones", new WritingContent("<script>texto</script>"));
        var second = lesson.AddActivity("Segunda", "Instrucciones", new ReadingContent("Lectura", ["Pregunta"]), 15);
        db.Activities.AddRange(first, second);
        await db.SaveChangesAsync();
        using var client = Client(owner.ToString());
        var response = await client.GetAsync($"/api/lessons/{lesson.Id}");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();
        var detail = System.Text.Json.JsonSerializer.Deserialize<LessonDetailsDto>(body, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!;
        Assert.Equal("B1", detail.Level);
        Assert.Equal("Objetivo", detail.Objective);
        Assert.Null(detail.EstimatedDuration);
        Assert.Null(detail.DeletedAt);
        Assert.Equal(new[] { first.Id, second.Id }, detail.Activities.Select(x => x.Id));
        Assert.Equal(new[] { 0, 1 }, detail.Activities.Select(x => x.Order));
        Assert.Equal("Writing", detail.Activities[0].Type);
        Assert.Null(detail.Activities[0].EstimatedDuration);
        Assert.Equal(15, detail.Activities[1].EstimatedDuration);
        Assert.Equal("<script>texto</script>", detail.Activities[0].Content.GetProperty("prompt").GetString());
        using var document = System.Text.Json.JsonDocument.Parse(body);
        var json = document.RootElement;
        Assert.False(json.TryGetProperty("userId", out _));
        var listJson = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/api/lessons");
        Assert.False(listJson[0].TryGetProperty("activities", out _));
        Assert.False(listJson[0].TryGetProperty("userId", out _));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("invalid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task WritesRequireAuthenticatedValidSubject(string? sub)
    {
        using var client = Client(sub);
        var body = new SaveLessonRequest("Título", "B1", "Tema", "Objetivo");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/lessons", body)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PutAsJsonAsync($"/api/lessons/{Guid.NewGuid()}", body)).StatusCode);
    }

    [Theory]
    [InlineData("A2")]
    [InlineData("B1")]
    [InlineData("B2")]
    public async Task CreateTrimsMetadataIgnoresProtectedFieldsAndAllowsDuplicateTitles(string level)
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        var start = DateTimeOffset.UtcNow.AddSeconds(-1);
        var payload = new
        {
            title = "  Nueva  ", level, topic = " Tema ", objective = " Objetivo ",
            userId = Guid.NewGuid(), id = Guid.NewGuid(), deletedAt = start,
            createdAt = start.AddYears(-1), updatedAt = start.AddYears(-1), estimatedDuration = 99,
            activities = new[] { new { title = "Inyectada" } }
        };
        var response = await client.PostAsJsonAsync("/api/lessons", payload);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal($"/api/lessons/{detail.Id}", response.Headers.Location!.OriginalString);
        Assert.NotEqual(Guid.Empty, detail.Id);
        Assert.NotEqual(payload.id, detail.Id);
        Assert.Equal(("Nueva", level, "Tema", "Objetivo"), (detail.Title, detail.Level, detail.Topic, detail.Objective));
        Assert.Empty(detail.Activities);
        Assert.Equal(0, detail.EstimatedDuration);
        Assert.Null(detail.DeletedAt);
        Assert.InRange(detail.CreatedAt, start, DateTimeOffset.UtcNow);
        Assert.Equal(detail.CreatedAt, detail.UpdatedAt);
        Assert.Equal(TimeSpan.Zero, detail.CreatedAt.Offset);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(response.Headers.Location)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/lessons", payload)).StatusCode);
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(owner, (await db.Lessons.SingleAsync(x => x.Id == detail.Id)).UserId);
        Assert.Equal(2, await db.Lessons.CountAsync(x => x.UserId == owner));
    }

    public static IEnumerable<object?[]> InvalidSaveFields()
    {
        foreach (var field in new[] { "title", "topic", "objective" })
        foreach (var value in new string?[] { null, "", "   ", new('x', field == "objective" ? 2001 : 201) })
            yield return [field, value];
        foreach (var value in new string?[] { null, "", "B3", "b1", "0" })
            yield return ["level", value];
    }

    [Theory]
    [MemberData(nameof(InvalidSaveFields))]
    public async Task InvalidSaveReturnsValidationProblemAndDoesNotMutate(string field, string? value)
    {
        var (owner, lessons) = await Seed("Original");
        using var client = Client(owner.ToString());
        var body = new Dictionary<string, string?> { ["title"] = "Cambio", ["level"] = "A2", ["topic"] = "Tema", ["objective"] = "Objetivo" };
        body[field] = value;
        foreach (var response in new[]
        {
            await client.PostAsJsonAsync("/api/lessons", body),
            await client.PutAsJsonAsync($"/api/lessons/{lessons[0].Id}", body)
        })
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
            var problem = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();
            Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _));
        }
        var detail = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lessons[0].Id}"))!;
        Assert.Equal("Original", detail.Title);
        Assert.Equal("B1", detail.Level);
        Assert.Single(await List(client));
    }

    [Fact]
    public async Task MissingFieldsRejectedAndExactLimitsAccepted()
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/lessons", new { })).StatusCode);
        var body = new SaveLessonRequest(new string('t', 200), "A2", new string('t', 200), new string('o', 2000));
        var response = await client.PostAsJsonAsync("/api/lessons", body);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/lessons/{detail.Id}", body)).StatusCode);
    }

    [Fact]
    public async Task UpdateOnlyChangesMetadataAndPreservesStoredActivitiesExactly()
    {
        var (owner, _) = await Seed();
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var lesson = new Lesson(owner, "Anterior", LessonLevel.B1, "Tema", "Objetivo");
        lesson.AddActivity("Una", "Instrucciones", new WritingContent("Texto"), 5);
        lesson.AddActivity("Dos", "Instrucciones", new ReadingContent("Lectura", ["Pregunta"]), 15);
        db.Lessons.Add(lesson);
        await db.SaveChangesAsync();
        var before = await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(a)::text AS "Value" FROM "Activities" a ORDER BY a."Id"
            """).ToArrayAsync();
        var createdAt = (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == lesson.Id)).CreatedAt;
        using var client = Client(owner.ToString());
        var start = DateTimeOffset.UtcNow.AddSeconds(-1);
        var response = await client.PutAsJsonAsync($"/api/lessons/{lesson.Id}", new
        {
            title = " Actualizada ", level = "B2", topic = " Nuevo tema ", objective = " Nuevo objetivo ",
            userId = Guid.NewGuid(), id = Guid.NewGuid(), estimatedDuration = 999,
            createdAt = start.AddYears(-1), updatedAt = start.AddYears(-1), deletedAt = start,
            activities = Array.Empty<object>()
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal(("Actualizada", "B2", "Nuevo tema", "Nuevo objetivo"), (detail.Title, detail.Level, detail.Topic, detail.Objective));
        Assert.Equal(lesson.Id, detail.Id);
        Assert.Equal(createdAt, detail.CreatedAt);
        Assert.InRange(detail.UpdatedAt, start, DateTimeOffset.UtcNow);
        Assert.Equal(20, detail.EstimatedDuration);
        Assert.Null(detail.DeletedAt);
        Assert.Equal(2, detail.Activities.Count);
        db.ChangeTracker.Clear();
        Assert.Equal(owner, (await db.Lessons.SingleAsync(x => x.Id == lesson.Id)).UserId);
        Assert.Equal(before, await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(a)::text AS "Value" FROM "Activities" a ORDER BY a."Id"
            """).ToArrayAsync());
        // Last write wins, with no version headers or tokens.
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync($"/api/lessons/{lesson.Id}",
            new SaveLessonRequest("Última", "A2", "Tema", "Objetivo"))).StatusCode);
        Assert.Equal("Última", (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lesson.Id}"))!.Title);
    }

    [Fact]
    public async Task UpdateReturns404ForForeignMissingOrTrashedLessonsWithoutRestoring()
    {
        var (owner, lessons) = await Seed("Papelera");
        var (other, others) = await Seed("Privada");
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Lessons.Where(x => x.Id == lessons[0].Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.DeletedAt, DateTimeOffset.UtcNow));
        using var client = Client(owner.ToString());
        foreach (var id in new[] { lessons[0].Id, others[0].Id, Guid.NewGuid() })
        {
            var response = await client.PutAsJsonAsync($"/api/lessons/{id}", new SaveLessonRequest("Cambio", "B1", "Tema", "Objetivo"));
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        Assert.NotNull((await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == lessons[0].Id)).DeletedAt);
        Assert.Equal("Privada", (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == others[0].Id)).Title);
        using var otherClient = Client(other.ToString());
        Assert.Equal(HttpStatusCode.NotFound, (await otherClient.PutAsJsonAsync($"/api/lessons/{lessons[0].Id}",
            new SaveLessonRequest("Cambio", "B1", "Tema", "Objetivo"))).StatusCode);
    }

    [Theory]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://evil.example", false)]
    public async Task PutCorsKeepsExistingOriginRestriction(string origin, bool allowed)
    {
        using var client = fixture.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/lessons/" + Guid.NewGuid());
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "PUT");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");
        var response = await client.SendAsync(request);
        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
        if (allowed)
        {
            Assert.Equal(origin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
            Assert.Contains("PUT", string.Join(",", response.Headers.GetValues("Access-Control-Allow-Methods")));
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("invalid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task DuplicateRequiresValidAuthentication(string? sub)
    {
        using var client = Client(sub);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PostAsync($"/api/lessons/{Guid.NewGuid()}/duplicate", null)).StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task DuplicateCopiesPersistedGraphWithNewIdsAndIndependentMetadata(bool withActivities)
    {
        var (owner, _) = await Seed();
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var source = new Lesson(owner, new string('x', 200), LessonLevel.B2, "Tema", "Objetivo");
        if (withActivities)
        {
            source.AddActivity("Hablar", "Instrucciones", new SpeakingContent(["Pregunta"]));
            source.AddActivity("Leer", "Instrucciones", new ReadingContent("Texto", ["Pregunta"]), 10);
            source.AddActivity("Escribir", "Instrucciones", new WritingContent("Consigna"));
            source.AddActivity("Gramática", "Instrucciones", new VocabularyGrammarContent("Explicación", ["Ejercicio"]), 20);
        }
        db.Lessons.Add(source);
        await db.SaveChangesAsync();
        using var client = Client(owner.ToString());
        var original = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{source.Id}"))!;
        // Neither an unsaved tracked edit nor extra request fields may replace persisted source data.
        source.UpdateMetadata("No guardado", LessonLevel.A2, "Local", "Local");
        var response = await client.PostAsJsonAsync($"/api/lessons/{source.Id}/duplicate",
            new { title = "Inyectado", userId = Guid.NewGuid(), activities = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var copy = (await response.Content.ReadFromJsonAsync<LessonDetailsDto>())!;
        Assert.Equal($"/api/lessons/{copy.Id}", response.Headers.Location!.OriginalString);
        Assert.NotEqual(original.Id, copy.Id);
        Assert.Equal(new string('x', 192) + " (copia)", copy.Title);
        Assert.Equal((original.Level, original.Topic, original.Objective, original.EstimatedDuration),
            (copy.Level, copy.Topic, copy.Objective, copy.EstimatedDuration));
        Assert.Null(copy.DeletedAt);
        Assert.True(copy.CreatedAt >= original.CreatedAt);
        Assert.Equal(copy.CreatedAt, copy.UpdatedAt);
        Assert.Equal(original.Activities.Count, copy.Activities.Count);
        foreach (var (a, b) in original.Activities.Zip(copy.Activities))
        {
            Assert.NotEqual(a.Id, b.Id);
            Assert.Equal((a.Type, a.Title, a.Instructions, a.Order, a.EstimatedDuration),
                (b.Type, b.Title, b.Instructions, b.Order, b.EstimatedDuration));
            Assert.Equal(a.Content.GetRawText(), b.Content.GetRawText());
        }
        db.ChangeTracker.Clear();
        Assert.Equal(owner, (await db.Lessons.SingleAsync(x => x.Id == copy.Id)).UserId);
        Assert.All(await db.Activities.Where(x => x.LessonId == copy.Id).ToListAsync(), x => Assert.Equal(copy.Id, x.LessonId));
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync(response.Headers.Location,
            new SaveLessonRequest("Copia editada", "A2", "Otro tema", "Otro objetivo"))).StatusCode);
        var unchanged = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{source.Id}"))!;
        Assert.Equal(original.Title, unchanged.Title);
        Assert.Equal(original.UpdatedAt, unchanged.UpdatedAt);
        Assert.Equal(original.Activities.Select(x => x.Id), unchanged.Activities.Select(x => x.Id));
    }

    [Fact]
    public async Task DuplicateRejectsForeignMissingAndTrashedSources()
    {
        var (owner, lessons) = await Seed("Papelera");
        var (_, others) = await Seed("Ajena");
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Lessons.Where(x => x.Id == lessons[0].Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.DeletedAt, DateTimeOffset.UtcNow));
        using var client = Client(owner.ToString());
        var count = await db.Lessons.CountAsync();
        foreach (var id in new[] { lessons[0].Id, others[0].Id, Guid.NewGuid() })
        {
            var response = await client.PostAsync($"/api/lessons/{id}/duplicate", null);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        Assert.Equal(count, await db.Lessons.CountAsync());
    }

    [Fact]
    public async Task DuplicateRollsBackWhenFailureOccursAfterInsertsBeforeCommit()
    {
        var (owner, _) = await Seed();
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var source = new Lesson(owner, "Original", LessonLevel.B1, "Tema", "Objetivo");
        source.AddActivity("Una", "Instrucciones", new WritingContent("Texto"));
        source.AddActivity("Dos", "Instrucciones", new SpeakingContent(["Pregunta"]), 5);
        db.Lessons.Add(source);
        await db.SaveChangesAsync();
        var lessonIds = await db.Lessons.Select(x => x.Id).OrderBy(x => x).ToArrayAsync();
        var activityIds = await db.Activities.Select(x => x.Id).OrderBy(x => x).ToArrayAsync();
        var interceptor = new FailAfterCopyInsert();
        await using (var failingDb = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(fixture.ConnectionString).AddInterceptors(interceptor).Options))
        {
            var service = new LessonService(failingDb);
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.DuplicateAsync(source.Id, owner, default));
        }
        Assert.True(interceptor.ObservedUncommittedCopy);
        Assert.Equal(lessonIds, await db.Lessons.Select(x => x.Id).OrderBy(x => x).ToArrayAsync());
        Assert.Equal(activityIds, await db.Activities.Select(x => x.Id).OrderBy(x => x).ToArrayAsync());
        // The source remains usable after rollback.
        using var client = Client(owner.ToString());
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsync($"/api/lessons/{source.Id}/duplicate", null)).StatusCode);
    }

    private sealed class FailAfterCopyInsert : Microsoft.EntityFrameworkCore.Diagnostics.SaveChangesInterceptor
    {
        public bool ObservedUncommittedCopy { get; private set; }

        public override async ValueTask<int> SavedChangesAsync(
            Microsoft.EntityFrameworkCore.Diagnostics.SaveChangesCompletedEventData eventData,
            int result, CancellationToken cancellationToken = default)
        {
            var db = (AppDbContext)eventData.Context!;
            var transaction = db.Database.CurrentTransaction;
            Assert.NotNull(transaction);
            Assert.Equal(System.Data.IsolationLevel.RepeatableRead,
                Microsoft.EntityFrameworkCore.Storage.DbContextTransactionExtensions.GetDbTransaction(transaction).IsolationLevel);
            var copy = db.ChangeTracker.Entries<Lesson>().Single().Entity;
            Assert.True(await db.Lessons.AsNoTracking().AnyAsync(x => x.Id == copy.Id, cancellationToken));
            Assert.Equal(2, await db.Activities.CountAsync(x => x.LessonId == copy.Id, cancellationToken));
            ObservedUncommittedCopy = true;
            throw new InvalidOperationException("Injected failure after all copy inserts, before commit.");
        }
    }

    private static Task<HttpResponseMessage> Transition(HttpClient client, Guid id, string operation) =>
        operation == "delete" ? client.DeleteAsync($"/api/lessons/{id}") :
            client.PostAsync($"/api/lessons/{id}/{operation}", null);

    [Theory]
    [InlineData(null)]
    [InlineData("invalid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task TrashRestoreDeleteRequireAuthentication(string? sub)
    {
        using var client = Client(sub);
        foreach (var operation in new[] { "trash", "restore", "delete" })
            Assert.Equal(HttpStatusCode.Unauthorized, (await Transition(client, Guid.NewGuid(), operation)).StatusCode);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TransitionsReturn404ForForeignClassesRegardlessOfState(bool deleted)
    {
        var (owner, _) = await Seed();
        var (_, lessons) = await Seed("Privada");
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (deleted)
            await db.Lessons.Where(x => x.Id == lessons[0].Id)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.DeletedAt, DateTimeOffset.UtcNow));
        var before = await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(l)::text AS "Value" FROM "Lessons" l ORDER BY l."Id"
            """).ToArrayAsync();
        using var client = Client(owner.ToString());
        foreach (var id in new[] { lessons[0].Id, Guid.NewGuid() })
        foreach (var operation in new[] { "trash", "restore", "delete" })
        {
            var response = await Transition(client, id, operation);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        Assert.Equal(before, await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(l)::text AS "Value" FROM "Lessons" l ORDER BY l."Id"
            """).ToArrayAsync());
    }

    [Fact]
    public async Task InvalidTransitionsReturn409AndLeaveDataUnchanged()
    {
        var (owner, lessons) = await Seed("Activa");
        using var client = Client(owner.ToString());
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        async Task<string[]> Rows() => await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(l)::text AS "Value" FROM "Lessons" l ORDER BY l."Id"
            """).ToArrayAsync();
        var before = await Rows();
        foreach (var operation in new[] { "restore", "delete" })
        {
            var response = await Transition(client, lessons[0].Id, operation);
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        }
        Assert.Equal(before, await Rows());
        Assert.Equal(HttpStatusCode.NoContent, (await Transition(client, lessons[0].Id, "trash")).StatusCode);
        before = await Rows();
        Assert.Equal(HttpStatusCode.Conflict, (await Transition(client, lessons[0].Id, "trash")).StatusCode);
        Assert.Equal(before, await Rows());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task TrashRestoreAndPermanentDeletePreserveThenCascadeOnlyTarget(bool withActivities)
    {
        var (owner, _) = await Seed();
        var (other, _) = await Seed();
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var target = new Lesson(owner, "Clase", LessonLevel.B1, "Tema", "Objetivo");
        if (withActivities)
        {
            target.AddActivity("Una", "Instrucciones", new WritingContent("Texto"));
            target.AddActivity("Dos", "Instrucciones", new SpeakingContent(["Pregunta"]), 15);
        }
        var untouched = new Lesson(owner, "Otra propia", LessonLevel.A2, "Tema", "Objetivo");
        untouched.AddActivity("Leer", "Instrucciones", new ReadingContent("Texto", ["Pregunta"]));
        var foreign = new Lesson(other, "Ajena", LessonLevel.B2, "Tema", "Objetivo");
        foreign.AddActivity("Otra", "Instrucciones", new WritingContent("Texto"));
        db.Lessons.AddRange(target, untouched, foreign);
        await db.SaveChangesAsync();
        async Task<string[]> Activities() => await db.Database.SqlQueryRaw<string>("""
            SELECT to_jsonb(a)::text AS "Value" FROM "Activities" a ORDER BY a."Id"
            """).ToArrayAsync();
        var beforeActivities = await Activities();
        using var client = Client(owner.ToString());
        var original = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{target.Id}"))!;
        var start = DateTimeOffset.UtcNow.AddSeconds(-1);
        var response = await Transition(client, target.Id, "trash");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.DoesNotContain(await List(client), x => x.Id == target.Id);
        var trashed = Assert.Single(await List(client, "?state=trash"));
        Assert.Equal(target.Id, trashed.Id);
        Assert.InRange(trashed.DeletedAt!.Value, start, DateTimeOffset.UtcNow);
        Assert.Equal(beforeActivities, await Activities());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/lessons/{target.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/lessons/{target.Id}/duplicate", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/lessons/{target.Id}",
            new SaveLessonRequest("Cambio", "A2", "Tema", "Objetivo"))).StatusCode);
        start = DateTimeOffset.UtcNow.AddSeconds(-1);
        Assert.Equal(HttpStatusCode.NoContent, (await Transition(client, target.Id, "restore")).StatusCode);
        Assert.Empty(await List(client, "?state=trash"));
        var restored = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{target.Id}"))!;
        Assert.Equal((original.Id, original.Title, original.Level, original.Topic, original.Objective, original.CreatedAt, original.EstimatedDuration),
            (restored.Id, restored.Title, restored.Level, restored.Topic, restored.Objective, restored.CreatedAt, restored.EstimatedDuration));
        Assert.Null(restored.DeletedAt);
        Assert.InRange(restored.UpdatedAt, start, DateTimeOffset.UtcNow);
        Assert.Equal(original.Activities.Select(x => x.Id), restored.Activities.Select(x => x.Id));
        Assert.Equal(beforeActivities, await Activities());
        Assert.Contains(await List(client), x => x.Id == target.Id);
        db.ChangeTracker.Clear();
        Assert.Equal(owner, (await db.Lessons.SingleAsync(x => x.Id == target.Id)).UserId);
        Assert.Equal(HttpStatusCode.NoContent, (await Transition(client, target.Id, "trash")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await Transition(client, target.Id, "delete")).StatusCode);
        Assert.False(await db.Lessons.AnyAsync(x => x.Id == target.Id));
        Assert.False(await db.Activities.AnyAsync(x => x.LessonId == target.Id));
        Assert.True(await db.Lessons.AnyAsync(x => x.Id == untouched.Id));
        Assert.True(await db.Lessons.AnyAsync(x => x.Id == foreign.Id));
        Assert.Single(await db.Activities.Where(x => x.LessonId == untouched.Id).ToListAsync());
        Assert.Single(await db.Activities.Where(x => x.LessonId == foreign.Id).ToListAsync());
        foreach (var operation in new[] { "trash", "restore", "delete" })
            Assert.Equal(HttpStatusCode.NotFound, (await Transition(client, target.Id, operation)).StatusCode);
    }

    [Theory]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://evil.example", false)]
    public async Task DeleteCorsKeepsExistingOriginRestriction(string origin, bool allowed)
    {
        using var client = fixture.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/lessons/" + Guid.NewGuid());
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "DELETE");
        request.Headers.Add("Access-Control-Request-Headers", "authorization");
        var response = await client.SendAsync(request);
        Assert.Equal(allowed, response.Headers.Contains("Access-Control-Allow-Origin"));
        if (allowed)
            Assert.Contains("DELETE", string.Join(",", response.Headers.GetValues("Access-Control-Allow-Methods")));
    }
}
