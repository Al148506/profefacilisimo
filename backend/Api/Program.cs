using Profefacilisimo.Application.Lessons;
using Profefacilisimo.Api;
using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Profefacilisimo.Application;
using Profefacilisimo.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Configure ConnectionStrings:Default using user-secrets or environment variables.");
var jwt = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new();
if (Encoding.UTF8.GetByteCount(jwt.SigningKey) < 32 || string.IsNullOrWhiteSpace(jwt.Issuer) || string.IsNullOrWhiteSpace(jwt.Audience)
    || jwt.AccessTokenMinutes is < 1 or > 30 || jwt.RefreshTokenDays is < 1 or > 30)
    throw new InvalidOperationException("Configure Jwt with a random SigningKey of at least 32 bytes, issuer, audience and valid lifetimes.");
var origin = builder.Configuration["FrontendOrigin"] ?? throw new InvalidOperationException("Configure FrontendOrigin.");
if (!Uri.TryCreate(origin, UriKind.Absolute, out var frontendUri) || frontendUri.AbsolutePath != "/"
    || (frontendUri.Scheme != "https" && (!builder.Environment.IsDevelopment() || !frontendUri.IsLoopback)))
    throw new InvalidOperationException("FrontendOrigin must be an HTTPS origin (loopback HTTP allowed in Development).");
origin = frontendUri.GetLeftPart(UriPartial.Authority);

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connection));
builder.Services.AddIdentityCore<AppUser>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.Password.RequiredLength = 12;
    options.Password.RequireNonAlphanumeric = false;
    options.Lockout.MaxFailedAccessAttempts = 5;
    options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
}).AddEntityFrameworkStores<AppDbContext>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ILessonReader, LessonReader>();
builder.Services.AddScoped<ILessonService, LessonService>();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new()
    {
        ValidateIssuer = true, ValidIssuer = jwt.Issuer,
        ValidateAudience = true, ValidAudience = jwt.Audience,
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
        ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(5),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256], NameClaimType = "sub"
    };
});
builder.Services.AddAuthorization();
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(origin)
    .WithMethods("GET", "POST", "PUT").WithHeaders("Content-Type", "Authorization", "X-Requested-With").AllowCredentials()));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
var app = builder.Build();
app.UseExceptionHandler();
app.UseStatusCodePages();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// Custom header + exact Origin check: browsers cannot submit cross-origin cookie mutations without a preflight.
app.Use(async (context, next) =>
{
    if (HttpMethods.IsPost(context.Request.Method) && context.Request.Path.StartsWithSegments("/api/auth") &&
        (context.Request.Headers["X-Requested-With"] != "Profefacilisimo" || context.Request.Headers.Origin != origin))
    {
        await Results.Problem(statusCode: 403, title: "Origen de solicitud no permitido.").ExecuteAsync(context);
        return;
    }
    await next(context);
});

if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.MapGet("/health/live", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapGet("/health/ready", async (AppDbContext db, CancellationToken ct) =>
{
    try
    {
        return await db.Database.CanConnectAsync(ct) && !(await db.Database.GetPendingMigrationsAsync(ct)).Any()
            ? Results.Ok(new { status = "ready" }) : Results.StatusCode(503);
    }
    catch (Exception exception) when (exception is not OperationCanceledException) { return Results.StatusCode(503); }
}).AllowAnonymous();

var auth = app.MapGroup("/api/auth").RequireRateLimiting("auth");
auth.MapPost("/register", async (RegisterRequest request, IAuthService service) =>
{
    if (!ValidCredentials(request.Email, request.Password, registration: true))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["credentials"] = ["Usa un correo válido y una contraseña de 12 a 128 caracteres con mayúscula, minúscula y número."] });
    var result = await service.RegisterAsync(request);
    return result.Succeeded ? Results.StatusCode(201) : Results.ValidationProblem(new Dictionary<string, string[]> { ["registration"] = result.Errors });
});
auth.MapPost("/login", async (LoginRequest request, IAuthService service, HttpContext context, CancellationToken ct) =>
{
    if (!ValidCredentials(request.Email, request.Password, registration: false)) return Results.Unauthorized();
    var session = await service.LoginAsync(request, ct);
    if (session is null) return Results.Unauthorized();
    SetCookie(context, session, app.Environment.IsDevelopment());
    return Results.Ok(session.Response);
});
auth.MapPost("/refresh", async (IAuthService service, HttpContext context, CancellationToken ct) =>
{
    var token = context.Request.Cookies[CookieName(app.Environment.IsDevelopment())];
    var session = token is null ? null : await service.RefreshAsync(token, ct);
    if (session is null) return Results.Unauthorized();
    SetCookie(context, session, app.Environment.IsDevelopment());
    return Results.Ok(session.Response);
});
auth.MapPost("/logout", async (IAuthService service, HttpContext context, CancellationToken ct) =>
{
    var development = app.Environment.IsDevelopment();
    var token = context.Request.Cookies[CookieName(development)];
    if (token is not null) await service.LogoutAsync(token, ct);
    context.Response.Cookies.Delete(CookieName(development), CookieOptions(development));
    return Results.NoContent();
});
auth.MapGet("/me", async (ClaimsPrincipal principal, IAuthService service) =>
{
    if (!Guid.TryParse(principal.FindFirstValue("sub"), out var userId)) return Results.Unauthorized();
    var user = await service.GetUserAsync(userId);
    return user is null ? Results.Unauthorized() : Results.Ok(user);
}).RequireAuthorization();
app.MapLessonEndpoints();
app.Run();

static bool ValidCredentials(string? email, string? password, bool registration) =>
    !string.IsNullOrWhiteSpace(email) && email.Length <= 254 && new EmailAddressAttribute().IsValid(email.Trim()) &&
    password is { Length: > 0 and <= 128 } && (!registration || (password.Length >= 12 && password.Any(char.IsUpper) && password.Any(char.IsLower) && password.Any(char.IsDigit)));

static string CookieName(bool development) => development ? "pf.refresh" : "__Secure-pf.refresh";
static CookieOptions CookieOptions(bool development) => new()
{
    HttpOnly = true, Secure = !development, SameSite = SameSiteMode.Strict, Path = "/api/auth", IsEssential = true
};
static void SetCookie(HttpContext context, AuthSession session, bool development)
{
    var options = CookieOptions(development);
    options.Expires = session.RefreshExpiresAt;
    context.Response.Cookies.Append(CookieName(development), session.RefreshToken, options);
    context.Response.Headers.CacheControl = "no-store";
}

public partial class Program { }
