using System.Text.Json;

namespace Profefacilisimo.Application.Lessons;

// One save carries the metadata and the complete activity set. `Activities` is null only when the
// client omits the array: POST accepts that, PUT rejects it, and it is never a request to delete.
public record SaveLessonRequest(string Title, string Level, string Topic, string Objective,
    IReadOnlyList<LessonActivityInput>? Activities);

// One activity of a save. A null Id means "new", and an existing Id must belong to the same lesson
// and the same owner. UserId, LessonId and Order are never taken from the client.
public record LessonActivityInput(Guid? Id, string Type, string Title, string Instructions,
    int EstimatedDuration, JsonElement Content);
public record LessonListItemDto(Guid Id, string Title, string Level, string Topic, int? EstimatedDuration,
    DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt);
public record LessonDetailsDto(Guid Id, string Title, string Level, string Topic, string Objective,
    int? EstimatedDuration, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt,
    IReadOnlyList<LessonActivityDto> Activities);
public record LessonActivityDto(Guid Id, string Type, string Title, string Instructions,
    JsonElement Content, int Order, int? EstimatedDuration);
