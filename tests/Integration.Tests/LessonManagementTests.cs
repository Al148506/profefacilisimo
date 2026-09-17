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
}
