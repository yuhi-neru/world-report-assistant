$ErrorActionPreference = 'Stop'
$reviewRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $reviewRoot
try {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    cargo test --manifest-path src-tauri/Cargo.toml --locked --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Native checks failed' }
    python tools/collect-notices.py
    if ($LASTEXITCODE -ne 0) { throw 'License notices failed' }
    npm.cmd run bundle
    if ($LASTEXITCODE -ne 0) { throw 'Installer build failed' }
    $reviewVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
    $reviewSetup = Join-Path $reviewRoot "src-tauri/target/release/bundle/nsis/World Review Assistant_${reviewVersion}_x64-setup.exe"
    $reviewOut = Join-Path $reviewRoot 'artifacts'
    New-Item -ItemType Directory -Path $reviewOut -Force | Out-Null
    $reviewDestination = Join-Path $reviewOut "WorldReviewAssistant-Setup-${reviewVersion}-win-x64.exe"
    Copy-Item -LiteralPath $reviewSetup -Destination $reviewDestination
    Copy-Item -LiteralPath (Join-Path $reviewRoot 'src-tauri/target/release/world-review-assistant.exe') -Destination (Join-Path $reviewOut 'world-review-assistant.exe')
    Get-FileHash -Algorithm SHA256 -LiteralPath $reviewDestination | Format-List
} finally { Pop-Location }
