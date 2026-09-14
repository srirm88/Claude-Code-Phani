# Windows development, AIX runtime

Code is authored in the ACE Toolkit on Windows and deployed to **AIX 7.3**.
Every difference between those two platforms is a defect waiting for promotion
day, and the Toolkit's local integration server will not catch any of it — it is
a Windows broker.

**"It works in my local integration server" is not evidence.** Treat it as a
syntax check, nothing more.

## Case sensitivity — the silent one

Windows filesystems are case-insensitive. AIX is case-sensitive. Anything that
resolves a name by path works on the developer's machine and fails on AIX:

- ESQL schema and module names vs the `.esql` file and folder names
- Java package declaration vs the directory structure
- Referenced jar filenames in shared-classes
- File node directory and file-name patterns
- DFDL and XSD schema file references
- BAR override keys — a key whose case does not match is silently ignored

The failure mode is the worst kind: no error on Windows, a
`ClassNotFoundException` or an empty file poll on AIX, or an override that
quietly does not apply. **Check case character by character on anything that
crosses a filesystem.**

## Character encoding

The developer's Windows default is typically windows-1252 or UTF-8. The AIX
default is often ISO8859-1, and depends on the service user's locale. This is
the reason non-ASCII payloads pass local tests and mangle in production.

- Never rely on a platform default. `getBytes()` and `new String(byte[])` with
  no charset argument read the platform default on whichever machine they run.
- Take the CCSID from `InputRoot.Properties.CodedCharSetId` rather than
  assuming, and copy the `Properties` folder when you build an output message.
- Check the locale of the ACE service user on AIX (`locale`, and the environment
  the integration server actually starts with) — not the locale of your
  interactive login, which is often different.
- Source files themselves: keep ESQL and Java ASCII where you can. A literal
  accented character in source is encoded by the Toolkit and decoded by the AIX
  compiler, and the two do not always agree.

## Line endings

Two separate problems. Do not conflate them.

**Source files.** Git for Windows defaults to `core.autocrlf=true`, which
rewrites checked-out files to CRLF. A shell script converted to CRLF fails on
AIX immediately with `set: Illegal option -` or a bad-interpreter error. The
`.gitattributes` in this repository pins `*.sh` and `*.ksh` to LF for that
reason. If you add scripts, keep them covered by it.

**Data files.** More dangerous, because it is invisible. Test data created on
Windows has CRLF; the real files arriving on AIX have LF. A DFDL model with a
`%CR;%LF;` separator, or a fixed-width record length that silently counted the
extra byte, parses locally and fails on AIX — or worse, parses with a trailing
`\r` on the last field of every record.

Build test data with the line endings the **runtime** will see, not the ones your
editor produces. When a field arrives with an unexplained trailing character,
this is the first thing to check.

## Paths

- No drive letters, no UNC paths, no backslash separators in any deployed
  artifact. `C:\apps\...` and `\\nas01\share\...` cannot exist on AIX.
- Everything filesystem-related belongs in a UDP or a policy anyway, so the
  correct fix is usually "make it overridable", not "change the slash".
- AIX paths are case-sensitive (see above) and often longer than the Windows
  equivalents — watch for truncation in fixed-length fields.
- `$MQSI_WORKPATH` defaults to `/var/mqsi` on AIX. It has no Windows analogue
  the developer will recognise.

## The local integration server lies

Differences between the Toolkit's local broker on Windows and the AIX runtime
that routinely change behaviour:

| | Windows Toolkit | AIX runtime |
|---|---|---|
| JVM | bundled, developer's level | AIX JVM, possibly a different level |
| Shared classes | local workspace | server-scoped shared-classes directory |
| MQ connection | often client, to a remote QM | frequently local bindings |
| JDBC drivers | whatever is on the workspace path | installed and configured on the server |
| Filesystem permissions | effectively none | the ACE service user's, and it is not root |
| Locale / CCSID | Windows default | service user's locale |
| Additional instances | usually 1 while debugging | tuned up, so concurrency bugs appear |

That last row deserves attention. **Thread-safety defects cannot reproduce
locally** if you debug with a single instance. A `static SimpleDateFormat` or an
unguarded `SHARED` variable is invisible on Windows and produces intermittent
wrong data on AIX.

## Permissions

The ACE service user on AIX is not an administrator. Anything the flow writes —
output directories, archive folders, temp files — needs to be writable by that
user, and directories need to exist beforehand. On Windows the developer is
usually a local admin and never sees this.

Check the file-node directories, the error/archive subdirectories, and any path
a Java node opens directly.

## Review checklist

When reviewing code written on Windows for AIX deployment, check specifically:

1. Any path literal — drive letter, backslash, UNC.
2. Case of every filesystem-crossing name: packages, jars, schemas, BAR keys.
3. Every byte/String conversion for an explicit charset.
4. `Properties` folder copied on output messages.
5. DFDL separators and record lengths against real AIX data, not Windows test
   data.
6. Thread safety, because local single-instance testing proved nothing.
7. Directories and permissions the flow assumes exist.
