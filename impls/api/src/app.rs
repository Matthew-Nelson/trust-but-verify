//! Shared state, request routing and the health check.
//!
//! Every request goes through one `handle` function that does its own routing on the
//! raw, undecoded path. That keeps the SPEC's check order (R-ERR-6) in one visible place:
//! route match, then method, then query validation, then code lookup.

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::body::{Body, to_bytes};
use axum::extract::State;
use axum::http::{HeaderValue, Method, Request, StatusCode, header};
use axum::response::Response;
use serde::Serialize;
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::error::ApiError;
use crate::query::{decode_code, escapes_are_well_formed};
use crate::{links, redirect, stats};

pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
}

/// Builds the router. There is a single fallback handler; see the module comment.
/// The trace layer logs method, status and latency only, never the path or client address (R-PRIV-1).
pub fn router(state: Arc<AppState>) -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(|_req: &Request<Body>| tracing::debug_span!("request"))
        .on_request(())
        .on_response(|res: &Response, latency: Duration, _span: &tracing::Span| {
            tracing::info!(
                status = res.status().as_u16(),
                latency_ms = latency.as_millis() as u64,
                "response"
            );
        });
    Router::new()
        .fallback(handle)
        .with_state(state)
        .layer(trace)
}

pub fn json_response<T: Serialize>(status: StatusCode, value: &T) -> Response {
    match serde_json::to_vec(value) {
        Ok(bytes) => {
            let mut res = Response::new(Body::from(bytes));
            *res.status_mut() = status;
            res.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            );
            res
        }
        Err(e) => axum::response::IntoResponse::into_response(ApiError::Internal(e.to_string())),
    }
}

// -------------------------------------------------------------------- routing

