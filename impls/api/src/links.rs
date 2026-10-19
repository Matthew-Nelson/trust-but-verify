//! Creating, listing, reading and deleting links, plus URL and alias validation.

use axum::http::StatusCode;
use axum::response::Response;
use chrono::{DateTime, SecondsFormat, Utc};
use rand::RngExt;
use serde::Serialize;
use serde_json::Value;
use url::Url;

use crate::app::{AppState, json_response};
use crate::error::ApiError;
use crate::query::integer_param;

/// Largest request body accepted by `POST /api/links` (R-ERR-2).
pub const MAX_BODY_BYTES: usize = 65_536;
const MAX_URL_CODE_POINTS: usize = 2048;
const RESERVED_ALIASES: [&str; 8] = [
    "api", "healthz", "docs", "admin", "static", "assets", "login", "logout",
];
const CODE_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const CODE_LENGTH: usize = 7;
const MAX_CODE_ATTEMPTS: usize = 10;

/// The `Link` object in API responses.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub code: String,
    pub url: String,
    pub short_url: String,
    pub is_custom: bool,
    pub created_at: String,
    pub click_count: i64,
    pub last_clicked_at: Option<String>,
}

/// One database row of a link plus its click aggregates.
pub struct LinkRow {
    pub code: String,
    pub url: String,
    pub is_custom: bool,
    pub created_at: DateTime<Utc>,
    pub click_count: i64,
    pub last_clicked_at: Option<DateTime<Utc>>,
}

/// RFC 3339 in UTC with a `Z` suffix; fractional seconds appear only when non-zero.
fn format_time(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(SecondsFormat::AutoSi, true)
}

impl LinkRow {
    pub fn into_link(self, public_base_url: &str) -> Link {
        Link {
            short_url: format!("{public_base_url}/{}", self.code),
            code: self.code,
            url: self.url,
            is_custom: self.is_custom,
            created_at: format_time(self.created_at),
            click_count: self.click_count,
            last_clicked_at: self.last_clicked_at.map(format_time),
        }
    }
}

// ---------------------------------------------------------------- validation

/// ASCII whitespace as defined by the SPEC: tab, LF, FF, CR and space. Nothing else.
fn is_spec_whitespace(c: char) -> bool {
    matches!(c, '\t' | '\n' | '\u{000C}' | '\r' | ' ')
}

/// Validates a destination URL and returns its WHATWG serialization (R-URL-1..4).
pub fn validate_url(raw: &str, public_hostname: &str) -> Result<String, ApiError> {
    let trimmed = raw.trim_matches(is_spec_whitespace);
    if trimmed.chars().count() > MAX_URL_CODE_POINTS {
        return Err(ApiError::InvalidUrl);
    }
    let parsed = Url::parse(trimmed).map_err(|_| ApiError::InvalidUrl)?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(ApiError::InvalidUrl);
    }
    match parsed.host_str() {
        None | Some("") => return Err(ApiError::InvalidUrl),
        Some(host) if host == public_hostname => return Err(ApiError::InvalidUrl),
        Some(_) => {}
    }
    Ok(parsed.to_string())
}

/// Checks a custom alias: format first (R-ALIAS-1), then the reserved list (R-ALIAS-2).
pub fn validate_alias(alias: &str) -> Result<(), ApiError> {
    let well_formed = (3..=32).contains(&alias.len())
        && alias
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if !well_formed {
        return Err(ApiError::InvalidAlias);
    }
    if is_reserved(alias) {
        return Err(ApiError::AliasReserved);
    }
    Ok(())
}

fn is_reserved(code: &str) -> bool {
    RESERVED_ALIASES
        .iter()
        .any(|r| r.eq_ignore_ascii_case(code))
}

