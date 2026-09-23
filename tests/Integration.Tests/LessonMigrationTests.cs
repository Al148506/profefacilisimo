using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

public class LessonMigrationTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task SoftDeleteMigrationPreservesExistingRowsJsonbIndexesAndRelationships()
    {
        // This fixture owns a fresh pf_test_* database; never downgrade the development database.
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(fixture.ConnectionString).Options);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20260909225120_InitialCreate");

        var owner = Guid.NewGuid();
        var lesson = Guid.NewGuid();
        var emptyLesson = Guid.NewGuid();
        var activity = Guid.NewGuid();
        var secondActivity = Guid.NewGuid();
        var timestamp = new DateTimeOffset(2026, 9, 1, 12, 0, 0, TimeSpan.Zero);
        var json = """{"prompt":"Texto original áé","legacy":{"flag":true},"list":[1,2]}""";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "AspNetUsers" ("Id", "UserName", "EmailConfirmed", "PhoneNumberConfirmed",
                "TwoFactorEnabled", "LockoutEnabled", "AccessFailedCount")
            VALUES ({owner}, 'migration-owner', false, false, false, false, 0);
            INSERT INTO "Lessons" ("Id", "UserId", "Title", "Level", "Topic", "Objective",
                "EstimatedDuration", "CreatedAt", "UpdatedAt")
            VALUES ({lesson}, {owner}, 'Anterior', 'B1', 'Tema', 'Objetivo', 60, {timestamp}, {timestamp}),
                   ({emptyLesson}, {owner}, 'Sin actividades', 'A2', 'Tema', 'Objetivo', NULL, {timestamp}, {timestamp});
            INSERT INTO "Activities" ("Id", "LessonId", "Type", "Title", "Instructions", "Content", "Order", "EstimatedDuration")
            VALUES ({activity}, {lesson}, 'Writing', 'Actividad', 'Instrucciones', CAST({json} AS jsonb), 0, NULL),
                   ({secondActivity}, {lesson}, 'Writing', 'Segunda', 'Instrucciones', CAST({json} AS jsonb), 1, 15);
            """);
        var lessonsBefore = await LessonRows(db);
        var activitiesBefore = await ActivityRows(db);
        var indexesBefore = await Indexes(db);

        await migrator.MigrateAsync();

        // AddCalculatedLessonDuration is the only migration that rewrites rows: the phase-1 manual
        // totals become calculated ones. The lesson holding a duration-less activity is incomplete
        // (null) and the lesson without activities totals 0.
        db.ChangeTracker.Clear();
        Assert.NotEqual(lessonsBefore, await LessonRows(db));
        Assert.Null((await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == lesson)).EstimatedDuration);
        Assert.Equal(0, (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == emptyLesson)).EstimatedDuration);
        Assert.Equal(activitiesBefore, await ActivityRows(db));
        Assert.Equal(indexesBefore, await Indexes(db));
        Assert.Empty(await db.Database.GetPendingMigrationsAsync());
        Assert.False(db.Database.HasPendingModelChanges());
        var column = await db.Database.SqlQueryRaw<string>("""
            SELECT data_type || ':' || is_nullable AS "Value"
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'Lessons' AND column_name = 'DeletedAt'
            """).SingleAsync();
        Assert.Equal("timestamp with time zone:YES", column);
        var lessons = await db.Lessons.Include(x => x.Activities).ToListAsync();
        Assert.Equal(2, lessons.Count);
        Assert.All(lessons, x => Assert.Null(x.DeletedAt));
        Assert.Empty(lessons.Single(x => x.Id == emptyLesson).Activities);
        var saved = lessons.Single(x => x.Id == lesson);
        Assert.Equal(new[] { activity, secondActivity }, saved.Activities.OrderBy(x => x.Order).Select(x => x.Id));
        saved.MoveToTrash();
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        saved = await db.Lessons.Include(x => x.Activities).SingleAsync(x => x.Id == lesson);
        Assert.NotNull(saved.DeletedAt);
        Assert.Equal(activitiesBefore, await ActivityRows(db));
        saved.Restore();
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        Assert.Null((await db.Lessons.SingleAsync(x => x.Id == lesson)).DeletedAt);
        Assert.Equal(activitiesBefore, await ActivityRows(db));

        // Reverse migration removes only the new column, then upgrading again leaves rows active.
        await migrator.MigrateAsync("20260909225120_InitialCreate");
        Assert.Equal(activitiesBefore, await ActivityRows(db));
        Assert.Equal(indexesBefore, await Indexes(db));
        await migrator.MigrateAsync();
        db.ChangeTracker.Clear();
        Assert.All(await db.Lessons.ToListAsync(), x => Assert.Null(x.DeletedAt));
        Assert.Equal(2, await db.Lessons.CountAsync());

        // Delete without loading children to exercise the actual database cascade.
        await db.Lessons.Where(x => x.Id == lesson).ExecuteDeleteAsync();
        Assert.Empty(await db.Activities.ToListAsync());
        Assert.True(await db.Lessons.AnyAsync(x => x.Id == emptyLesson));
    }

    private static Task<string[]> LessonRows(AppDbContext db) => db.Database.SqlQueryRaw<string>("""
        SELECT (to_jsonb(l) - 'DeletedAt')::text AS "Value" FROM "Lessons" l ORDER BY l."Id"
        """).ToArrayAsync();

    private static Task<string[]> ActivityRows(AppDbContext db) => db.Database.SqlQueryRaw<string>("""
        SELECT to_jsonb(a)::text AS "Value" FROM "Activities" a ORDER BY a."Id"
        """).ToArrayAsync();

    private static Task<string[]> Indexes(AppDbContext db) => db.Database.SqlQueryRaw<string>("""
        SELECT indexdef AS "Value" FROM pg_indexes
        WHERE schemaname = 'public' AND tablename IN ('Lessons', 'Activities') ORDER BY indexname
        """).ToArrayAsync();
}

// Its own class on purpose: IClassFixture gives every test class an isolated pf_test_* database,
// so this fixture's rows cannot leak into the soft-delete migration test above.
public class LessonDurationMigrationTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task CalculatedDurationMigrationFillsEmptyCompleteAndIncompleteLessons()
    {
        // This fixture owns a fresh pf_test_* database; never downgrade the development database.
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(fixture.ConnectionString).Options);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20260917232218_AddLessonSoftDelete");

        var owner = Guid.NewGuid();
        var empty = Guid.NewGuid();
        var complete = Guid.NewGuid();
        var incomplete = Guid.NewGuid();
        var trashed = Guid.NewGuid();
        var timestamp = new DateTimeOffset(2026, 9, 1, 12, 0, 0, TimeSpan.Zero);
        var json = """{"prompt":"Texto"}""";
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "AspNetUsers" ("Id", "UserName", "EmailConfirmed", "PhoneNumberConfirmed",
                "TwoFactorEnabled", "LockoutEnabled", "AccessFailedCount")
            VALUES ({owner}, 'duration-owner', false, false, false, false, 0);
            INSERT INTO "Lessons" ("Id", "UserId", "Title", "Level", "Topic", "Objective",
                "EstimatedDuration", "CreatedAt", "UpdatedAt", "DeletedAt")
            VALUES ({empty}, {owner}, 'Vacía', 'A2', 'Tema', 'Objetivo', NULL, {timestamp}, {timestamp}, NULL),
                   ({complete}, {owner}, 'Completa', 'B1', 'Tema', 'Objetivo', 999, {timestamp}, {timestamp}, NULL),
                   ({incomplete}, {owner}, 'Incompleta', 'B1', 'Tema', 'Objetivo', 120, {timestamp}, {timestamp}, NULL),
                   ({trashed}, {owner}, 'Papelera', 'B2', 'Tema', 'Objetivo', 7, {timestamp}, {timestamp}, {timestamp});
            INSERT INTO "Activities" ("Id", "LessonId", "Type", "Title", "Instructions", "Content", "Order", "EstimatedDuration")
            VALUES ({Guid.NewGuid()}, {complete}, 'Writing', 'A', 'Instrucciones', CAST({json} AS jsonb), 0, 10),
                   ({Guid.NewGuid()}, {complete}, 'Writing', 'B', 'Instrucciones', CAST({json} AS jsonb), 1, 20),
                   ({Guid.NewGuid()}, {incomplete}, 'Writing', 'A', 'Instrucciones', CAST({json} AS jsonb), 0, NULL),
                   ({Guid.NewGuid()}, {incomplete}, 'Writing', 'B', 'Instrucciones', CAST({json} AS jsonb), 1, 15),
                   ({Guid.NewGuid()}, {trashed}, 'Writing', 'A', 'Instrucciones', CAST({json} AS jsonb), 0, 5);
            """);

        await migrator.MigrateAsync();
        db.ChangeTracker.Clear();

        // 0 without activities, the sum when every activity has a duration, and null while any of
        // them lacks one. The old manual estimates are discarded, never spread across activities.
        Assert.Equal(0, (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == empty)).EstimatedDuration);
        Assert.Equal(30, (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == complete)).EstimatedDuration);
        Assert.Null((await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == incomplete)).EstimatedDuration);
        // Trashed lessons follow the same rule, so restoring one does not change it.
        Assert.Equal(5, (await db.Lessons.AsNoTracking().SingleAsync(x => x.Id == trashed)).EstimatedDuration);

        // The constraint now admits 0, keeps null, and still rejects negatives.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE "Lessons" SET "EstimatedDuration" = NULL WHERE "Id" = {empty}
            """);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE "Lessons" SET "EstimatedDuration" = 0 WHERE "Id" = {empty}
            """);
        await Assert.ThrowsAsync<Npgsql.PostgresException>(() => db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE "Lessons" SET "EstimatedDuration" = -1 WHERE "Id" = {empty}
            """));
    }
}
