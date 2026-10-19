//! Integration tests: the real router against a throwaway Postgres database per test (`#[sqlx::test]`).
//! These are for the implementer's confidence; the independent harness is the acceptance evidence.

use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::body::Body;
use axum::http::{Method, Request, StatusCode, header};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use shortlink_api::app::{AppState, router};
use shortlink_api::config::Config;
use sqlx::PgPool;
use tower::ServiceExt;

fn app(pool: PgPool) -> Router {
    let config =
        Config::build(String::new(), 8080, "http://localhost:8080", "cf-ipcountry").unwrap();
    router(Arc::new(AppState { pool, config }))
}

struct Reply {
    status: StatusCode,
    headers: axum::http::HeaderMap,
    body: Vec<u8>,
}

impl Reply {
    fn json(&self) -> Value {
        serde_json::from_slice(&self.body).expect("json body")
    }
}

async fn send(
    app: &Router,
    method: Method,
    uri: &str,
    headers: &[(&str, &str)],
    body: &str,
) -> Reply {
    let mut req = Request::builder().method(method).uri(uri);
    for (k, v) in headers {
        req = req.header(*k, *v);
    }
    let res = app
        .clone()
        .oneshot(req.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let (parts, body) = res.into_parts();
    Reply {
        status: parts.status,
        headers: parts.headers,
        body: body.collect().await.unwrap().to_bytes().to_vec(),
    }
}

async fn create(app: &Router, body: Value) -> Reply {
    send(app, Method::POST, "/api/links", &[], &body.to_string()).await
}

async fn click_count(pool: &PgPool, code: &str) -> i64 {
    sqlx::query_scalar(
        "SELECT count(*) FROM clicks c JOIN links l ON l.id = c.link_id WHERE l.code = $1",
    )
    .bind(code)
    .fetch_one(pool)
    .await
    .unwrap()
}

/// Waits (up to 2 s) for the background click insert, like a client polling R-REDIR-4.
async fn wait_for_clicks(pool: &PgPool, code: &str, want: i64) {
    for _ in 0..40 {
        if click_count(pool, code).await == want {
            return;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert_eq!(click_count(pool, code).await, want);
}

#[sqlx::test]
async fn create_get_redirect_and_delete(pool: PgPool) {
    let app = app(pool.clone());
    let r = create(
        &app,
        json!({"url": "HTTPS://Example.COM:443/a/../b", "alias": "my-link"}),
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED);
    let link = r.json();
    assert_eq!(link["code"], "my-link");
    assert_eq!(link["url"], "https://example.com/b");
    assert_eq!(link["shortUrl"], "http://localhost:8080/my-link");
    assert_eq!(link["isCustom"], true);
    assert_eq!(link["clickCount"], 0);
    assert!(link["lastClickedAt"].is_null());

    let r = send(
        &app,
        Method::GET,
        "/my-link?ignored=1",
        &[
            ("user-agent", "Mozilla/5.0 (iPhone)"),
            ("cf-ipcountry", "gb"),
            ("referer", "https://www.news.example/x"),
        ],
        "",
    )
    .await;
    assert_eq!(r.status, StatusCode::FOUND);
    assert_eq!(r.headers[header::LOCATION], "https://example.com/b");
    assert_eq!(r.headers[header::CACHE_CONTROL], "no-store");
    wait_for_clicks(&pool, "my-link", 1).await;
    let row: (Option<String>, Option<String>, String) =
        sqlx::query_as("SELECT referrer_host, country::text, device FROM clicks")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        row,
        (
            Some("news.example".into()),
            Some("GB".into()),
            "mobile".into()
        )
    );

    let r = send(&app, Method::GET, "/api/links/my-link", &[], "").await;
    assert_eq!(r.json()["clickCount"], 1);
    assert!(r.json()["lastClickedAt"].is_string());

    assert_eq!(
        send(&app, Method::DELETE, "/api/links/my-link", &[], "")
            .await
            .status,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        send(&app, Method::DELETE, "/api/links/my-link", &[], "")
            .await
            .status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        send(&app, Method::GET, "/my-link", &[], "").await.status,
        StatusCode::NOT_FOUND
    );
    assert_eq!(click_count(&pool, "my-link").await, 0, "clicks cascade");
}

#[sqlx::test]
async fn head_records_no_click_and_percent_decoding(pool: PgPool) {
    let app = app(pool.clone());
    create(
        &app,
        json!({"url": "https://example.com/", "alias": "pct-x"}),
    )
    .await;
    let head = send(&app, Method::HEAD, "/pct%2Dx", &[], "").await;
    assert_eq!(head.status, StatusCode::FOUND);
    assert!(head.body.is_empty());
    let get = send(&app, Method::GET, "/pct%2Dx", &[], "").await;
    assert_eq!(get.status, StatusCode::FOUND);
    wait_for_clicks(&pool, "pct-x", 1).await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(click_count(&pool, "pct-x").await, 1);
}

#[sqlx::test]
async fn alias_errors_and_precedence(pool: PgPool) {
    let app = app(pool);
    assert_eq!(
        create(
            &app,
            json!({"url": "https://example.com", "alias": "taken"})
        )
        .await
        .status,
        StatusCode::CREATED
    );
    let r = create(
        &app,
        json!({"url": "https://example.com", "alias": "taken"}),
    )
    .await;
    assert_eq!(
        (r.status, r.json()["error"]["code"].clone()),
        (StatusCode::CONFLICT, json!("alias_taken"))
    );
    // Case-sensitive codes.
    assert_eq!(
        create(
            &app,
            json!({"url": "https://example.com", "alias": "Taken"})
        )
        .await
        .status,
        StatusCode::CREATED
    );
    let r = create(
        &app,
        json!({"url": "https://example.com", "alias": "LOGIN"}),
    )
    .await;
    assert_eq!(r.json()["error"]["code"], "alias_reserved");
    let r = create(&app, json!({"url": "nope", "alias": "x"})).await;
    assert_eq!(r.json()["error"]["code"], "invalid_url");
    let r = create(&app, json!({"url": "https://localhost:3000/x"})).await;
    assert_eq!(r.json()["error"]["code"], "invalid_url");
    let r = send(
        &app,
        Method::POST,
        "/api/links",
        &[("content-type", "text/plain")],
        r#"{"url":"https://example.com"}"#,
    )
    .await;
    assert_eq!(r.status, StatusCode::CREATED, "Content-Type is ignored");
    let r = send(&app, Method::POST, "/api/links", &[], "{nope").await;
    assert_eq!(
        (r.status, r.json()["error"]["code"].clone()),
        (StatusCode::BAD_REQUEST, json!("bad_request"))
    );
}

#[sqlx::test]
async fn concurrent_alias_creates_have_one_winner(pool: PgPool) {
    let app = app(pool);
    let mut tasks = Vec::new();
    for i in 0..20 {
        let app = app.clone();
        tasks.push(tokio::spawn(async move {
            create(
                &app,
                json!({"url": format!("https://example.com/{i}"), "alias": "race-me"}),
            )
            .await
            .status
        }));
    }
    let mut statuses = Vec::new();
    for t in tasks {
        statuses.push(t.await.unwrap());
    }
    assert_eq!(
        statuses
            .iter()
            .filter(|s| **s == StatusCode::CREATED)
            .count(),
        1
    );
    assert_eq!(
        statuses
            .iter()
            .filter(|s| **s == StatusCode::CONFLICT)
            .count(),
        19
    );
}

#[sqlx::test]
async fn routing_and_methods(pool: PgPool) {
    let app = app(pool);
    create(
        &app,
        json!({"url": "https://example.com/", "alias": "real"}),
    )
    .await;

    for path in [
        "/",
        "/real/",
        "/./real",
        "/%2e%2E/real",
        "/a//b",
        "/real%",
        "/api/",
        "/healthz/",
    ] {
        let r = send(&app, Method::GET, path, &[], "").await;
        assert_eq!(r.status, StatusCode::NOT_FOUND, "{path}");
        assert!(
            r.headers[header::CONTENT_TYPE]
                .to_str()
                .unwrap()
                .starts_with("text/plain"),
            "{path}"
        );
    }
    for path in [
        "/api/links/",
        "/api/nope",
        "/api/links/%2e",
        "/api/links//stats",
        "/api/links/real/",
    ] {
        let r = send(&app, Method::PUT, path, &[], "").await;
        assert_eq!(
            (r.status, r.json()["error"]["code"].clone()),
            (StatusCode::NOT_FOUND, json!("not_found")),
            "{path}"
        );
    }
    let r = send(&app, Method::PUT, "/api/links/whatever", &[], "").await;
    assert_eq!(r.status, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(r.headers[header::ALLOW], "GET, HEAD, DELETE");
    assert_eq!(r.json()["error"]["code"], "method_not_allowed");
    let r = send(&app, Method::OPTIONS, "/real", &[], "").await;
    assert_eq!(r.status, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(r.headers[header::ALLOW], "GET, HEAD");
    assert!(
        r.headers[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/plain")
    );
    assert_eq!(
        send(&app, Method::POST, "/healthz", &[], "").await.status,
        StatusCode::METHOD_NOT_ALLOWED
    );
    assert_eq!(
        send(&app, Method::HEAD, "/healthz", &[], "").await.status,
        StatusCode::OK
    );
    // %2F does not split a segment.
    assert_eq!(
        send(&app, Method::PUT, "/a%2Fb", &[], "").await.status,
        StatusCode::METHOD_NOT_ALLOWED
    );
    assert_eq!(
        send(&app, Method::GET, "/a%2Fb", &[], "").await.status,
        StatusCode::NOT_FOUND
    );
    // Method check comes before the code lookup, and query validation before the code lookup.
    let r = send(
        &app,
        Method::GET,
        "/api/links/missing/stats?days=0",
        &[],
        "",
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
    let r = send(
        &app,
        Method::GET,
        "/api/links/missing/stats?days=7",
        &[],
        "",
    )
    .await;
    assert_eq!(r.status, StatusCode::NOT_FOUND);
}

#[sqlx::test]
async fn list_pagination_and_validation(pool: PgPool) {
    let app = app(pool);
    for i in 0..5 {
        create(&app, json!({"url": format!("https://example.com/{i}")})).await;
    }
    let r = send(&app, Method::GET, "/api/links?limit=2&offset=1", &[], "").await;
    let page = r.json();
    assert_eq!(
        (
            page["total"].clone(),
            page["limit"].clone(),
            page["offset"].clone()
        ),
        (json!(5), json!(2), json!(1))
    );
    assert_eq!(page["items"].as_array().unwrap().len(), 2);
    assert_eq!(page["items"][0]["url"], "https://example.com/3");
    let r = send(&app, Method::GET, "/api/links?offset=99", &[], "").await;
    assert_eq!(r.json()["items"], json!([]));
    for bad in [
        "limit=0",
        "limit=101",
        "limit=1&limit=2",
        "limit=+5",
        "limit=05",
        "offset=-1",
        "limit=",
        "limit=%FF",
    ] {
        let r = send(&app, Method::GET, &format!("/api/links?{bad}"), &[], "").await;
        assert_eq!(r.status, StatusCode::BAD_REQUEST, "{bad}");
    }
    // Undefined parameters are ignored, and limit/offset are not validated on other endpoints.
    assert_eq!(
        send(&app, Method::GET, "/api/links?foo=1", &[], "")
            .await
            .status,
        StatusCode::OK
    );
    assert_eq!(
        send(&app, Method::GET, "/healthz?limit=0", &[], "")
            .await
            .status,
        StatusCode::OK
    );
}

#[sqlx::test]
async fn stats_window_and_breakdowns(pool: PgPool) {
    let app = app(pool.clone());
    create(
        &app,
        json!({"url": "https://example.com/", "alias": "stat-me"}),
    )
    .await;
    // Seed rows around the UTC day boundaries, anchored on the database's "today".
    sqlx::query(
        r#"WITH t AS (SELECT (now() AT TIME ZONE 'UTC')::date AS d), l AS (SELECT id FROM links WHERE code = 'stat-me')
           INSERT INTO clicks (link_id, clicked_at, referrer_host, country, device)
           SELECT l.id, ts, ref, cc, dev FROM l, t, LATERAL (VALUES
             ((t.d::timestamp AT TIME ZONE 'UTC'), NULL::text, 'US'::char(2), 'desktop'),
             ((t.d::timestamp AT TIME ZONE 'UTC'), 'a.io', 'US', 'mobile'),
             ((t.d::timestamp AT TIME ZONE 'UTC') - interval '1 microsecond', 'a.io', NULL, 'bot'),
             ((t.d::timestamp AT TIME ZONE 'UTC') - interval '2 days', 'b.io', 'GB', 'desktop'),
             ((t.d::timestamp AT TIME ZONE 'UTC') - interval '10 days', 'old.io', 'FR', 'tablet')
           ) AS v(ts, ref, cc, dev)"#,
    )
    .execute(&pool)
    .await
    .unwrap();

    let r = send(
        &app,
        Method::GET,
        "/api/links/stat-me/stats?days=3",
        &[],
        "",
    )
    .await;
    assert_eq!(r.status, StatusCode::OK);
    let s = r.json();
    assert_eq!(
        (
            s["code"].clone(),
            s["days"].clone(),
            s["totalClicks"].clone(),
            s["rangeClicks"].clone()
        ),
        (json!("stat-me"), json!(3), json!(5), json!(4))
    );
    let clicks: Vec<i64> = s["daily"]
        .as_array()
        .unwrap()
        .iter()
        .map(|d| d["clicks"].as_i64().unwrap())
        .collect();
    assert_eq!(
        clicks,
        vec![1, 1, 2],
        "oldest first; the 1 microsecond before midnight counts for yesterday"
    );
    assert_eq!(
        s["topReferrers"],
        json!([{"name": "a.io", "clicks": 2}, {"name": "b.io", "clicks": 1}, {"name": "direct", "clicks": 1}])
    );
    assert_eq!(
        s["topCountries"],
        json!([{"name": "US", "clicks": 2}, {"name": "GB", "clicks": 1}, {"name": "unknown", "clicks": 1}])
    );
    assert_eq!(
        s["devices"],
        json!([{"name": "desktop", "clicks": 2}, {"name": "bot", "clicks": 1}, {"name": "mobile", "clicks": 1}])
    );

    let r = send(&app, Method::GET, "/api/links/stat-me/stats", &[], "").await;
    assert_eq!(r.json()["daily"].as_array().unwrap().len(), 30);
    let r = send(
        &app,
        Method::GET,
        "/api/links/stat-me/stats?days=366",
        &[],
        "",
    )
    .await;
    assert_eq!(r.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test]
async fn health_ok(pool: PgPool) {
    let app = app(pool);
    let r = send(&app, Method::GET, "/healthz", &[], "").await;
    assert_eq!(
        (r.status, r.json()),
        (StatusCode::OK, json!({"status": "ok"}))
    );
}
