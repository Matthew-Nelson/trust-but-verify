//! Raw path and query-string parsing. Axum's `Query`/`Path` extractors differ from SPEC
//! (they turn `+` into a space, accept leading zeros, and allow repeated parameters),
//! so this module follows the SPEC "Query integer" definition by hand.

use crate::error::ApiError;

fn hex_value(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// True if every `%` in `s` is followed by two hex digits.
pub fn escapes_are_well_formed(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let complete = i + 2 < b.len();
            if !complete || hex_value(b[i + 1]).is_none() || hex_value(b[i + 2]).is_none() {
                return false;
            }
            i += 3;
        } else {
            i += 1;
        }
    }
    true
}

/// Percent-decodes once. `+` stays a plus. A malformed escape is kept literally.
/// Returns raw bytes, since the result need not be valid UTF-8.
pub fn percent_decode(s: &str) -> Vec<u8> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%'
            && i + 2 < b.len()
            && let (Some(h), Some(l)) = (hex_value(b[i + 1]), hex_value(b[i + 2]))
        {
            out.push(h * 16 + l);
            i += 3;
            continue;
        }
        out.push(b[i]);
        i += 1;
    }
    out
}

/// Decodes a path segment into a code. `None` means the bytes are not valid UTF-8
/// (or hold a NUL, which Postgres text cannot store), so no link can have that code.
pub fn decode_code(segment: &str) -> Option<String> {
    let s = String::from_utf8(percent_decode(segment)).ok()?;
    if s.contains('\0') { None } else { Some(s) }
}

/// A SPEC "query integer": `^(0|[1-9][0-9]*)$` that fits in a signed 64-bit integer.
pub fn parse_query_integer(value: &str) -> Option<i64> {
    let ok = value == "0"
        || (value
            .as_bytes()
            .first()
            .is_some_and(|b| (b'1'..=b'9').contains(b))
            && value.bytes().all(|b| b.is_ascii_digit()));
    if !ok {
        return None;
    }
    value.parse::<i64>().ok()
}

/// Reads one optional integer parameter from a raw query string and checks its range.
/// Absent -> `default`. Repeated, malformed or out-of-range -> 400.
pub fn integer_param(
    query: Option<&str>,
    name: &str,
    min: i64,
    max: i64,
    default: i64,
) -> Result<i64, ApiError> {
    let mut found: Option<&str> = None;
    let mut count = 0;
    for pair in query.unwrap_or("").split('&') {
        if pair.is_empty() {
            continue;
        }
        let (raw_name, raw_value) = pair.split_once('=').unwrap_or((pair, ""));
        if percent_decode(raw_name) == name.as_bytes() {
            count += 1;
            found = Some(raw_value);
        }
    }
    let Some(raw_value) = found else {
        return Ok(default);
    };
    if count > 1 {
        return Err(bad_param());
    }
    let decoded = String::from_utf8(percent_decode(raw_value)).map_err(|_| bad_param())?;
    match parse_query_integer(&decoded) {
        Some(n) if (min..=max).contains(&n) => Ok(n),
        _ => Err(bad_param()),
    }
}

fn bad_param() -> ApiError {
    ApiError::BadRequest("A query parameter is invalid.")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn query_integers() {
        assert_eq!(parse_query_integer("0"), Some(0));
        assert_eq!(parse_query_integer("20"), Some(20));
        for bad in [
            "",
            "01",
            "+1",
            "-1",
            "1.0",
            "1e2",
            " 1",
            "9223372036854775808",
            "٣",
        ] {
            assert_eq!(parse_query_integer(bad), None, "{bad:?}");
        }
        assert_eq!(parse_query_integer("9223372036854775807"), Some(i64::MAX));
    }

    #[test]
    fn integer_param_rules() {
        assert_eq!(integer_param(None, "limit", 1, 100, 20).unwrap(), 20);
        assert_eq!(
            integer_param(Some("limit=5"), "limit", 1, 100, 20).unwrap(),
            5
        );
        assert_eq!(
            integer_param(Some("x=1&limit=%35"), "limit", 1, 100, 20).unwrap(),
            5
        );
        assert_eq!(
            integer_param(Some("%6Cimit=7"), "limit", 1, 100, 20).unwrap(),
            7
        );
        for bad in [
            "limit=",
            "limit",
            "limit=0",
            "limit=101",
            "limit=+5",
            "limit=05",
            "limit=1&limit=2",
            "limit=%FF",
            "limit=%2B5",
        ] {
            assert!(
                integer_param(Some(bad), "limit", 1, 100, 20).is_err(),
                "{bad}"
            );
        }
        assert_eq!(
            integer_param(Some("offset=0"), "offset", 0, i64::MAX, 0).unwrap(),
            0
        );
        assert!(
            integer_param(Some("offset=9223372036854775808"), "offset", 0, i64::MAX, 0).is_err()
        );
        // Undefined parameters are ignored.
        assert_eq!(
            integer_param(Some("foo=bar&foo=baz"), "limit", 1, 100, 20).unwrap(),
            20
        );
    }

    #[test]
    fn decoding() {
        assert_eq!(decode_code("pct%2Dx").as_deref(), Some("pct-x"));
        assert_eq!(decode_code("a+b").as_deref(), Some("a+b"));
        assert_eq!(decode_code("%FF"), None);
        assert_eq!(decode_code("a%00"), None);
        assert_eq!(decode_code("%2541").as_deref(), Some("%41"));
        assert!(escapes_are_well_formed("abc%2f"));
        assert!(!escapes_are_well_formed("abc%2"));
        assert!(!escapes_are_well_formed("%zz"));
        assert!(!escapes_are_well_formed("%"));
    }
}
