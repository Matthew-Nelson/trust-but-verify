//! `GET /api/links/{code}/stats`: click analytics computed from the `clicks` rows on every request.
//! "Today" and the window come from the database clock, in UTC.

use std::collections::HashMap;

use axum::http::StatusCode;
use axum::response::Response;
use chrono::{Duration, NaiveDate};
use serde::Serialize;

use crate::app::{AppState, json_response};
use crate::error::ApiError;
use crate::query::integer_param;

#[derive(Serialize)]
struct DailyClicks {
    date: String,
    clicks: i64,
}

#[derive(Serialize)]
struct Breakdown {
    name: String,
    clicks: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkStats {
    code: String,
    days: i64,
    total_clicks: i64,
    range_clicks: i64,
    daily: Vec<DailyClicks>,
    top_referrers: Vec<Breakdown>,
    top_countries: Vec<Breakdown>,
    devices: Vec<Breakdown>,
}

pub async fn stats(
    state: &AppState,
    code: Option<String>,
    query: Option<&str>,
) -> Result<Response, ApiError> {
    // Query validation runs before the code lookup (R-ERR-3, R-ERR-6).
    let days = integer_param(query, "days", 1, 365, 30)?;
    let Some(code) = code else {
        return Err(ApiError::NotFound);
    };

    // One repeatable-read transaction: `now()` is fixed and every query sees the same rows.
    let mut tx = state.pool.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        .execute(&mut *tx)
        .await?;

    let link = sqlx::query!("SELECT id, code FROM links WHERE code = $1", code)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(ApiError::NotFound)?;

    let today: NaiveDate =
        sqlx::query_scalar!(r#"SELECT (now() AT TIME ZONE 'UTC')::date AS "today!""#)
            .fetch_one(&mut *tx)
            .await?;

    let total_clicks = sqlx::query_scalar!(
        r#"SELECT count(*) AS "n!" FROM clicks WHERE link_id = $1"#,
        link.id
    )
    .fetch_one(&mut *tx)
    .await?;

    // Window: [00:00:00Z of (today - days + 1), 00:00:00Z of the day after today).
    let day_counts = sqlx::query!(
        r#"SELECT (clicked_at AT TIME ZONE 'UTC')::date AS "day!", count(*) AS "clicks!"
           FROM clicks
           WHERE link_id = $1
             AND clicked_at >= (((now() AT TIME ZONE 'UTC')::date - ($2::int - 1))::timestamp AT TIME ZONE 'UTC')
             AND clicked_at <  (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC')
           GROUP BY 1"#,
        link.id,
        days as i32
    )
    .fetch_all(&mut *tx)
    .await?;
    let by_day: HashMap<NaiveDate, i64> =
        day_counts.into_iter().map(|r| (r.day, r.clicks)).collect();
    let daily: Vec<DailyClicks> = (0..days)
        .map(|i| {
            let date = today - Duration::days(days - 1 - i);
            DailyClicks {
                date: date.format("%Y-%m-%d").to_string(),
                clicks: by_day.get(&date).copied().unwrap_or(0),
            }
        })
        .collect();
    let range_clicks = daily.iter().map(|d| d.clicks).sum();

    let top_referrers = sqlx::query!(
        r#"SELECT name AS "name!", clicks AS "clicks!" FROM (
               SELECT COALESCE(referrer_host, 'direct') AS name, count(*) AS clicks
               FROM clicks
               WHERE link_id = $1
                 AND clicked_at >= (((now() AT TIME ZONE 'UTC')::date - ($2::int - 1))::timestamp AT TIME ZONE 'UTC')
                 AND clicked_at <  (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC')
               GROUP BY 1) t
           ORDER BY clicks DESC, name COLLATE "C" ASC LIMIT 5"#,
        link.id,
        days as i32
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|r| Breakdown { name: r.name, clicks: r.clicks })
    .collect();

    let top_countries = sqlx::query!(
        r#"SELECT name AS "name!", clicks AS "clicks!" FROM (
               SELECT COALESCE(country::text, 'unknown') AS name, count(*) AS clicks
               FROM clicks
               WHERE link_id = $1
                 AND clicked_at >= (((now() AT TIME ZONE 'UTC')::date - ($2::int - 1))::timestamp AT TIME ZONE 'UTC')
                 AND clicked_at <  (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC')
               GROUP BY 1) t
           ORDER BY clicks DESC, name COLLATE "C" ASC LIMIT 5"#,
        link.id,
        days as i32
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|r| Breakdown { name: r.name, clicks: r.clicks })
    .collect();

    let devices = sqlx::query!(
        r#"SELECT name AS "name!", clicks AS "clicks!" FROM (
               SELECT device AS name, count(*) AS clicks
               FROM clicks
               WHERE link_id = $1
                 AND clicked_at >= (((now() AT TIME ZONE 'UTC')::date - ($2::int - 1))::timestamp AT TIME ZONE 'UTC')
                 AND clicked_at <  (((now() AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC')
               GROUP BY 1) t
           ORDER BY clicks DESC, name COLLATE "C" ASC"#,
        link.id,
        days as i32
    )
    .fetch_all(&mut *tx)
    .await?
    .into_iter()
    .map(|r| Breakdown { name: r.name, clicks: r.clicks })
    .collect();

    tx.commit().await?;

    let body = LinkStats {
        code: link.code,
        days,
        total_clicks,
        range_clicks,
        daily,
        top_referrers,
        top_countries,
        devices,
    };
    Ok(json_response(StatusCode::OK, &body))
}
