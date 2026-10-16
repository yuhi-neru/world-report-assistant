$ErrorActionPreference = 'Stop'
$reviewProject = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$reviewLogFolder = Join-Path $reviewProject 'artifacts'
try {
    New-Item -ItemType Directory -Path $reviewLogFolder -Force | Out-Null
    $reviewCargo = Join-Path $env:USERPROFILE '.cargo\bin'
    $reviewNode = Join-Path $env:ProgramFiles 'nodejs'
    $env:Path = "$reviewCargo;$reviewNode;$env:Path"
    $env:WORLD_REVIEW_HOME = Join-Path $reviewProject 'workspace'
    $reviewStamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $reviewOutput = Join-Path $reviewLogFolder "dev-$reviewStamp.log"
    $reviewError = Join-Path $reviewLogFolder "dev-$reviewStamp-error.log"
    $reviewProcess = Start-Process -FilePath $env:ComSpec -ArgumentList '/d /c npm.cmd run desktop' -WorkingDirectory $reviewProject -WindowStyle Hidden -RedirectStandardOutput $reviewOutput -RedirectStandardError $reviewError -Wait -PassThru
    if ($reviewProcess.ExitCode -ne 0) {
        throw "開発モードを起動できませんでした。既に起動している場合は、その画面をご利用ください。`n`n記録：$reviewError"
    }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'World Report Assistant 開発モード', 'OK', 'Error') | Out-Null
    exit 1
}
