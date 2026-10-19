"""Schemathesis hook module for the harness fuzz run (HP-25, spec-v1.4).

SPEC "Verification rules / Fuzzing": a 3xx is recorded and checked as the operation's response, never
followed and never counted as an error. This module does that in two layers:

1. ``before_call`` sends every generated request with ``allow_redirects=False``. A 302 from
   ``GET``/``HEAD /{code}`` is then validated against the schema (status, ``Location``, headers) like any
   other response.
2. A process-wide guard: ``requests.Session.resolve_redirects`` is replaced with one that yields nothing.
   Requests Schemathesis sends outside the hook path, such as its start-up probes (for example
   ``GET /schemathesis-probe%5C%1B%01``), still return the 3xx itself and never contact the
   ``Location`` host. Without this guard, a probe answered with a 302 was observed following it.

The CLI's ``--max-redirects 0`` is deliberately not used. In 4.29.1 it makes every 302 a
"TooManyRedirects" network error, even though nothing is followed.
"""

import requests
import schemathesis


def _never_follow(self, resp, req, **kwargs):  # noqa: ARG001 - same signature as requests'
    """Replacement for Session.resolve_redirects: no redirect is ever followed."""
    return iter(())


requests.Session.resolve_redirects = _never_follow


@schemathesis.hook
def before_call(context, case, kwargs):
    kwargs["allow_redirects"] = False