/// A path that matched a route. Codes are still percent-encoded.
#[derive(Debug, PartialEq, Eq)]
enum Route<'a> {
    Health,
    Links,
    Link(&'a str),
    Stats(&'a str),
    Redirect(&'a str),
    /// No route matches. `json` is true under `/api/<something>`.
    Unmatched {
        json: bool,
    },
}

/// True for `.` and `..`, spelled with literal dots and/or `%2e` in any case.
fn is_dot_segment(segment: &str) -> bool {
    let lower = segment.to_ascii_lowercase().replace("%2e", ".");
    lower == "." || lower == ".."
}

/// Matches the undecoded path. Dot segments, empty segments and malformed escapes never match.
fn match_route(path: &str) -> Route<'_> {
    let json = path.starts_with("/api/") && path.len() > "/api/".len();
    let unmatched = Route::Unmatched { json };
    let Some(rest) = path.strip_prefix('/') else {
        return unmatched;
    };
    let segments: Vec<&str> = rest.split('/').collect();
    if segments
        .iter()
        .any(|s| s.is_empty() || is_dot_segment(s) || !escapes_are_well_formed(s))
    {
        return unmatched;
    }
    match segments.as_slice() {
        ["healthz"] => Route::Health,
        ["api", "links"] => Route::Links,
        ["api", "links", code] => Route::Link(code),
        ["api", "links", code, "stats"] => Route::Stats(code),
        [code] => Route::Redirect(code),
        _ => unmatched,
    }
}

async fn handle(State(state): State<Arc<AppState>>, req: Request<Body>) -> Response {
    let (parts, body) = req.into_parts();
    let result = dispatch(&state, parts, body).await;
    match result {
        Ok(res) => res,
        Err(e) => axum::response::IntoResponse::into_response(e),
    }
}

async fn dispatch(
    state: &AppState,
    parts: axum::http::request::Parts,
    body: Body,
) -> Result<Response, ApiError> {
    let method = &parts.method;
    let path = parts.uri.path();
    let query = parts.uri.query();
    // HEAD runs the GET logic; hyper drops the body from the response.
    let is_get = method == Method::GET || method == Method::HEAD;

    match match_route(path) {
        Route::Unmatched { json: true } => Err(ApiError::NotFound),
        Route::Unmatched { json: false } => Err(ApiError::PlainNotFound),
        Route::Health => {
            if !is_get {
                return Err(ApiError::MethodNotAllowed("GET, HEAD"));
            }
            health(state).await
        }
        Route::Links => {
            if *method == Method::POST {
                // Content-Type is ignored; the raw bytes are parsed as JSON.
                let bytes = to_bytes(body, links::MAX_BODY_BYTES).await.map_err(|_| {
                    ApiError::BadRequest("Request body is too large or unreadable.")
                })?;
                links::create(state, &bytes).await
            } else if is_get {
                links::list(state, query).await
            } else {
                Err(ApiError::MethodNotAllowed("GET, HEAD, POST"))
            }
        }
        Route::Link(code) => {
            if is_get {
                links::get(state, decode_code(code)).await
            } else if *method == Method::DELETE {
                links::delete(state, decode_code(code)).await
            } else {
                Err(ApiError::MethodNotAllowed("GET, HEAD, DELETE"))
            }
        }
        Route::Stats(code) => {
            if !is_get {
                return Err(ApiError::MethodNotAllowed("GET, HEAD"));
            }
            stats::stats(state, decode_code(code), query).await
        }
        Route::Redirect(code) => {
            if !is_get {
                return Err(ApiError::PlainMethodNotAllowed("GET, HEAD"));
            }
            let record = *method == Method::GET;
            redirect::follow(state, decode_code(code), &parts.headers, record).await
        }
    }
}

// ---------------------------------------------------------------------- health

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

/// Queries the database on every call, with a 2 second limit (R-HEALTH-1, R-HEALTH-3).
async fn health(state: &AppState) -> Result<Response, ApiError> {
    let check = tokio::time::timeout(
        Duration::from_secs(2),
        sqlx::query("SELECT 1").execute(&state.pool),
    )
    .await;
    match check {
        Ok(Ok(_)) => Ok(json_response(StatusCode::OK, &Health { status: "ok" })),
        _ => Err(ApiError::Unavailable),
    }
}

/// Applies migrations, retrying until the database is reachable. Never gives up (R-HEALTH-2).
pub async fn migrate_forever(pool: PgPool) {
    loop {
        let attempt = tokio::time::timeout(
            Duration::from_secs(15),
            sqlx::migrate!("./migrations").run(&pool),
        )
        .await;
        match attempt {
            Ok(Ok(())) => {
                tracing::info!("migrations applied");
                return;
            }
            Ok(Err(e)) => tracing::warn!(error = %e, "migration failed, will retry"),
            Err(_) => tracing::warn!("migration timed out, will retry"),
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes() {
        assert_eq!(match_route("/healthz"), Route::Health);
        assert_eq!(match_route("/api/links"), Route::Links);
        assert_eq!(match_route("/api/links/ab%2Fc"), Route::Link("ab%2Fc"));
        assert_eq!(match_route("/api/links/x/stats"), Route::Stats("x"));
        assert_eq!(match_route("/abc"), Route::Redirect("abc"));
        assert_eq!(match_route("/api"), Route::Redirect("api"));
        assert_eq!(match_route("/a%2Fb"), Route::Redirect("a%2Fb"));
        assert_eq!(match_route("/HEALTHZ"), Route::Redirect("HEALTHZ"));
    }

    #[test]
    fn unmatched() {
        let plain = Route::Unmatched { json: false };
        let json = Route::Unmatched { json: true };
        for p in [
            "/",
            "//",
            "/abc/",
            "/api/",
            "/healthz/",
            "/a/b",
            "/.",
            "/..",
            "/%2e",
            "/.%2E",
            "/%2E%2e",
            "/a%zz",
            "/a%2",
        ] {
            assert_eq!(match_route(p), plain, "{p}");
        }
        for p in [
            "/api/x",
            "/api/links/",
            "/api/links/x/",
            "/api/links/x/y",
            "/api/links/./stats",
            "/api//links",
            "/api/links/%2E%2e",
            "/api/links/a%zz",
            "/api/links/x/stats/z",
            "/api/links/..%",
        ] {
            assert_eq!(match_route(p), json, "{p}");
        }
    }
}
