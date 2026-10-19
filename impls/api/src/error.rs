//! API error type. Every variant maps to one status code and a fixed, generic message.
//! Messages never include request-supplied values (R-ERR-4).

use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("bad request")]
    BadRequest(&'static str),
    #[error("invalid url")]
    InvalidUrl,
    #[error("invalid alias")]
    InvalidAlias,
    #[error("alias reserved")]
    AliasReserved,
    #[error("alias taken")]
    AliasTaken,
    /// JSON 404, used under `/api/`.
    #[error("not found")]
    NotFound,
    /// JSON 405 for `/api/...` and `/healthz`. Holds the exact `Allow` value.
    #[error("method not allowed")]
    MethodNotAllowed(&'static str),
    /// `text/plain` 404, used everywhere outside `/api/`.
    #[error("not found (plain)")]
    PlainNotFound,
    /// `text/plain` 405 on `/{code}`.
    #[error("method not allowed (plain)")]
    PlainMethodNotAllowed(&'static str),
    #[error("database unavailable")]
    Unavailable,
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        ApiError::Internal(e.to_string())
    }
}

fn json_error(status: StatusCode, code: &str, message: &str) -> Response {
    let body = json!({ "error": { "code": code, "message": message } }).to_string();
    let mut res = (status, body).into_response();
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    res
}

fn plain(status: StatusCode, text: &'static str) -> Response {
    let mut res = (status, text).into_response();
    res.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    res
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::BadRequest(msg) => json_error(StatusCode::BAD_REQUEST, "bad_request", msg),
            ApiError::InvalidUrl => json_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_url",
                "URL must be an absolute http or https URL of at most 2048 characters.",
            ),
            ApiError::InvalidAlias => json_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_alias",
                "Alias must be 3 to 32 letters, numbers, hyphens or underscores.",
            ),
            ApiError::AliasReserved => json_error(
                StatusCode::UNPROCESSABLE_ENTITY,
                "alias_reserved",
                "That alias is reserved.",
            ),
            ApiError::AliasTaken => json_error(
                StatusCode::CONFLICT,
                "alias_taken",
                "That alias is already in use.",
            ),
            ApiError::NotFound => json_error(
                StatusCode::NOT_FOUND,
                "not_found",
                "No link with that code.",
            ),
            ApiError::MethodNotAllowed(allow) => {
                let mut res = json_error(
                    StatusCode::METHOD_NOT_ALLOWED,
                    "method_not_allowed",
                    "That method is not allowed here.",
                );
                res.headers_mut()
                    .insert(header::ALLOW, HeaderValue::from_static(allow));
                res
            }
            ApiError::PlainNotFound => plain(StatusCode::NOT_FOUND, "Short link not found"),
            ApiError::PlainMethodNotAllowed(allow) => {
                let mut res = plain(StatusCode::METHOD_NOT_ALLOWED, "Method not allowed");
                res.headers_mut()
                    .insert(header::ALLOW, HeaderValue::from_static(allow));
                res
            }
            ApiError::Unavailable => json_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "unavailable",
                "Database unavailable.",
            ),
            ApiError::Internal(detail) => {
                // The detail goes to the log only, never to the client.
                tracing::error!(%detail, "internal error");
                json_error(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "Internal server error.",
                )
            }
        }
    }
}
