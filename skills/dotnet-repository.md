# dotnet-repository

Repository, Handler, and Controller patterns for C# / .NET projects using Dapper.

## Repository pattern

- One repository per aggregate root
- Interface in `src/<Module>/Interfaces/I<Entity>Repository.cs`
- Implementation in `src/<Module>/Repositories/<Entity>Repository.cs`
- Constructor injection only — no service locator

```csharp
public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(int id, CancellationToken ct = default);
    Task<IEnumerable<Order>> GetByUserAsync(int userId, CancellationToken ct = default);
    Task<int> CreateAsync(Order order, CancellationToken ct = default);
    Task UpdateAsync(Order order, CancellationToken ct = default);
}
```

**Dapper conventions**:
- Pass `IDbConnection` through constructor (registered as scoped)
- Always use parameterized queries — no string interpolation in SQL
- Return `Task<T?>` for single-item queries; `IEnumerable<T>` for lists
- Use `CancellationToken` on all async methods

## Handler pattern (CQRS-lite)

- One handler per use case: `<Verb><Noun>Handler`
- Handlers call repositories; controllers call handlers
- No business logic in controllers; no data access in handlers

```csharp
public class CreateOrderHandler(IOrderRepository repo, ILogger<CreateOrderHandler> logger)
{
    public async Task<int> HandleAsync(CreateOrderRequest request, CancellationToken ct)
    {
        // validate → build entity → persist → return id
    }
}
```

## Controller conventions

- Thin controllers: validate input, call handler, return response
- Use `[ApiController]` and route attributes
- Return `IActionResult` or `ActionResult<T>`
- Map domain exceptions to HTTP status codes in a global exception filter — not inline

## Error handling

- Throw domain exceptions (`NotFoundException`, `ValidationException`) from handlers
- Global exception middleware maps them to ProblemDetails responses
- Never swallow exceptions silently; log at the point of throw with context

## File structure

```
src/
  <Module>/
    Controllers/   <Entity>Controller.cs
    Handlers/      Create|Update|Delete<Entity>Handler.cs
    Interfaces/    I<Entity>Repository.cs
    Models/        <Entity>.cs, <Entity>Dto.cs
    Repositories/  <Entity>Repository.cs
```
