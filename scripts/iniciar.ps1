# Sobe o QA Hub depois de ligar o PC e confere se está tudo no ar.
#   Clique duas vezes em "Iniciar QA Hub.cmd" (na pasta do projeto), ou:
#   powershell -ExecutionPolicy Bypass -File scripts\iniciar.ps1 [-SemNavegador]

param([switch]$SemNavegador)
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:Path += ";C:\Program Files\Docker\Docker\resources\bin"
$problemas = @()

function Passo($texto) { Write-Host ""; Write-Host "== $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "   [ok] $texto" -ForegroundColor Green }
function Falha($texto) { Write-Host "   [!!] $texto" -ForegroundColor Yellow; $script:problemas += $texto }
function DockerPronto { docker version --format "{{.Server.Version}}" 2>$null | Out-Null; return $LASTEXITCODE -eq 0 }

# 1. Docker
Passo "1/4 Docker"
if (DockerPronto) {
    Ok "Docker já está rodando"
} else {
    $exe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (-not (Test-Path $exe)) { Falha "Docker Desktop não encontrado em $exe"; exit 1 }
    Write-Host "   abrindo o Docker Desktop (pode levar 1-2 minutos)..."
    Start-Process $exe
    $limite = (Get-Date).AddMinutes(4)
    while (-not (DockerPronto) -and (Get-Date) -lt $limite) { Start-Sleep -Seconds 5; Write-Host "   ." -NoNewline }
    Write-Host ""
    if (DockerPronto) { Ok "Docker pronto" } else { Falha "O Docker não respondeu em 4 minutos. Abra o Docker Desktop e veja se ele mostra algum erro."; exit 1 }
}

# 2. Containers (banco, Kiwi e QA Hub)
Passo "2/4 Containers"
docker compose up -d 2>&1 | Out-Null
$limite = (Get-Date).AddMinutes(3)
do {
    Start-Sleep -Seconds 3
    $status = docker compose ps --format "{{.Service}}={{.Health}}" 2>$null
    $prontos = @($status | Where-Object { $_ -match '=healthy$' }).Count
} while ($prontos -lt 3 -and (Get-Date) -lt $limite)
foreach ($linha in $status) {
    $nome, $saude = $linha -split '=', 2
    $rotulo = @{ db = "banco (MariaDB)"; web = "Kiwi"; "qa-hub" = "QA Hub" }[$nome]
    if ($saude -eq "healthy") { Ok "$rotulo saudável" } else { Falha "$rotulo está '$saude'. Veja: docker compose logs $nome" }
}

# 3. Tunnel do Cloudflare (serviço do Windows)
Passo "3/4 Tunnel do Cloudflare"
$svc = Get-Service cloudflared -ErrorAction SilentlyContinue
if (-not $svc) { Falha "Serviço cloudflared não encontrado" }
elseif ($svc.Status -eq "Running") { Ok "serviço cloudflared rodando" }
else {
    try { Start-Service cloudflared -ErrorAction Stop; Ok "serviço cloudflared iniciado" }
    catch { Falha "O serviço cloudflared está parado e não iniciou (pode exigir administrador): services.msc > cloudflared > Iniciar" }
}

# 4. Testes de acesso
Passo "4/4 Testando o acesso"
try { $r = Invoke-WebRequest -UseBasicParsing http://localhost:3000/login -TimeoutSec 20; if ($r.StatusCode -eq 200) { Ok "QA Hub responde neste PC (http://localhost:3000)" } }
catch { Falha "QA Hub não respondeu em http://localhost:3000" }

# Endereço público vem do arquivo local (fora do git): QA_HUB_URL em web/.env.production.local
$publico = $null
$envFile = Join-Path $root "web\.env.production.local"
if (Test-Path $envFile) {
    $linha = Get-Content $envFile | Where-Object { $_ -match '^\s*QA_HUB_URL=' } | Select-Object -First 1
    if ($linha) { $publico = ($linha -split '=', 2)[1].Trim() }
}
if ($publico) {
    # PowerShell 5.1 não usa TLS 1.2 por padrão (o Cloudflare exige) e segue redirecionamentos sozinho;
    # aqui pedimos sem seguir, para ver o 302 do login do Cloudflare Access.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $code = $null
    try {
        $req = [Net.HttpWebRequest]::Create("$publico/login")
        $req.AllowAutoRedirect = $false
        $req.Timeout = 20000
        $resp = $req.GetResponse(); $code = [int]$resp.StatusCode; $resp.Close()
    } catch [Net.WebException] {
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode } else { $code = $_.Exception.Status }
    }
    if ($code -in 301, 302, 303, 307, 308) { Ok "$publico no ar (pede o login do Cloudflare, como deve ser)" }
    elseif ($code -eq 200) { Ok "$publico no ar (atenção: abriu sem pedir login do Cloudflare)" }
    else { Falha "$publico não respondeu como esperado ($code). Confira o Tunnel no painel do Cloudflare." }
}

Write-Host ""
if ($problemas.Count -eq 0) {
    Write-Host "Tudo no ar!" -ForegroundColor Green
    if ($publico -and -not $SemNavegador) { Start-Process $publico }
} else {
    Write-Host "Terminou com $($problemas.Count) aviso(s) acima." -ForegroundColor Yellow
}
