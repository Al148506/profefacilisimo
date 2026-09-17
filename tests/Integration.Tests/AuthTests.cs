using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Profefacilisimo.Application;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

public class AuthTests(ApiFixture fixture) : IClassFixture<ApiFixture>
{
    private const string Password = "TestPassword12345";
    private async Task<(HttpClient Client, AuthResponse Auth, string Cookie)> Login()
    {
        var client = fixture.Browser();
        var email = $"{Guid.NewGuid():N}@example.com";
        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/api/auth/register", new { email, password = Password })).StatusCode);
        var login = await client.PostAsJsonAsync("/api/auth/login", new { email, password = Password });
        login.EnsureSuccessStatusCode();
        return (client, (await login.Content.ReadFromJsonAsync<AuthResponse>())!, Cookie(login));
    }
    private static string Cookie(HttpResponseMessage response) => response.Headers.GetValues("Set-Cookie").First().Split(';')[0];
    private static HttpRequestMessage WithCookie(string path, string cookie)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.Add("Cookie", cookie);
        return request;
    }

    [Fact]
    public async Task RegistrationLoginAndMeWork()
    {
        var (client, auth, cookie) = await Login();
        Assert.StartsWith("pf.refresh=", cookie);
        Assert.Equal(3, auth.AccessToken.Split('.').Length);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        var me = await client.GetFromJsonAsync<UserDto>("/api/auth/me");
        Assert.Equal(auth.User.Id, me!.Id);
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var stored = await db.RefreshSessions.SingleAsync(x => x.UserId == auth.User.Id);
        Assert.Equal(64, stored.TokenHash.Length);
        Assert.DoesNotContain(stored.TokenHash, cookie);
    }

    [Fact]
    public async Task RefreshRotatesAndLogoutRevokes()
    {
        var (client, _, cookie) = await Login();
        var refreshed = await client.SendAsync(WithCookie("/api/auth/refresh", cookie));
        refreshed.EnsureSuccessStatusCode();
        var rotated = Cookie(refreshed);
        Assert.NotEqual(cookie, rotated);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(WithCookie("/api/auth/refresh", cookie))).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.SendAsync(WithCookie("/api/auth/logout", rotated))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(WithCookie("/api/auth/refresh", rotated))).StatusCode);
    }

    [Fact]
    public async Task ConcurrentRefreshHasOnlyOneWinner()
    {
        var (client, _, cookie) = await Login();
        var results = await Task.WhenAll(client.SendAsync(WithCookie("/api/auth/refresh", cookie)), client.SendAsync(WithCookie("/api/auth/refresh", cookie)));
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK);
        Assert.Single(results, x => x.StatusCode == HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task ExpiredRefreshIsRejected()
    {
        var (client, auth, cookie) = await Login();
        using var scope = fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.RefreshSessions.Where(x => x.UserId == auth.User.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ExpiresAt, DateTimeOffset.UtcNow.AddDays(-1)));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.SendAsync(WithCookie("/api/auth/refresh", cookie))).StatusCode);
    }

    [Fact]
    public async Task InvalidPasswordAndMissingTokenAreRejected()
    {
        var (client, auth, _) = await Login();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/login", new { email = auth.User.Email, password = "wrong" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task CrossOriginAndMissingCsrfHeaderAreRejected()
    {
        var client = fixture.Browser();
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
        client.DefaultRequestHeaders.Remove("Origin");
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");
        client.DefaultRequestHeaders.Remove("X-Requested-With");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync("/api/auth/logout", null)).StatusCode);
    }

    [Theory]
    [InlineData("expired")]
    [InlineData("issuer")]
    [InlineData("audience")]
    [InlineData("signature")]
    public async Task InvalidJwtIsRejected(string variant)
    {
        var client = fixture.Browser();
        var token = new JwtSecurityToken(variant == "issuer" ? "other" : "Profefacilisimo",
            variant == "audience" ? "other" : "Profefacilisimo.Web", [new Claim("sub", Guid.NewGuid().ToString())],
            expires: variant == "expired" ? DateTime.UtcNow.AddMinutes(-10) : DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(variant == "signature" ? new string('x', 64) : ApiFixture.SigningKey)), SecurityAlgorithms.HmacSha256));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", new JwtSecurityTokenHandler().WriteToken(token));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }
}
