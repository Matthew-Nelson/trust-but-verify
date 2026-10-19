//! `GET /{code}`: redirect to the stored URL and record a click in the background.
//! Also holds the header classification rules for what a click records (R-CLICK-1..3).

use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header};
use axum::response::Response;
use sqlx::PgPool;
use url::Url;

use crate::app::AppState;
use crate::error::ApiError;

// ------------------------------------------------------- click classification

/// The values stored for one click (R-DATA-2 encodings).
#[derive(Debug, PartialEq, Eq)]
pub struct ClickInfo {
    /// `None` means `direct`.
    pub referrer_host: Option<String>,
    /// `None` means `unknown`.
    pub country: Option<String>,
    pub device: &'static str,
}

pub fn classify(headers: &HeaderMap, country_header: &HeaderName) -> ClickInfo {
    ClickInfo {
        referrer_host: referrer_host(headers),
        country: country(headers, country_header),
        device: device(headers),
    }
}

/// R-CLICK-1. One `Referer` header that parses as an http(s) URL with a host.
fn referrer_host(headers: &HeaderMap) -> Option<String> {
    let mut values = headers.get_all(header::REFERER).iter();
    let (Some(value), None) = (values.next(), values.next()) else {
        return None;
    };
    let text = std::str::from_utf8(value.as_bytes()).ok()?;
    let parsed = Url::parse(text).ok()?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str().filter(|h| !h.is_empty())?;
    let host = match host.strip_prefix("www.") {
        Some(rest) if !rest.is_empty() => rest,
        _ => host,
    };
    // The literal host "direct" would be ambiguous with no referrer, so it is stored as NULL too.
    if host == "direct" {
        return None;
    }
    Some(host.to_string())
}

/// R-CLICK-2. Exactly one header, trimmed of spaces and tabs, two ASCII letters.
fn country(headers: &HeaderMap, name: &HeaderName) -> Option<String> {
    let mut values = headers.get_all(name).iter();
    let (Some(value), None) = (values.next(), values.next()) else {
        return None;
    };
    let text = std::str::from_utf8(value.as_bytes()).ok()?;
    let text = text.trim_matches(|c| c == ' ' || c == '\t');
    if text.len() == 2 && text.bytes().all(|b| b.is_ascii_alphabetic()) {
        Some(text.to_ascii_uppercase())
    } else {
        None
    }
}

/// R-CLICK-3. First matching rule wins, case-insensitive.
fn device(headers: &HeaderMap) -> &'static str {
    let Some(value) = headers.get(header::USER_AGENT) else {
        return "unknown";
    };
    device_from_user_agent(&String::from_utf8_lossy(value.as_bytes()))
}

pub fn device_from_user_agent(ua: &str) -> &'static str {
    if ua
        .trim_matches(|c: char| c.is_ascii_whitespace())
        .is_empty()
    {
        return "unknown";
    }
    let ua = ua.to_ascii_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| ua.contains(w));
    if has(&["bot", "crawl", "spider", "preview", "facebookexternalhit"]) {
        "bot"
    } else if has(&["ipad", "tablet"]) {
        "tablet"
    } else if has(&["mobi", "iphone", "android"]) {
        "mobile"
    } else {
        "desktop"
    }
}

// -------------------------------------------------------------------- handler

/// `should_record` is false for HEAD (R-REDIR-7).
pub async fn follow(
    state: &AppState,
    code: Option<String>,
    headers: &HeaderMap,
    should_record: bool,
) -> Result<Response, ApiError> {
    let Some(code) = code else {
        return Err(ApiError::PlainNotFound);
    };
    let link = sqlx::query!("SELECT id, url FROM links WHERE code = $1", code)
        .fetch_optional(&state.pool)
        .await?
        .ok_or(ApiError::PlainNotFound)?;

    let location = HeaderValue::from_str(&link.url)
        .map_err(|_| ApiError::Internal("stored url is not a valid header value".into()))?;

    if should_record {
        let info = classify(headers, &state.config.country_header);
        let pool = state.pool.clone();
        let link_id = link.id;
        // Fire and forget: the redirect never waits for, or depends on, the insert (R-REDIR-4/6).
        tokio::spawn(async move {
            if let Err(e) = record_click(&pool, link_id, &info).await {
                tracing::warn!(error = %e, "could not record click");
            }
        });
    }

    let mut res = Response::new(axum::body::Body::empty());
    *res.status_mut() = StatusCode::FOUND;
    res.headers_mut().insert(header::LOCATION, location);
    res.headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(res)
}

