# Refresh Token Contract

All routes are under the global prefix `/api`.

## Token lifetimes

| Token       | Expiry            | Where stored      |
|-------------|-------------------|-------------------|
| accessToken | 15 minutes        | memory / localStorage |
| refreshToken| 7 days            | httpOnly cookie / localStorage |

`REFRESH_TOKEN_EXPIRES_MS` env var overrides the refresh lifetime (default `7 * 24 * 60 * 60 * 1000`).

## POST /auth/refresh

Public — **no `Authorization` header required**. The refresh token is the credential.

### Request body

```json
{ "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
```

### Success — 200

```json
{
  "accessToken": "eyJ...new 15-min JWT...",
  "refreshToken": "eyJ...rotated 7-day JWT...",
  "user": { "id": "clx...", "email": "user@example.com", "role": "USER" }
}
```

**The refresh token is rotated on every use.** Always replace the stored token with the one returned; the old one is dead immediately.

### Error — 401

```json
{
  "message": "Invalid or expired refresh token",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Session is dead. Clear tokens and redirect to login.

## POST /auth/logout

Requires `Authorization: Bearer <accessToken>`. No body.

```json
{ "message": "Logged out successfully", "status": "success" }
```

Clears the stored refresh token server-side. Also clear it locally.

## Login responses now include refreshToken

`POST /auth/login` and `POST /auth/admin/login` both return:

```json
{
  "accessToken": "eyJ...",      // 15 min
  "refreshToken": "eyJ...",     // 7 days, NEW
  "user": { "id": "...", "email": "...", "role": "..." }
}
```

## Recommended client flow

1. On login: store `accessToken`, `refreshToken`, `user`.
2. Every request: `Authorization: Bearer <accessToken>`.
3. On `401` (except from `/auth/refresh` itself):
   - call `POST /auth/refresh` with the stored refresh token
   - on success: replace both tokens, retry the original request
   - on failure: clear tokens, redirect to login
4. Never retry `/auth/refresh` in a loop.

## Related endpoints (separate concern)

- `POST /auth/forgot-password` — body `{ "email" }`, always returns the same generic message
- `POST /auth/reset-password` — body `{ "token", "newPassword" }`, 400 on invalid/expired token
- `GET /users/me`, `PATCH /users/me` — profile persistence (own profile only)