# Holdout seal

The holdout suite is kept **outside this repo** until the implementation is frozen (`impl-v1`), so implementers can't tune their code to it. To prove it wasn't changed after the implementation existed, its hash is committed here *before* any implementation work begins.

## Seals

| # | Date | Contents | Files | SHA-256 seal |
|---|---|---|---|---|
| 1 | 2026-10-17 | Holdout suite as delivered by harness run 4, its self-check results, and the unredacted `SELF_CHECK.md` | 19 | `9c8687b8eeb4c1fc6691eee50dfe3a6af8f68319181d3349faf9e4e6af3cb34e` |
| 2 | 2026-10-18 | Holdout as updated by harness run 5 for `spec-v1.1` (3 tests added, 1 changed for HP-10), its run-5 self-check results, and the unredacted `SELF_CHECK.md`. Superseded by seal 3. Seal 1's bundle is kept unchanged, so both can be verified at reveal and the run-5 changes diffed. | 22 | `b294af81b69c343168c42c4a72fecbda5fc5321125cb1b9003263856257e525e` |
| 3 | 2026-10-18 | Holdout as updated by harness run 6 after the harness review (1 test added; 3 changed: an instant comparison, a midnight retry and an R-UI-12 wait), its run-6 self-check results, and the unredacted `SELF_CHECK.md`. Run 7 did not touch the holdout. **Supersedes seals 1 and 2.** Earlier bundles are kept unchanged. | 24 | `a2eeef3089c91d642171e33e62e59ed607684645cc1caad9a2e68fe9fb3b11e7` |

## How to verify at reveal

From the root of the revealed bundle:

1. List every file except `node_modules/`, sorted by POSIX path.
2. For each file, write a line `<sha256 of contents><two spaces><relative POSIX path>` followed by `\n`.
3. The SHA-256 of the concatenated lines must equal the seal above.

```python
import hashlib, pathlib
files = sorted(p for p in pathlib.Path(".").rglob("*") if p.is_file() and "node_modules" not in p.parts)
m = "".join(f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.as_posix()}\n" for p in files)
print(hashlib.sha256(m.encode()).hexdigest())
```

At reveal, every bundle is published: seal 1's (19 files), seal 2's (22) and seal 3's (24), so each set of changes can be diffed. When each new seal was made, the coordinator re-hashed every earlier bundle, and all of them still matched.

If the holdout has to change before `impl-v1` (for example, in response to a spec amendment), a new row is added with the reason. The seal in force when implementation starts is the one that counts.

## Redaction

`harness/SELF_CHECK.md` in this repo has one table row redacted: it named three holdout test areas. The unredacted file is in the sealed bundle as `SELF_CHECK.unredacted.md`.
