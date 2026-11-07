# Build pkgscan cho các nền tảng. Kết quả nằm trong agent/dist/
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$version = if ($env:VERSION) { $env:VERSION } else { "0.1.0" }
$targets = @("windows/amd64", "darwin/arm64", "darwin/amd64", "linux/amd64")
New-Item -ItemType Directory -Force dist | Out-Null
$env:CGO_ENABLED = "0"
foreach ($t in $targets) {
    $os, $arch = $t.Split("/")
    $ext = if ($os -eq "windows") { ".exe" } else { "" }
    $out = "dist/pkgscan-$os-$arch$ext"
    $env:GOOS = $os; $env:GOARCH = $arch
    go build -trimpath -ldflags "-s -w -X main.version=$version" -o $out .
    if ($LASTEXITCODE -ne 0) { throw "build $t failed" }
    Write-Host "built $out"
}
Remove-Item Env:GOOS, Env:GOARCH
if (-not (Test-Path dist/config.json)) { Copy-Item config.example.json dist/config.json }
