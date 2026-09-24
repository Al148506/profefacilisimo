using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Profefacilisimo.Domain;

namespace Profefacilisimo.Infrastructure;

public sealed class AppUser : IdentityUser<Guid> { }

public sealed class RefreshSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>(options)
{
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<RefreshSession> RefreshSessions => Set<RefreshSession>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.Entity<AppUser>().HasIndex(x => x.NormalizedEmail).IsUnique();
        builder.Entity<Lesson>(entity =>
        {
            entity.ToTable("Lessons", table =>
            {
                table.HasCheckConstraint("CK_Lesson_Duration", "\"EstimatedDuration\" IS NULL OR \"EstimatedDuration\" >= 0");
                table.HasCheckConstraint("CK_Lesson_Level", "\"Level\" IN ('A2','B1','B2')");
            });
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Topic).HasMaxLength(200);
            entity.Property(x => x.Objective).HasMaxLength(2000);
            entity.Property(x => x.Level).HasConversion<string>().HasMaxLength(2);
            entity.Property(x => x.DeletedAt).HasColumnType("timestamp with time zone").IsRequired(false);
            entity.HasIndex(x => new { x.UserId, x.UpdatedAt });
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Activities).WithOne().HasForeignKey(x => x.LessonId).OnDelete(DeleteBehavior.Cascade);
            entity.Navigation(x => x.Activities).HasField("_activities").UsePropertyAccessMode(PropertyAccessMode.Field);
        });
        builder.Entity<Activity>(entity =>
        {
            entity.ToTable("Activities", table =>
            {
                table.HasCheckConstraint("CK_Activity_Duration", "\"EstimatedDuration\" IS NULL OR \"EstimatedDuration\" > 0");
                table.HasCheckConstraint("CK_Activity_Order", "\"Order\" >= 0");
                table.HasCheckConstraint("CK_Activity_Type", "\"Type\" IN ('Speaking','Reading','Writing','VocabularyGrammar')");
                table.HasCheckConstraint("CK_Activity_Content", "jsonb_typeof(\"Content\") = 'object'");
            });
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Instructions).HasMaxLength(2000);
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(30);
            entity.Property(x => x.Content).HasColumnType("jsonb");
            entity.HasIndex(x => new { x.LessonId, x.Order }).IsUnique();
        });
        builder.Entity<RefreshSession>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TokenHash).HasMaxLength(64);
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasIndex(x => x.ExpiresAt);
            entity.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });
    }
}
