using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Profefacilisimo.Infrastructure;

namespace Profefacilisimo.Tests;

public sealed class ApiFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string SigningKey = "TEST-ONLY-random-looking-signing-key-never-use-in-production-123456";
    private readonly string _database = "pf_test_" + Guid.NewGuid().ToString("N");
    private string _adminConnection = "";
    public string ConnectionString { get; private set; } = "";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Default", ConnectionString);
        builder.UseSetting("Jwt:SigningKey", SigningKey);
        builder.UseSetting("Jwt:Issuer", "Profefacilisimo");
        builder.UseSetting("Jwt:Audience", "Profefacilisimo.Web");
        builder.UseSetting("FrontendOrigin", "http://localhost:5173");
    }

    public async Task InitializeAsync()
    {
        var source = Environment.GetEnvironmentVariable("TEST_DATABASE_CONNECTION")
            ?? throw new InvalidOperationException("Run scripts/Test.ps1 or set TEST_DATABASE_CONNECTION to a local PostgreSQL server. Integration tests create a separate pf_test_* database.");
        var settings = new NpgsqlConnectionStringBuilder(source) { Database = "postgres" };
        _adminConnection = settings.ConnectionString;
        await using var admin = new NpgsqlConnection(_adminConnection);
        await admin.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{_database}\"", admin);
        await command.ExecuteNonQueryAsync();
        settings.Database = _database;
        ConnectionString = settings.ConnectionString;
        using var scope = Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    }

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        if (string.IsNullOrEmpty(_adminConnection)) return;
        NpgsqlConnection.ClearAllPools();
        await using var admin = new NpgsqlConnection(_adminConnection);
        await admin.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{_database}\" WITH (FORCE)", admin);
        await command.ExecuteNonQueryAsync();
    }

    public HttpClient Browser()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");
        client.DefaultRequestHeaders.Add("X-Requested-With", "Profefacilisimo");
        return client;
    }
}
