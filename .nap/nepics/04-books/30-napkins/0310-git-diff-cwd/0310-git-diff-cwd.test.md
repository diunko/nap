# 0310 — test architecture

## T-01: git diff uses dirname as cwd (small)

- **Flow:** Call the git diff logic with a file path inside a nested git repo
- **Expected:** execFile receives `cwd: dirname(filePath)`, not `projectCwd`
- **Size:** Small
- **Verification:** The cwd argument passed to execFile matches dirname of the input path

## T-02: git ls-files uses dirname as cwd (small)

- **Flow:** Call the git ls-files check with a file path
- **Expected:** execFile receives `cwd: dirname(filePath)`
- **Size:** Small
- **Verification:** Same as T-01 but for the ls-files call