async fn record_click(pool: &PgPool, link_id: i64, info: &ClickInfo) -> Result<(), sqlx::Error> {
    sqlx::query!(
        "INSERT INTO clicks (link_id, referrer_host, country, device) VALUES ($1, $2, $3, $4)",
        link_id,
        info.referrer_host,
        info.country,
        info.device
    )
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HeaderMap {
        let mut h = HeaderMap::new();
        for (k, v) in pairs {
            h.append(
                HeaderName::from_bytes(k.as_bytes()).unwrap(),
                HeaderValue::from_str(v).unwrap(),
            );
        }
        h
    }

    fn referrer(v: &str) -> Option<String> {
        referrer_host(&headers(&[("referer", v)]))
    }

    #[test]
    fn referrer_rules() {
        assert_eq!(
            referrer("https://WWW.Example.com:8443/x").as_deref(),
            Some("example.com")
        );
        assert_eq!(
            referrer("https://www.www.a.io/").as_deref(),
            Some("www.a.io")
        );
        assert_eq!(referrer("http://www./").as_deref(), Some("www."));
        assert_eq!(referrer("example.com/page"), None);
        assert_eq!(referrer("android-app://com.slack/"), None);
        assert_eq!(referrer("ftp://example.com/"), None);
        assert_eq!(referrer(""), None);
        assert_eq!(referrer("https://direct/x"), None);
        assert_eq!(referrer("https://www.direct/x"), None);
        assert_eq!(referrer_host(&HeaderMap::new()), None);
        let twice = headers(&[("referer", "https://a.io/"), ("referer", "https://b.io/")]);
        assert_eq!(referrer_host(&twice), None);
        let mut bad = HeaderMap::new();
        bad.insert(
            header::REFERER,
            HeaderValue::from_bytes(b"https://a.io/\xff").unwrap(),
        );
        assert_eq!(referrer_host(&bad), None);
    }

    #[test]
    fn country_rules() {
        let name = HeaderName::from_static("cf-ipcountry");
        let c = |v: &str| country(&headers(&[("cf-ipcountry", v)]), &name);
        assert_eq!(c("us").as_deref(), Some("US"));
        assert_eq!(c(" \tXx\t ").as_deref(), Some("XX"));
        for bad in ["", "U", "USA", "U1", "ü", "u s", "1"] {
            assert_eq!(c(bad), None, "{bad:?}");
        }
        assert_eq!(country(&HeaderMap::new(), &name), None);
        let twice = headers(&[("cf-ipcountry", "US"), ("cf-ipcountry", "US")]);
        assert_eq!(country(&twice, &name), None);
    }

    #[test]
    fn device_rules() {
        assert_eq!(device_from_user_agent(""), "unknown");
        assert_eq!(device_from_user_agent(" \t "), "unknown");
        assert_eq!(device_from_user_agent("Googlebot/2.1"), "bot");
        assert_eq!(device_from_user_agent("Slack-ImgProxy link PREVIEW"), "bot");
        assert_eq!(device_from_user_agent("facebookexternalhit/1.1"), "bot");
        assert_eq!(
            device_from_user_agent("Mozilla/5.0 (iPad; CPU OS 17) Mobile/15E148"),
            "tablet"
        );
        assert_eq!(
            device_from_user_agent("Mozilla/5.0 (Linux; Android 14; SM-X) Tablet"),
            "tablet"
        );
        assert_eq!(
            device_from_user_agent("Mozilla/5.0 (iPhone; CPU iPhone OS 17)"),
            "mobile"
        );
        assert_eq!(
            device_from_user_agent("Mozilla/5.0 (Linux; Android 14) Mobile"),
            "mobile"
        );
        assert_eq!(
            device_from_user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X)"),
            "desktop"
        );
        // bot beats tablet and mobile because it is listed first.
        assert_eq!(device_from_user_agent("iPad crawler"), "bot");
    }
}