fn generate_code() -> String {
    let mut rng = rand::rng();
    loop {
        let code: String = (0..CODE_LENGTH)
            .map(|_| CODE_ALPHABET[rng.random_range(0..CODE_ALPHABET.len())] as char)
            .collect();
        // "healthz" has 7 letters, so a random code could equal a reserved alias.
        if !is_reserved(&code) {
            return code;
        }
    }
}

/// The parsed, validated body of `POST /api/links`.
pub struct CreateRequest {
    pub url: String,
    pub alias: Option<String>,
}

/// Parses and validates a create request body. Precedence follows R-ERR-2:
/// malformed body (400), then URL, then alias format, then reserved.
pub fn parse_create_request(body: &[u8], public_hostname: &str) -> Result<CreateRequest, ApiError> {
    let bad = || ApiError::BadRequest("Request body must be a JSON object with a 'url' string.");
    if body.len() > MAX_BODY_BYTES {
        return Err(bad());
    }
    // serde_json rejects invalid UTF-8 and unpaired surrogate escapes; with duplicate keys the last wins.
    let value: Value = serde_json::from_slice(body).map_err(|_| bad())?;
    let Value::Object(map) = value else {
        return Err(bad());
    };
    let Some(Value::String(url)) = map.get("url") else {
        return Err(bad());
    };
    let alias = match map.get("alias") {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) if s.is_empty() => None,
        Some(Value::String(s)) => Some(s.clone()),
        Some(_) => return Err(bad()),
    };
    let url = validate_url(url, public_hostname)?;
    if let Some(alias) = &alias {
        validate_alias(alias)?;
    }
    Ok(CreateRequest { url, alias })
}

// ------------------------------------------------------------------ handlers

pub async fn create(state: &AppState, body: &[u8]) -> Result<Response, ApiError> {
    let req = parse_create_request(body, &state.config.public_hostname)?;
    let row = match req.alias {
        Some(alias) => match insert_link(state, &alias, &req.url, true).await? {
            Some(row) => row,
            None => return Err(ApiError::AliasTaken),
        },
        None => {
            let mut created = None;
            for _ in 0..MAX_CODE_ATTEMPTS {
                if let Some(row) = insert_link(state, &generate_code(), &req.url, false).await? {
                    created = Some(row);
                    break;
                }
            }
            created.ok_or_else(|| ApiError::Internal("could not generate a unique code".into()))?
        }
    };
    let link = row.into_link(&state.config.public_base_url);
    Ok(json_response(StatusCode::CREATED, &link))
}

