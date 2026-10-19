//! Shortlink API library: everything except process startup, so tests can build the app.
#![forbid(unsafe_code)]

pub mod app;
pub mod config;
pub mod error;
pub mod links;
pub mod query;
pub mod redirect;
pub mod stats;
