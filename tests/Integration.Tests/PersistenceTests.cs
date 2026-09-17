using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Profefacilisimo.Application;
using Profefacilisimo.Domain;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

public class PersistenceTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task MigrationJsonbOwnershipAndCascadeWork()
    {
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
        var owner = new AppUser { Id = Guid.NewGuid(), Email = "owner@example.com", UserName = "owner@example.com" };
        Assert.True((await users.CreateAsync(owner, "TestPassword12345")).Succeeded);
        var other = new AppUser { Id = Guid.NewGuid(), Email = "other@example.com", UserName = "other@example.com" };
        Assert.True((await users.CreateAsync(other, "TestPassword12345")).Succeeded);
        var lesson = new Lesson(owner.Id, "Viajes", LessonLevel.B1, "Vacaciones", "Hablar del pasado");
        lesson.AddActivity("Lee", "Lee el texto", new ReadingContent("Fui a México.", ["¿Adónde fui?"]));
        lesson.AddActivity("Escribe", "Responde", new WritingContent("Describe tus vacaciones."));
        db.Lessons.Add(lesson);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var saved = await db.Lessons.Include(x => x.Activities).SingleAsync(x => x.Id == lesson.Id);
        Assert.Equal([0, 1], saved.Activities.OrderBy(x => x.Order).Select(x => x.Order));
        Assert.Equal("Fui a México.", Assert.IsType<ReadingContent>(saved.Activities.Single(x => x.Order == 0).ReadContent()).Text);
        var column = await db.Database.SqlQueryRaw<string>("SELECT data_type AS \"Value\" FROM information_schema.columns WHERE table_name = 'Activities' AND column_name = 'Content'").SingleAsync();
        Assert.Equal("jsonb", column);
        var reader = scope.ServiceProvider.GetRequiredService<ILessonReader>();
        Assert.NotNull(await reader.FindOwnedAsync(lesson.Id, owner.Id, default));
        Assert.Null(await reader.FindOwnedAsync(lesson.Id, other.Id, default));
        Assert.False((await db.Database.GetPendingMigrationsAsync()).Any());
        db.Lessons.Remove(saved);
        await db.SaveChangesAsync();
        Assert.False(await db.Activities.AnyAsync(x => x.LessonId == lesson.Id));
    }
}
