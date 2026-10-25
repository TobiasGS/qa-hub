# Backup do banco do Kiwi (todos os dados reais do QA Hub).
#   powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
# Gera backups\kiwi-AAAA-MM-DD_HHmm.sql e mantém só os 14 mais recentes.
# As evidências (prints/vídeos) ficam no volume "evidence": veja o README.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env_ = Get-Content (Join-Path $root ".env") | Where-Object { $_ -match '^\s*DB_ROOT_PASSWORD=' }
if (-not $env_) { throw "DB_ROOT_PASSWORD não encontrado no .env" }
$password = ($env_ -split '=', 2)[1].Trim()

$dir = Join-Path $root "backups"
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir ("kiwi-{0:yyyy-MM-dd_HHmm}.sql" -f (Get-Date))

# O dump é gerado dentro do container e copiado depois, para o arquivo sair byte a byte
# (o redirecionamento ">" do PowerShell 5.1 trocaria a codificação para UTF-16).
docker compose exec -T -e MYSQL_PWD=$password db sh -c "mariadb-dump -uroot --single-transaction --routines --triggers kiwi > /tmp/kiwi-backup.sql"
if ($LASTEXITCODE -ne 0) { throw "mariadb-dump falhou" }
docker compose cp db:/tmp/kiwi-backup.sql $file
docker compose exec -T db rm -f /tmp/kiwi-backup.sql

Get-ChildItem $dir -Filter "kiwi-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
"Backup salvo em $file ({0:N1} MB)" -f ((Get-Item $file).Length / 1MB)