/// Inserts a link. Returns `None` when the code already exists: the database's unique
/// constraint decides, so concurrent requests cannot both win (R-ALIAS-5).
async fn insert_link(
    state: &AppState,
    code: &str,
    url: &str,
    is_custom: bool,
) -> Result<Option<LinkRow>, ApiError> {
    let result = sqlx::query!(
        r#"INSERT INTO links (code, url, is_custom) VALUES ($1, $2, $3)
           RETURNING code, url, is_custom, created_at"#,
        code,
        url,
        is_custom
    )
    .fetch_one(&state.pool)
    .await;
    match result {
        Ok(r) => Ok(Some(LinkRow {
            code: r.code,
            url: r.url,
            is_custom: r.is_custom,
            created_at: r.created_at,
            click_count: 0,
            last_clicked_at: None,
        })),
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub async fn get(state: &AppState, code: Option<String>) -> Result<Response, ApiError> {
    let Some(code) = code else {
        return Err(ApiError::NotFound);
    };
    let row = sqlx::query_as!(
        LinkRow,
        r#"SELECT l.code, l.url, l.is_custom, l.created_at,
                  (SELECT count(*) FROM clicks c WHERE c.link_id = l.id) AS "click_count!",
                  (SELECT max(c.clicked_at) FROM clicks c WHERE c.link_id = l.id) AS last_clicked_at
           FROM links l WHERE l.code = $1"#,
        code
    )
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;
    Ok(json_response(
        StatusCode::OK,
        &row.into_link(&state.config.public_base_url),
    ))
}

pub async fn delete(state: &AppState, code: Option<String>) -> Result<Response, ApiError> {
    let Some(code) = code else {
        return Err(ApiError::NotFound);
    };
    let result = sqlx::query!("DELETE FROM links WHERE code = $1", code)
        .execute(&state.pool)
        .await?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(Response::builder()
        .status(StatusCode::NO_CONTENT)
        .body(axum::body::Body::empty())
        .expect("static response"))
}

#[derive(Serialize)]
struct LinkPage {
    items: Vec<Link>,
    total: i64,
    limit: i64,
    offset: i64,
}

pub async fn list(state: &AppState, query: Option<&str>) -> Result<Response, ApiError> {
    let limit = integer_param(query, "limit", 1, 100, 20)?;
    let offset = integer_param(query, "offset", 0, i64::MAX, 0)?;
    let rows = sqlx::query_as!(
        LinkRow,
        r#"SELECT l.code, l.url, l.is_custom, l.created_at,
                  (SELECT count(*) FROM clicks c WHERE c.link_id = l.id) AS "click_count!",
                  (SELECT max(c.clicked_at) FROM clicks c WHERE c.link_id = l.id) AS last_clicked_at
           FROM links l ORDER BY l.created_at DESC, l.id DESC LIMIT $1 OFFSET $2"#,
        limit,
        offset
    )
    .fetch_all(&state.pool)
    .await?;
    let total = sqlx::query_scalar!(r#"SELECT count(*) AS "total!" FROM links"#)
        .fetch_one(&state.pool)
        .await?;
    let page = LinkPage {
        items: rows
            .into_iter()
            .map(|r| r.into_link(&state.config.public_base_url))
            .collect(),
        total,
        limit,
        offset,
    };
    Ok(json_response(StatusCode::OK, &page))
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOST: &str = "localhost";

    fn url(s: &str) -> Result<String, ApiError> {
        validate_url(s, HOST)
    }

    #[test]
    fn url_normative_examples() {
        let cases = [
            ("https://example.com", "https://example.com/"),
            ("HTTPS://Example.COM:443/a/../b", "https://example.com/b"),
            (
                "https://bücher.example/ä",
                "https://xn--bcher-kva.example/%C3%A4",
            ),
            ("https://example.com/a b", "https://example.com/a%20b"),
            ("http:example.com", "http://example.com/"),
            ("http:///example.com", "http://example.com/"),
            ("https://example.com\\path", "https://example.com/path"),
            ("  https://example.com/x  ", "https://example.com/x"),
            ("\u{000B}https://example.com/x", "https://example.com/x"),
            ("\thttps://exa\tmple.com/\n", "https://example.com/"),
        ];
        for (input, want) in cases {
            assert_eq!(url(input).unwrap(), want, "{input:?}");
        }
    }

    #[test]
    fn url_rejections() {
        for bad in [
            "javascript:alert(1)",
            "ftp://example.com/",
            "/relative",
            "example.com",
            "",
            "   ",
            "https://",
            "http://localhost/x",
            "http://LOCALHOST:9999/x",
        ] {
            assert!(matches!(url(bad), Err(ApiError::InvalidUrl)), "{bad:?}");
        }
        // 127.0.0.1 is not localhost (R-URL-4).
        assert!(url("http://127.0.0.1/").is_ok());
    }

    #[test]
    fn url_length_counts_code_points_after_trim() {
        let prefix = "https://example.com/";
        let exact = format!("{prefix}{}", "a".repeat(2048 - prefix.len()));
        assert!(url(&exact).is_ok());
        assert!(url(&format!("{exact}a")).is_err());
        // Whitespace is trimmed before counting; a vertical tab is not whitespace and is counted.
        assert!(url(&format!("  {exact}  ")).is_ok());
        assert!(url(&format!("\u{000B}{exact}")).is_err());
        // Multi-byte characters count once each.
        let wide = format!("{prefix}{}", "é".repeat(2048 - prefix.len()));
        assert!(url(&wide).is_ok());
    }

    #[test]
    fn alias_rules() {
        for ok in ["abc", "A-b_9", &"a".repeat(32)] {
            assert!(validate_alias(ok).is_ok(), "{ok}");
        }
        for bad in [
            "ab",
            &"a".repeat(33),
            "abc\n",
            "   ",
            "a b",
            "ünï",
            "a.b",
            "a/b",
        ] {
            assert!(
                matches!(validate_alias(bad), Err(ApiError::InvalidAlias)),
                "{bad:?}"
            );
        }
        for reserved in [
            "api", "API", "Healthz", "docs", "admin", "static", "assets", "login", "LogOut",
        ] {
            assert!(
                matches!(validate_alias(reserved), Err(ApiError::AliasReserved)),
                "{reserved}"
            );
        }
    }

    #[test]
    fn generated_codes_look_right() {
        for _ in 0..1000 {
            let c = generate_code();
            assert_eq!(c.len(), 7);
            assert!(c.bytes().all(|b| b.is_ascii_alphanumeric()));
            assert!(!is_reserved(&c));
        }
    }

    fn parse(body: &str) -> Result<CreateRequest, ApiError> {
        parse_create_request(body.as_bytes(), HOST)
    }

    #[test]
    fn body_rules() {
        assert!(parse(r#"{"url":"https://example.com","alias":null,"extra":1}"#).is_ok());
        assert!(
            parse(r#"{"url":"https://example.com","alias":""}"#)
                .unwrap()
                .alias
                .is_none()
        );
        // Duplicate keys: last wins.
        let r = parse(r#"{"url":"nope","url":"https://example.com"}"#).unwrap();
        assert_eq!(r.url, "https://example.com/");
        for bad in [
            "",
            "[]",
            "null",
            "\"x\"",
            "{",
            r#"{"alias":"abc"}"#,
            r#"{"url":null}"#,
            r#"{"url":5}"#,
            r#"{"url":"https://example.com","alias":5}"#,
            r#"{"url":"\ud800"}"#,
        ] {
            assert!(
                matches!(parse(bad), Err(ApiError::BadRequest(_))),
                "{bad:?}"
            );
        }
        assert!(matches!(
            parse_create_request(b"{\"url\":\"\xff\"}", HOST),
            Err(ApiError::BadRequest(_))
        ));
        // Content errors are never 400, and the URL is checked before the alias.
        assert!(matches!(
            parse(r#"{"url":"","alias":"x"}"#),
            Err(ApiError::InvalidUrl)
        ));
        assert!(matches!(
            parse(r#"{"url":"https://example.com","alias":"  "}"#),
            Err(ApiError::InvalidAlias)
        ));
        assert!(matches!(
            parse(r#"{"url":"https://example.com","alias":"api"}"#),
            Err(ApiError::AliasReserved)
        ));
    }

    #[test]
    fn body_size_limit() {
        let pad = |n: usize| {
            let head = r#"{"url":"https://example.com/","p":""#;
            let tail = r#""}"#;
            format!("{head}{}{tail}", "x".repeat(n - head.len() - tail.len()))
        };
        assert!(parse(&pad(MAX_BODY_BYTES)).is_ok());
        assert!(matches!(
            parse(&pad(MAX_BODY_BYTES + 1)),
            Err(ApiError::BadRequest(_))
        ));
    }

    #[test]
    fn time_format() {
        let t = DateTime::parse_from_rfc3339("2026-10-17T15:04:05.120Z")
            .unwrap()
            .to_utc();
        assert_eq!(format_time(t), "2026-10-17T15:04:05.120Z");
        let t = DateTime::parse_from_rfc3339("2026-10-17T15:04:05Z")
            .unwrap()
            .to_utc();
        assert_eq!(format_time(t), "2026-10-17T15:04:05Z");
    }
}
