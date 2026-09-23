using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCalculatedLessonDuration : Migration
    {
        private const string ManualLessonDuration = "\"EstimatedDuration\" IS NULL OR \"EstimatedDuration\" > 0";
        private const string CalculatedLessonDuration = "\"EstimatedDuration\" IS NULL OR \"EstimatedDuration\" >= 0";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A lesson without activities has a total of 0, so the constraint has to accept it.
            // Null stays valid for legacy rows and negatives stay rejected.
            migrationBuilder.DropCheckConstraint(
                name: "CK_Lesson_Duration",
                table: "Lessons");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Lesson_Duration",
                table: "Lessons",
                sql: CalculatedLessonDuration);

            // The phase-1 manual total is replaced by the calculated one: the sum of the activity
            // durations, 0 when the lesson has no activities, and null while any activity still
            // lacks a duration. Trashed lessons are recalculated too, so restoring one keeps the
            // same rules. No old manual estimate is spread across the activities.
            migrationBuilder.Sql("""
                UPDATE "Lessons" AS l
                SET "EstimatedDuration" = CASE
                    WHEN NOT EXISTS (SELECT 1 FROM "Activities" AS a WHERE a."LessonId" = l."Id") THEN 0
                    WHEN EXISTS (SELECT 1 FROM "Activities" AS a WHERE a."LessonId" = l."Id" AND a."EstimatedDuration" IS NULL) THEN NULL
                    ELSE (SELECT SUM(a."EstimatedDuration")::int FROM "Activities" AS a WHERE a."LessonId" = l."Id")
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The old manual estimates are not recovered. A calculated 0 has no manual equivalent,
            // so it goes back to null before the stricter constraint is restored.
            migrationBuilder.Sql("""
                UPDATE "Lessons" SET "EstimatedDuration" = NULL WHERE "EstimatedDuration" = 0
                """);

            migrationBuilder.DropCheckConstraint(
                name: "CK_Lesson_Duration",
                table: "Lessons");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Lesson_Duration",
                table: "Lessons",
                sql: ManualLessonDuration);
        }
    }
}
