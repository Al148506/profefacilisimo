using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Profefacilisimo.Application;

namespace Profefacilisimo.Infrastructure;

public sealed class JwtOptions
{
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public string SigningKey { get; set; } = "";
    public int AccessTokenMinutes { get; set; } = 10;
    public int RefreshTokenDays { get; set; } = 7;
}

public sealed class AuthService(
    UserManager<AppUser> users, AppDbContext db, IOptions<JwtOptions> options, TimeProvider clock) : IAuthService
{
    private readonly JwtOptions _jwt = options.Value;

    public async Task<RegistrationResult> RegisterAsync(RegisterRequest request)
    {
        var user = new AppUser { Id = Guid.NewGuid(), UserName = request.Email.Trim(), Email = request.Email.Trim() };
        try
        {
            var result = await users.CreateAsync(user, request.Password);
            return new(result.Succeeded, result.Succeeded ? [] : ["No se pudo crear la cuenta. Revisa los datos o inicia sesión."]);
        }
        catch (DbUpdateException exception) when (exception.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        {
            return new(false, ["No se pudo crear la cuenta. Revisa los datos o inicia sesión."]);
        }
    }

    public async Task<AuthSession?> LoginAsync(LoginRequest request, CancellationToken cancellationToken)
    {
        var user = await users.FindByEmailAsync(request.Email.Trim());
        if (user is null || await users.IsLockedOutAsync(user)) return null;
        if (!await users.CheckPasswordAsync(user, request.Password))
        {
            await users.AccessFailedAsync(user);
            return null;
        }
        await users.ResetAccessFailedCountAsync(user);
        var session = Issue(user);
        db.RefreshSessions.Add(ToStoredSession(user.Id, session));
        await db.SaveChangesAsync(cancellationToken);
        return session;
    }

    public async Task<AuthSession?> RefreshAsync(string token, CancellationToken cancellationToken)
    {
        if (token.Length != 64) return null;
        var hash = Hash(token);
        var now = clock.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        // The conditional UPDATE takes a row lock: only one concurrent request can consume a token.
        var consumed = await db.RefreshSessions.Where(x => x.TokenHash == hash && x.RevokedAt == null && x.ExpiresAt > now)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.RevokedAt, now), cancellationToken);
        if (consumed != 1) return null;
        var stored = await db.RefreshSessions.AsNoTracking().SingleAsync(x => x.TokenHash == hash, cancellationToken);
        var user = await users.FindByIdAsync(stored.UserId.ToString());
        if (user is null || await users.IsLockedOutAsync(user))
        {
            await transaction.CommitAsync(cancellationToken);
            return null;
        }
        var session = Issue(user);
        db.RefreshSessions.Add(ToStoredSession(user.Id, session));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return session;
    }

    public async Task LogoutAsync(string token, CancellationToken cancellationToken)
    {
        var hash = Hash(token);
        var now = clock.GetUtcNow();
        await db.RefreshSessions.Where(x => x.TokenHash == hash && x.RevokedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.RevokedAt, now), cancellationToken);
    }

    public async Task<UserDto?> GetUserAsync(Guid userId)
    {
        var user = await users.FindByIdAsync(userId.ToString());
        return user is null ? null : new(user.Id, user.Email!);
    }

    private AuthSession Issue(AppUser user)
    {
        var now = clock.GetUtcNow();
        var expires = now.AddMinutes(_jwt.AccessTokenMinutes);
        var jwt = new JwtSecurityToken(_jwt.Issuer, _jwt.Audience,
            [new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())],
            notBefore: now.UtcDateTime, expires: expires.UtcDateTime,
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_jwt.SigningKey)), SecurityAlgorithms.HmacSha256));
        return new(new(new JwtSecurityTokenHandler().WriteToken(jwt), expires, new(user.Id, user.Email!)),
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)), now.AddDays(_jwt.RefreshTokenDays));
    }
    private static RefreshSession ToStoredSession(Guid userId, AuthSession session) => new()
    {
        UserId = userId, TokenHash = Hash(session.RefreshToken), ExpiresAt = session.RefreshExpiresAt
    };
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
