# Mobile API contract

The mobile app (React Native / Expo, separate repository) talks to the same API as the web
app. The only difference is how the session is carried.

Base URL: `https://orm.webflowby.online/api`

## Sessions

Send this header on **every** request from the app:

```
X-Reputa-Client: mobile
```

With it, the three sign-in endpoints return a bearer token instead of setting a cookie:

| Endpoint | Body | Notes |
|---|---|---|
| `POST /auth/signup` | `{ name, email, password, organizationName, brandName }` | 201. Starts a 14-day trial. |
| `POST /auth/login` | `{ email, password }` | 401 for a wrong password, an unknown email, or a Google-only account. |
| `POST /auth/google` | `{ credential }` | `credential` is the Google **ID token** from the device. 201 + `created: true` for a new account. |

Response (all three):

```json
{
  "user": { "id": "…", "email": "…", "name": "…", "role": "owner", "hasPassword": true, "googleLinked": false },
  "organization": { "id": "…", "name": "…", "brandName": "…", "plan": "trial", "subscriptionState": "trialing", "trialEndsAt": "…" },
  "token": "<jwt>",
  "expiresAt": "2026-11-02T12:00:00.000Z",
  "created": false
}
```

Store `token` in the device keychain (`expo-secure-store`) and send it as:

```
Authorization: Bearer <token>
```

Tokens last 30 days. Call `POST /auth/refresh` (with the current token) on app start to get a
fresh `{ token, expiresAt }`; if it answers 401 the session is gone and the user signs in again.
`GET /auth/me` returns the current `user` and `organization`. Signing out is local: delete the token.

## Google sign-in on the device

Use the Google client ids for iOS and Android and request an **ID token** (not an access
token). Post it as `credential` to `/auth/google`. The server accepts any client id listed in
`GOOGLE_CLIENT_IDS`, so the web, iOS and Android ids all go in that one variable.

## Errors

Every error is JSON: `{ "error": "Human-readable message" }`.

| Status | Meaning | App behaviour |
|---|---|---|
| 400 | Invalid input | Show `error` next to the form. |
| 401 | Not signed in / bad credentials | On a protected route: clear the token and show sign-in. |
| 402 | The workspace's plan doesn't cover this (`code`, `upgrade: true`) | Show `error`; point to the website to change plan. Never sell plans in-app. |
| 429 | Rate limited | Back off and retry. |

`subscriptionState` is one of `trialing`, `active`, `past_due`, `expired`, `canceled`. When it
is `expired` or `canceled`, reads still work and scans answer 402.

## Endpoints the first version of the app needs

| Screen | Request |
|---|---|
| Overview | `GET /overview` — totals, sentiment split, `openAlerts`, `alertsSent24h`, week-over-week `trend` |
| Chart | `GET /charts/over-time` |
| Mentions | `GET /items?page=1&pageSize=25&search=&platform=&sentiment=&dateFrom=` |
| Alerts | `GET /items/negative?pageSize=200` |
| Resolve | `PATCH /items/:kind/:id/resolve` with `{ resolved: true }` (`kind` is `post` or `comment`) |
| Plan | `GET /billing` — plan, state, limits and usage (read-only in the app) |
| Workspace | `GET /settings`, `PATCH /settings` |

| Mention | `GET /items/post/:id` or `GET /items/comment/:id` — one mention, same shape as the lists |

## Push notifications

The app registers its Expo push token after sign-in and at every launch, and removes it on sign-out:

| Request | Body |
|---|---|
| `POST /devices` | `{ "token": "ExponentPushToken[…]", "platform": "android" \| "ios" }` |
| `DELETE /devices` | `{ "token": "ExponentPushToken[…]" }` |

Every new negative mention (not a competitor's) is pushed once to all devices in the workspace,
independently of the email alert:

```json
{ "title": "Negative mention on Reddit", "body": "<first 160 characters>", "channelId": "alerts", "data": { "url": "/mention/comment/<id>" } }
```

`data.url` is an in-app path; the app opens it and loads the mention with `GET /items/:kind/:id`.
Mentions older than 24 hours are never pushed, so registering a phone does not replay history.
Tokens Expo reports as `DeviceNotRegistered` are deleted automatically.
