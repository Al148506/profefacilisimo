using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Profefacilisimo.Application.Students;
using Profefacilisimo.Domain;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

// Its own class, and therefore its own pf_test_* database: the fixture is per class, so these rows
// can never leak into the lesson suites and their counts stay independent.
public class StudentManagementTests(ApiFixture fixture) : IClassFixture<ApiFixture>
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

    private async Task<(Guid Owner, Student[] Students)> Seed(params string[] names)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var owner = Guid.NewGuid();
        db.Users.Add(new AppUser { Id = owner, UserName = owner.ToString() });
        var students = names.Select((name, i) => new Student(owner, name,
            i % 2 == 0 ? LessonLevel.B1 : LessonLevel.B2, interests: "Interés " + name)).ToArray();
        db.Students.AddRange(students);
        await db.SaveChangesAsync();
        return (owner, students);
    }

    private static async Task<StudentListItemDto[]> List(HttpClient client, string query = "") =>
        (await client.GetFromJsonAsync<StudentListItemDto[]>("/api/students" + query))!;

    private static object Body(string name = "Lucía", string level = "B1", string? email = null,
        string? nativeLanguage = null, string? interests = null, string? goals = null, string? notes = null) =>
        new { name, level, email, nativeLanguage, interests, goals, notes };

    [Theory]
    [InlineData(null)]
    [InlineData("invalid")]
    [InlineData("00000000-0000-0000-0000-000000000000")]
    public async Task EveryStudentEndpointRequiresAuthenticatedValidSubject(string? sub)
    {
        using var client = Client(sub);
        var paths = new[] { "/api/students", "/api/students?state=trash", $"/api/students/{Guid.NewGuid()}" };
        foreach (var path in paths)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        foreach (var path in new[]
                 {
                     $"/api/students/{Guid.NewGuid()}/trash", $"/api/students/{Guid.NewGuid()}/restore",
                     $"/api/students/{Guid.NewGuid()}/lessons", $"/api/lessons/{Guid.NewGuid()}/students",
                 })
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(path, new { })).StatusCode);
    }

    [Fact]
    public async Task CreateRequiresOnlyNameAndLevelAndNormalisesEmptyOptionalsToNull()
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());

        // Every optional left empty, and one of them only spaces: all four land as null.
        var created = await client.PostAsJsonAsync("/api/students",
            Body("  Lucía Gómez  ", "B1", "", "   ", null, null, ""));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var student = (await created.Content.ReadFromJsonAsync<StudentDetailsDto>())!;
        Assert.Equal("Lucía Gómez", student.Name);
        Assert.Equal("B1", student.Level);
        Assert.Null(student.Email);
        Assert.Null(student.NativeLanguage);
        Assert.Null(student.Interests);
        Assert.Null(student.Goals);
        Assert.Null(student.Notes);
        Assert.Null(student.DeletedAt);
        Assert.Equal(0, student.AssignedLessonCount);
        Assert.Empty(student.AssignedLessons);
        // Creating a student never creates a lesson nor an assignment.
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(await db.Lessons.Where(x => x.UserId == owner).ToListAsync());
        Assert.Empty(await db.LessonAssignments.ToListAsync());
    }

    [Theory]
    [InlineData("", "B1", "name")]
    [InlineData("   ", "B1", "name")]
    [InlineData("Lucía", "", "level")]
    [InlineData("Lucía", "C1", "level")]
    public async Task CreateRejectsInvalidNameOrLevelAndPersistsNothing(string name, string level, string field)
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        var response = await client.PostAsJsonAsync("/api/students", Body(name, level));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = (await response.Content.ReadFromJsonAsync<ValidationProblem>())!;
        Assert.Contains(field, problem.Errors.Keys);
        Assert.Empty(await List(client));
    }

    [Theory]
    [InlineData("no-es-un-correo")]
    [InlineData("@")]
    [InlineData("sin@dominio")]
    [InlineData("con espacio@example.com")]
    public async Task CreateRejectsAnInvalidEmail(string email)
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        var response = await client.PostAsJsonAsync("/api/students", Body(email: email));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Empty(await List(client));
    }

    [Fact]
    public async Task EmailOverTwoHundredFiftyFourCharactersIsRejected()
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        var email = new string('a', 250) + "@example.com";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/students", Body(email: email))).StatusCode);
    }

    // The email is deliberately not unique: two students may share a guardian's address.
    [Fact]
    public async Task TwoStudentsMayShareTheSameEmail()
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        var first = await client.PostAsJsonAsync("/api/students", Body("Ana", email: "tutor@example.com"));
        var second = await client.PostAsJsonAsync("/api/students", Body("Luis", email: "tutor@example.com"));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        Assert.Equal(2, (await List(client)).Length);
    }

    [Fact]
    public async Task OptionalLengthLimitsAreEnforcedWithTheFieldKey()
    {
        var (owner, _) = await Seed();
        using var client = Client(owner.ToString());
        foreach (var (body, field) in new[]
                 {
                     (Body(nativeLanguage: new string('a', 101)), "nativeLanguage"),
                     (Body(interests: new string('a', 2001)), "interests"),
                     (Body(goals: new string('a', 2001)), "goals"),
                     (Body(notes: new string('a', 4001)), "notes"),
                 })
        {
            var response = await client.PostAsJsonAsync("/api/students", body);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var problem = (await response.Content.ReadFromJsonAsync<ValidationProblem>())!;
            Assert.Contains(field, problem.Errors.Keys);
        }
    }

    [Fact]
    public async Task UpdateChangesEveryFieldAndRejectsAStudentOfAnotherTeacher()
    {
        var (owner, students) = await Seed("Lucía");
        var (other, others) = await Seed("Ajeno");
        using var client = Client(owner.ToString());

        var updated = await client.PutAsJsonAsync($"/api/students/{students[0].Id}",
            Body("Lucía Gómez", "B2", "lucia@example.com", "Español", "Cine", "Aprobar el B2", "Muy motivada"));
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var student = (await updated.Content.ReadFromJsonAsync<StudentDetailsDto>())!;
        Assert.Equal("Lucía Gómez", student.Name);
        Assert.Equal("B2", student.Level);
        Assert.Equal("lucia@example.com", student.Email);
        Assert.Equal("Español", student.NativeLanguage);
        Assert.Equal("Cine", student.Interests);
        Assert.Equal("Aprobar el B2", student.Goals);
        Assert.Equal("Muy motivada", student.Notes);

        // Emptying an optional stores null, and the edit is visible in the listing straight away.
        var cleared = await client.PutAsJsonAsync($"/api/students/{students[0].Id}", Body("Lucía Gómez", "B2"));
        Assert.Null((await cleared.Content.ReadFromJsonAsync<StudentDetailsDto>())!.Email);
        Assert.Null(Assert.Single(await List(client)).Interests);

        // A foreign student is a 404 for read, edit, trash and delete alike: never a 403.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/students/{others[0].Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/students/{others[0].Id}", Body())).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/students/{others[0].Id}/trash", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/students/{others[0].Id}")).StatusCode);

        // The other teacher's student is untouched, and neither list shows the other's.
        using var scope2 = fixture.Services.CreateScope();
        var verify = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("Ajeno", (await verify.Students.AsNoTracking().SingleAsync(x => x.Id == others[0].Id)).Name);
        using var otherClient = Client(other.ToString());
        Assert.Equal(["Ajeno"], (await List(otherClient)).Select(x => x.Name));
    }

    [Fact]
    public async Task TheListIsOrderedByMostRecentlyUpdatedWithStableTies()
    {
        var (owner, _) = await Seed(Enumerable.Range(0, 12).Select(i => $"Estudiante {i}").ToArray());
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var time = new DateTimeOffset(2026, 9, 1, 12, 0, 0, TimeSpan.Zero);
        await db.Students.Where(x => x.UserId == owner)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UpdatedAt, time));
        var newest = (await db.Students.Where(x => x.UserId == owner).OrderBy(x => x.Id).ToListAsync())[3];
        await db.Students.Where(x => x.Id == newest.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.UpdatedAt, time.AddDays(1)));

        using var client = Client(owner.ToString());
        var list = await List(client);
        Assert.Equal(12, list.Length);
        Assert.Equal(newest.Id, list[0].Id);
        // The rest tie on the same instant, so the identifier decides, exactly like the lesson list.
        Assert.Equal((await db.Students.Where(x => x.UserId == owner && x.Id != newest.Id)
                .Select(x => x.Id).ToListAsync()).OrderBy(x => x),
            list.Skip(1).Select(x => x.Id));
    }

    [Fact]
    public async Task SearchMatchesNameAndInterestsAndLevelFilterCombinesWithIt()
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var owner = Guid.NewGuid();
        db.Users.Add(new AppUser { Id = owner, UserName = owner.ToString() });
        db.Students.AddRange(
            new Student(owner, "Marta Ruiz", LessonLevel.A2, interests: "Cine y series"),
            new Student(owner, "Jorge Lima", LessonLevel.A2, interests: "Fútbol"),
            new Student(owner, "Chen Wei", LessonLevel.B1, interests: "Cine asiático"),
            new Student(owner, "Sara Oro", LessonLevel.B2, interests: "Música"));
        await db.SaveChangesAsync();
        using var client = Client(owner.ToString());

        // By name.
        Assert.Equal(["Marta Ruiz"], (await List(client, "?search=Marta")).Select(x => x.Name));
        // By interests, which is the second thing the search matches on.
        Assert.Equal(["Chen Wei", "Marta Ruiz"], (await List(client, "?search=Cine")).Select(x => x.Name).OrderBy(x => x));
        // The level filter and the search combine instead of replacing each other.
        Assert.Equal(["Chen Wei"], (await List(client, "?search=Cine&level=B1")).Select(x => x.Name));
        Assert.Empty(await List(client, "?search=Cine&level=B2"));
        // Without a filter the whole list comes back.
        Assert.Equal(4, (await List(client)).Length);
        Assert.Equal(4, (await List(client, "?search=&level=")).Length);
    }

    [Theory]
    [InlineData("%")]
    [InlineData("_")]
    [InlineData("!")]
    public async Task SearchTreatsSqlPatternCharactersLiterally(string literal)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var owner = Guid.NewGuid();
        db.Users.Add(new AppUser { Id = owner, UserName = owner.ToString() });
        db.Students.AddRange(
            new Student(owner, "Prefijo " + literal + " fin", LessonLevel.B1),
            new Student(owner, "Prefijo x fin", LessonLevel.B1));
        await db.SaveChangesAsync();
        using var client = Client(owner.ToString());
        // Only the student whose name holds the literal character, never both.
        Assert.Equal(["Prefijo " + literal + " fin"], (await List(client, "?search=" + literal)).Select(x => x.Name));
    }

    [Fact]
    public async Task InvalidListParametersAreRejectedAndTheTrashIsCanonical()
    {
        var (owner, students) = await Seed("Lucía", "Ana");
        using var client = Client(owner.ToString());
        var response = await client.GetAsync("/api/students?state=invalid");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/students?level=C1")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/students?search=" + new string('a', 201))).StatusCode);

        // The active list never mixes in the trash, and the trash lives in its own state.
        await client.PostAsJsonAsync($"/api/students/{students[0].Id}/trash", new { });
        Assert.Equal(["Ana"], (await List(client)).Select(x => x.Name));
        Assert.Equal(["Lucía"], (await List(client, "?state=trash")).Select(x => x.Name));
    }

    [Fact]
    public async Task TheTrashListsRestoresAndDeletesForGoodWithTheStateTransitions()
    {
        var (owner, students) = await Seed("Lucía", "Ana");
        using var client = Client(owner.ToString());

        // Unnecessary transitions are a 409, exactly like the lesson transition.
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/students/{students[0].Id}/restore", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync($"/api/students/{students[0].Id}/trash", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/students/{students[0].Id}/trash", new { })).StatusCode);

        // A student in the trash stays readable: only its state changes, never its availability.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/students/{students[0].Id}")).StatusCode);
        Assert.NotNull((await client.GetFromJsonAsync<StudentDetailsDto>($"/api/students/{students[0].Id}"))!.DeletedAt);
        // A trashed student is not editable.
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/students/{students[0].Id}", Body())).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync($"/api/students/{students[0].Id}/restore", new { })).StatusCode);
        Assert.Null((await client.GetFromJsonAsync<StudentDetailsDto>($"/api/students/{students[0].Id}"))!.DeletedAt);

        // Deleting for good removes the student and nothing else.
        await client.PostAsJsonAsync($"/api/students/{students[0].Id}/trash", new { });
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/students/{students[0].Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/students/{students[0].Id}")).StatusCode);
        Assert.Equal(["Ana"], (await List(client)).Select(x => x.Name));
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.True(await db.Students.AnyAsync(x => x.Id == students[1].Id));
    }

    // An active student is not deletable without going through the trash first.
    [Fact]
    public async Task DeletingAnActiveStudentIsAConflict()
    {
        var (owner, students) = await Seed("Lucía");
        using var client = Client(owner.ToString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"/api/students/{students[0].Id}")).StatusCode);
        Assert.Equal("Lucía", Assert.Single(await List(client)).Name);
    }

    [Fact]
    public async Task TheListingCountsEveryAssignedLessonIncludingTheTrashedOnes()
    {
        var (owner, students) = await Seed("Lucía");
        var (lessonActive, lessonTrashed) = await SeedLessons(owner, "Activa", "En papelera");
        using (var scope = fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.LessonAssignments.AddRange(
                new LessonAssignment(students[0].Id, lessonActive),
                new LessonAssignment(students[0].Id, lessonTrashed));
            await db.SaveChangesAsync();
        }

        using var client = Client(owner.ToString());
        // The count includes the lesson in the trash, so the listing and the record never disagree.
        Assert.Equal(2, Assert.Single(await List(client)).AssignedLessonCount);
        var details = (await client.GetFromJsonAsync<StudentDetailsDto>($"/api/students/{students[0].Id}"))!;
        Assert.Equal(2, details.AssignedLessonCount);
        Assert.Equal(2, details.AssignedLessons.Count);
        Assert.Contains(details.AssignedLessons, x => x.InTrash);
    }

    private async Task<(Guid Active, Guid Trashed)> SeedLessons(Guid owner, string active, string trashed)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var first = new Lesson(owner, active, LessonLevel.B1, "Tema", "Objetivo");
        var second = new Lesson(owner, trashed, LessonLevel.B2, "Tema", "Objetivo");
        second.MoveToTrash();
        db.Lessons.AddRange(first, second);
        await db.SaveChangesAsync();
        return (first.Id, second.Id);
    }

    private sealed record ValidationProblem(Dictionary<string, string[]> Errors);
}
