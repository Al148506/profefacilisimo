using System.Net;
using System.Net.Http.Json;
namespace Profefacilisimo.Tests;

public class AuthHardeningTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task DuplicateEmailAndWeakPasswordAreRejected()
    {
        var client = fixture.Browser();
        var email = $"duplicate-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "weak" })).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "TestPassword12345" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/auth/register", new { email = email.ToUpperInvariant(), password = "TestPassword12345" })).StatusCode);
    }

    [Fact]
    public async Task FiveFailuresLockTheAccount()
    {
        var client = fixture.Browser();
        var email = $"lockout-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "TestPassword12345" })).StatusCode);
        for (var i = 0; i < 5; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email, password = "wrong" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email, password = "TestPassword12345" })).StatusCode);
    }

    [Fact]
    public async Task RefreshCookieIsHttpOnlyAndScoped()
    {
        var client = fixture.Browser();
        var email = $"cookie-{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/auth/register", new { email, password = "TestPassword12345" })).StatusCode);
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password = "TestPassword12345" });
        response.EnsureSuccessStatusCode();
        var cookie = response.Headers.GetValues("Set-Cookie").Single().ToLowerInvariant();
        Assert.Contains("httponly", cookie);
        Assert.Contains("samesite=strict", cookie);
        Assert.Contains("path=/api/auth", cookie);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
    }
}
public class RateLimitTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    [Fact]
    public async Task AuthEndpointsRejectRequestsOverTheLimit()
    {
        var client = fixture.Browser();
        for (var i = 0; i < 30; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.GetAsync("/api/auth/me")).StatusCode);
    }
}

