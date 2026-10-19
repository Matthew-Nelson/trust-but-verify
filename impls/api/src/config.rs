//! Settings read from environment variables (SPEC "Configuration").

use axum::http::HeaderName;
use url::Url;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    /// `PUBLIC_BASE_URL` with any trailing slash removed.
    pub public_base_url: String,
    /// Hostname of `PUBLIC_BASE_URL`, used to reject self-referencing URLs (R-URL-4).
    pub public_hostname: String,
    pub country_header: HeaderName,
}

impl Config {
    pub fn from_env() -> Result<Config, String> {
        let database_url = std::env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is required")?;
        let port = match std::env::var("PORT") {
            Ok(p) => p
                .trim()
                .parse::<u16>()
                .map_err(|_| "PORT must be a port number")?,
            Err(_) => 8080,
        };
        let base =
            std::env::var("PUBLIC_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".into());
        let country = std::env::var("COUNTRY_HEADER").unwrap_or_else(|_| "cf-ipcountry".into());
        Config::build(database_url, port, &base, &country)
    }

    pub fn build(
        database_url: String,
        port: u16,
        public_base_url: &str,
        country_header: &str,
    ) -> Result<Config, String> {
        let public_base_url = public_base_url.trim().trim_end_matches('/').to_string();
        let parsed =
            Url::parse(&public_base_url).map_err(|_| "PUBLIC_BASE_URL is not a valid URL")?;
        let public_hostname = parsed
            .host_str()
            .ok_or("PUBLIC_BASE_URL has no host")?
            .to_string();
        // HeaderName::from_bytes lowercases nothing itself, so lowercase first (names are case-insensitive).
        let country_header =
            HeaderName::from_bytes(country_header.trim().to_ascii_lowercase().as_bytes())
                .map_err(|_| "COUNTRY_HEADER is not a valid header name")?;
        Ok(Config {
            database_url,
            port,
            public_base_url,
            public_hostname,
            country_header,
        })
    }
}
