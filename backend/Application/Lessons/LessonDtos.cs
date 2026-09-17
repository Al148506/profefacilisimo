using System.Text.Json;

namespace Profefacilisimo.Application.Lessons;

public record SaveLessonRequest(string Title, string Level, string Topic, string Objective);
public record LessonListItemDto(Guid Id, string Title, string Level, string Topic, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt);
public record LessonDetailsDto(Guid Id, string Title, string Level, string Topic, string Objective,
    int? EstimatedDuration, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, DateTimeOffset? DeletedAt,
    IReadOnlyList<LessonActivityDto> Activities);
public record LessonActivityDto(Guid Id, string Type, string Title, string Instructions,
    JsonElement Content, int Order, int? EstimatedDuration);
