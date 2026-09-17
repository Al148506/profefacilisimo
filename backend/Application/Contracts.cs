namespace Profefacilisimo.Application;

public record RegisterRequest(string Email, string Password);
public record LoginRequest(string Email, string Password);
public record UserDto(Guid Id, string Email);
public record AuthResponse(string AccessToken, DateTimeOffset ExpiresAt, UserDto User);
public record AuthSession(AuthResponse Response, string RefreshToken, DateTimeOffset RefreshExpiresAt);
public record RegistrationResult(bool Succeeded, string[] Errors);

public interface IAuthService
{
    Task<RegistrationResult> RegisterAsync(RegisterRequest request);
    Task<AuthSession?> LoginAsync(LoginRequest request, CancellationToken cancellationToken);
    Task<AuthSession?> RefreshAsync(string token, CancellationToken cancellationToken);
    Task LogoutAsync(string token, CancellationToken cancellationToken);
    Task<UserDto?> GetUserAsync(Guid userId);
}

// An explicit query boundary, not a generic repository. No public lesson CRUD in phase 1.
public interface ILessonReader
{
    Task<LessonSummary?> FindOwnedAsync(Guid lessonId, Guid userId, CancellationToken cancellationToken);
}
public record LessonSummary(Guid Id, string Title, int ActivityCount);
