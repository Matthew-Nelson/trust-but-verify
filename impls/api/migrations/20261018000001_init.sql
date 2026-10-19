-- Schema from SPEC "Data model". Gray-box tests depend on it exactly.
CREATE TABLE links (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code       TEXT UNIQUE NOT NULL,
    url        TEXT NOT NULL,
    is_custom  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clicks (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    link_id       BIGINT NOT NULL REFERENCES links (id) ON DELETE CASCADE,
    clicked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    referrer_host TEXT,
    country       CHAR(2),
    device        TEXT NOT NULL CHECK (device IN ('desktop', 'mobile', 'tablet', 'bot', 'unknown'))
);

CREATE INDEX clicks_link_id_clicked_at_idx ON clicks (link_id, clicked_at);
