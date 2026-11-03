# Restaura um backup do banco do Kiwi (SUBSTITUI os dados atuais).
#   powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 backups\kiwi-2026-10-25_1200.sql

param([Parameter(Mandatory = $true)][string]$File)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path $File)) { throw "Arquivo não encontrado: $File" }

$answer = Read-Host "Isto apaga os dados atuais do Kiwi e coloca os do backup. Digite RESTAURAR para continuar"
if ($answer -ne "RESTAURAR") { "Cancelado."; exit 1 }

$password = ((Get-Content (Join-Path $root ".env") | Where-Object { $_ -match '^\s*DB_ROOT_PASSWORD=' }) -split '=', 2)[1].Trim()
docker compose stop qa-hub web
docker compose cp $File db:/tmp/kiwi-restore.sql
docker compose exec -T -e MYSQL_PWD=$password db sh -c "mariadb -uroot kiwi < /tmp/kiwi-restore.sql && rm -f /tmp/kiwi-restore.sql"
if ($LASTEXITCODE -ne 0) { throw "Falha ao restaurar" }
docker compose start web qa-hub
# Cadastro de automação do mesmo horário (automacao-<data>.json), se houver.
$auto = $File -replace 'kiwi-(.+)\.sql$', 'automacao-$1.json'
if ($auto -ne $File -and (Test-Path $auto)) { $ErrorActionPreference = "Continue"; docker compose cp $auto qa-hub:/app/.data/projetos.json 2>&1 | Out-Null; "Cadastro de automação restaurado de $auto" }
"Restaurado a partir de $File"
