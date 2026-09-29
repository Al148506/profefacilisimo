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
using Profefacilisimo.Application.Students;
using Profefacilisimo.Domain;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

// Its own class and its own pf_test_* database: the assignment rules are the point of this suite, so
// their rows must not be counted by the student suite.
public class LessonAssignmentTests(ApiFixture fixture) : IClassFixture<ApiFixture>
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

    private async Task<Guid> SeedOwner()
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var owner = Guid.NewGuid();
        db.Users.Add(new AppUser { Id = owner, UserName = owner.ToString() });
        await db.SaveChangesAsync();
        return owner;
    }

    // Every count in this suite is scoped to the entities the test itself created: IClassFixture gives
    // one database per class, so a global count would also see the rows of the sibling tests.
    private async Task<int> CountAssignmentsFor(Guid studentId)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.LessonAssignments.CountAsync(x => x.StudentId == studentId);
    }

    private async Task<int> CountAssignmentsOfAll(IEnumerable<Student> students)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var ids = students.Select(x => x.Id).ToArray();
        return await db.LessonAssignments.CountAsync(x => ids.Contains(x.StudentId));
    }

    private async Task<int> CountOwned(Guid userId, bool students)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return students
            ? await db.Students.CountAsync(x => x.UserId == userId)
            : await db.Lessons.CountAsync(x => x.UserId == userId);
    }

    private async Task<bool> OwnsStudent(Guid userId, Guid studentId) => await Owned(userId, studentId, students: true);
    private async Task<bool> OwnsLesson(Guid userId, Guid lessonId) => await Owned(userId, lessonId, students: false);

    private async Task<bool> Owned(Guid userId, Guid id, bool students)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return students
            ? await db.Students.AnyAsync(x => x.Id == id && x.UserId == userId)
            : await db.Lessons.AnyAsync(x => x.Id == id && x.UserId == userId);
    }

    private async Task<Employee> Seed(Guid owner, int students = 2, int lessons = 2)
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var people = Enumerable.Range(0, students)
            .Select(i => new Student(owner, $"Estudiante {i}", LessonLevel.B1)).ToArray();
        var classes = Enumerable.Range(0, lessons)
            .Select(i => new Lesson(owner, $"Clase {i}", LessonLevel.B1, "Tema", "Objetivo")).ToArray();
        db.Students.AddRange(people);
        db.Lessons.AddRange(classes);
        await db.SaveChangesAsync();
        return new Employee(people, classes);
    }

    private static async Task<AssignedStudentDto[]> StudentsOf(HttpClient client, Guid lessonId) =>
        (await client.GetFromJsonAsync<AssignedStudentDto[]>($"/api/lessons/{lessonId}/students"))!;

    private static async Task<AssignedLessonDto[]> LessonsOf(HttpClient client, Guid studentId) =>
        (await client.GetFromJsonAsync<AssignedLessonDto[]>($"/api/students/{studentId}/lessons"))!;

    [Fact]
    public async Task AssigningFromBothSidesWritesOneRowAndTheRelationIsSymmetric()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var student = seeded.Students[0].Id;
        var lesson = seeded.Lessons[0].Id;

        // From the lesson.
        var fromLesson = await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        Assert.Equal(HttpStatusCode.Created, fromLesson.StatusCode);
        Assert.Equal(student, (await fromLesson.Content.ReadFromJsonAsync<AssignedStudentDto>())!.Id);

        // The other face of the same relation sees it.
        var fromStudent = await LessonsOf(client, student);
        Assert.Equal(lesson, Assert.Single(fromStudent).Id);
        Assert.Equal("Clase 0", fromStudent[0].Title);
        Assert.Equal("B1", fromStudent[0].Level);
        Assert.False(fromStudent[0].InTrash);

        var single = Assert.Single(await StudentsOf(client, lesson));
        Assert.Equal(student, single.Id);
        Assert.Equal("Estudiante 0", single.Name);

        // One row, never two: the pair is the identity of the assignment.
        Assert.Equal(1, await CountAssignmentsFor(student));
        Assert.Null(typeof(Lesson).GetProperty("StudentId"));
    }

    [Fact]
    public async Task AssigningTheSamePairTwiceIsIdempotentAndNeverDuplicates()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var student = seeded.Students[0].Id;
        var lesson = seeded.Lessons[0].Id;

        var first = await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        var second = await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        // 201 with the existing row, not 409: repeating the action from either screen is safe.
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.Created, second.StatusCode);
        // The same row comes back, so its instant survives the round-trip. PostgreSQL keeps
        // microseconds, so the comparison allows for the sub-microsecond tail of the in-memory value.
        var original = (await first.Content.ReadFromJsonAsync<AssignedStudentDto>())!.AssignedAt;
        var repeated = (await second.Content.ReadFromJsonAsync<AssignedStudentDto>())!.AssignedAt;
        Assert.True(Math.Abs((original - repeated).TotalMicroseconds) < 1,
            $"Expected the same instant, got {original:O} and {repeated:O}.");

        // And the same again from the record, which is the other screen of the same relation.
        var third = await client.PostAsJsonAsync($"/api/students/{student}/lessons", new { lessonId = lesson });
        Assert.Equal(HttpStatusCode.Created, third.StatusCode);

        Assert.Equal(1, await CountAssignmentsFor(student));
    }

    [Fact]
    public async Task OneLessonTakesManyStudentsAndOneStudentTakesManyLessons()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner, students: 3, lessons: 3);
        using var client = Client(owner.ToString());

        // One lesson, three students.
        foreach (var person in seeded.Students)
            Assert.Equal(HttpStatusCode.Created,
                (await client.PostAsJsonAsync($"/api/lessons/{seeded.Lessons[0].Id}/students", new { studentId = person.Id })).StatusCode);
        Assert.Equal(3, (await StudentsOf(client, seeded.Lessons[0].Id)).Length);

        // One student, three lessons.
        foreach (var lesson in seeded.Lessons)
            Assert.Equal(HttpStatusCode.Created,
                (await client.PostAsJsonAsync($"/api/students/{seeded.Students[0].Id}/lessons", new { lessonId = lesson.Id })).StatusCode);
        Assert.Equal(3, (await LessonsOf(client, seeded.Students[0].Id)).Length);

        // Three plus three, minus the pair assigned twice. The repeated pair is the (0,0) one.
        Assert.Equal(5, await CountAssignmentsOfAll(seeded.Students));
    }

    [Fact]
    public async Task RemovingAnAssignmentFromEitherSideRemovesTheRowAndKeepsBothEntities()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var student = seeded.Students[0].Id;
        var lesson = seeded.Lessons[0].Id;
        await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });

        // From the lesson.
        var removed = await client.DeleteAsync($"/api/lessons/{lesson}/students/{student}");
        Assert.Equal(HttpStatusCode.NoContent, removed.StatusCode);
        Assert.Empty(await StudentsOf(client, lesson));

        // Reassign, then remove it from the record: same effect.
        await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/students/{student}/lessons/{lesson}")).StatusCode);
        Assert.Empty(await LessonsOf(client, student));

        // Neither side was deleted.
        Assert.Equal(0, await CountAssignmentsFor(student));
        Assert.True(await OwnsStudent(owner, student));
        Assert.True(await OwnsLesson(owner, lesson));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/lessons/{lesson}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/students/{student}")).StatusCode);
    }

    [Fact]
    public async Task RemovingAPairThatDoesNotExistIsANotFoundAndChangesNothing()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var student = seeded.Students[0].Id;
        var lesson = seeded.Lessons[0].Id;

        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/lessons/{lesson}/students/{student}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/students/{student}/lessons/{lesson}")).StatusCode);

        // It is not an error of the teacher: only the wrong pair, and nothing was changed.
        var assigned = await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        Assert.Equal(HttpStatusCode.Created, assigned.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.DeleteAsync($"/api/lessons/{seeded.Lessons[1].Id}/students/{student}")).StatusCode);
        Assert.Single(await StudentsOf(client, lesson));
    }

    [Fact]
    public async Task ATrashedStudentOrLessonCannotBeAssignedAndIsAValidationProblem()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var student = seeded.Students[0].Id;
        var lesson = seeded.Lessons[0].Id;

        await client.PostAsJsonAsync($"/api/students/{student}/trash", new { });
        var withTrashedStudent = await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        Assert.Equal(HttpStatusCode.BadRequest, withTrashedStudent.StatusCode);

        await client.PostAsJsonAsync($"/api/students/{student}/restore", new { });
        await client.PostAsJsonAsync($"/api/lessons/{lesson}/trash", new { });
        var withTrashedLesson = await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        Assert.Equal(HttpStatusCode.BadRequest, withTrashedLesson.StatusCode);
        // And from the other direction too: both symmetric routes refuse for the same reason.
        Assert.Equal(HttpStatusCode.BadRequest,
            (await client.PostAsJsonAsync($"/api/students/{student}/lessons", new { lessonId = lesson })).StatusCode);

        // Neither entity was assigned: the refusals left the table alone for these rows.
        Assert.Equal(0, await CountAssignmentsFor(student));
    }

    [Fact]
    public async Task ForeignOrUnknownEntitiesAreANotFoundInAllFourDirections()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        var other = await SeedOwner();
        var foreign = await Seed(other);
        using var client = Client(owner.ToString());

        var student = seeded.Students[0].Id;
        var lesson = seeded.Lessons[0].Id;
        var foreignStudent = foreign.Students[0].Id;
        var foreignLesson = foreign.Lessons[0].Id;
        var unknown = Guid.NewGuid();

        // A foreign side, from both directions.
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = foreignStudent })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/students/{student}/lessons", new { lessonId = foreignLesson })).StatusCode);
        // A foreign lesson route holding an owned student.
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/lessons/{foreignLesson}/students", new { studentId = student })).StatusCode);
        // Unknown identifiers on both sides, and a mixed one.
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = unknown })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/students/{student}/lessons", new { lessonId = unknown })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync($"/api/lessons/{unknown}/students", new { studentId = student })).StatusCode);

        // Reading the assigned lists of a foreign or unknown entity is a 404 as well.
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/students/{foreignStudent}/lessons")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/lessons/{foreignLesson}/students")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/students/{unknown}/lessons")).StatusCode);

        // Not one of the refused attempts wrote a row for the teacher's own student.
        Assert.Equal(0, await CountAssignmentsFor(student));
    }

    [Fact]
    public async Task AssigningOrRemovingNeverTouchesTheLessonContent()
    {
        var owner = await SeedOwner();
        Guid lesson;
        Guid student;
        using (var scope = fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var created = new Lesson(owner, "Clase", LessonLevel.B1, "Tema", "Objetivo");
            created.AddActivity("A", "Instrucciones", new WritingContent("Texto"), 10);
            created.AddActivity("B", "Instrucciones", new SpeakingContent(["Pregunta"]), 20);
            var person = new Student(owner, "Lucía", LessonLevel.B1);
            db.Lessons.Add(created);
            db.Students.Add(person);
            await db.SaveChangesAsync();
            (lesson, student) = (created.Id, person.Id);
        }
        var before = (await Client(owner.ToString()).GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lesson}"))!;

        using var client = Client(owner.ToString());
        await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });
        var afterAssign = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lesson}"))!;
        Assert.Equal(before.Title, afterAssign.Title);
        Assert.Equal(before.EstimatedDuration, afterAssign.EstimatedDuration);
        Assert.Equal(before.UpdatedAt, afterAssign.UpdatedAt);
        Assert.Equal(before.Activities.Select(x => (x.Id, x.Title, x.EstimatedDuration, x.Order)),
            afterAssign.Activities.Select(x => (x.Id, x.Title, x.EstimatedDuration, x.Order)));

        await client.DeleteAsync($"/api/lessons/{lesson}/students/{student}");
        var afterRemove = (await client.GetFromJsonAsync<LessonDetailsDto>($"/api/lessons/{lesson}"))!;
        Assert.Equal(before.UpdatedAt, afterRemove.UpdatedAt);
        Assert.Equal(before.EstimatedDuration, afterRemove.EstimatedDuration);
        Assert.Equal(2, afterRemove.Activities.Count);

        // And the lesson payload never grows a student field: the section has its own read.
        var json = await client.GetStringAsync($"/api/lessons/{lesson}");
        Assert.DoesNotContain("student", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("assign", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TrashedEntitiesStayAssignedAndAreShownMarked()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var student = seeded.Students[0].Id;
        var lesson = seeded.Lessons[0].Id;
        await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = student });

        // The lesson goes to the trash: it stays assigned and is shown marked.
        await client.PostAsJsonAsync($"/api/lessons/{lesson}/trash", new { });
        Assert.True(Assert.Single(await LessonsOf(client, student)).InTrash);
        // Restoring brings it back to normal with its assignments intact.
        await client.PostAsJsonAsync($"/api/lessons/{lesson}/restore", new { });
        Assert.False(Assert.Single(await LessonsOf(client, student)).InTrash);

        // The student goes to the trash: it stays assigned and is shown marked.
        await client.PostAsJsonAsync($"/api/students/{student}/trash", new { });
        Assert.True(Assert.Single(await StudentsOf(client, lesson)).InTrash);

        // The row survived both trips through the trash.
        Assert.Equal(1, await CountAssignmentsFor(student));
    }

    [Fact]
    public async Task RemovingAStudentForGoodRemovesItsAssignmentsAndNoLesson()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var student = seeded.Students[0].Id;
        foreach (var lesson in seeded.Lessons)
            await client.PostAsJsonAsync($"/api/lessons/{lesson.Id}/students", new { studentId = student });
        Assert.Equal(2, await CountAssignmentsFor(student));

        await client.PostAsJsonAsync($"/api/students/{student}/trash", new { });
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/students/{student}")).StatusCode);

        // The cascade removed the assignment rows, and no lesson went with them.
        Assert.Equal(0, await CountAssignmentsFor(student));
        Assert.Equal(2, await CountOwned(owner, students: false));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/lessons/{seeded.Lessons[0].Id}")).StatusCode);
    }

    [Fact]
    public async Task RemovingALessonForGoodRemovesItsAssignmentsAndNoStudent()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using var client = Client(owner.ToString());
        var lesson = seeded.Lessons[0].Id;
        foreach (var person in seeded.Students)
            await client.PostAsJsonAsync($"/api/lessons/{lesson}/students", new { studentId = person.Id });

        await client.PostAsJsonAsync($"/api/lessons/{lesson}/trash", new { });
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/lessons/{lesson}")).StatusCode);

        // The cascade removed the assignment rows, and no student went with them.
        Assert.Equal(0, await CountAssignmentsOfAll(seeded.Students));
        Assert.Equal(2, await CountOwned(owner, students: true));
        foreach (var person in seeded.Students)
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/students/{person.Id}")).StatusCode);
    }

    // The index is the real guarantee, so it has to hold even when the service is bypassed.
    [Fact]
    public async Task TheDatabaseRefusesASecondRowForTheSamePair()
    {
        var owner = await SeedOwner();
        var seeded = await Seed(owner);
        using (var scope = fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.LessonAssignments.Add(new LessonAssignment(seeded.Students[0].Id, seeded.Lessons[0].Id));
            await db.SaveChangesAsync();
        }

        using (var scope = fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.LessonAssignments.Add(new LessonAssignment(seeded.Students[0].Id, seeded.Lessons[0].Id));
            await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        }
        // The rejected insert left exactly the one row behind.
        Assert.Equal(1, await CountAssignmentsFor(seeded.Students[0].Id));
    }

    private sealed record Employee(Student[] Students, Lesson[] Lessons);
}
