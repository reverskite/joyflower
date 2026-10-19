param([string]$BaseUrl = 'http://127.0.0.1:5174')
$ErrorActionPreference = 'Stop'
$target = [uri]$BaseUrl
if ($target.Scheme -ne 'http' -or $target.Host -notin @('localhost','127.0.0.1','[::1]')) { throw 'Local loopback HTTP only.' }
function Probe([string]$Route, [string]$Method = 'GET', [hashtable]$Extra = @{}, [string]$Body = '') {
  $options = @{ Uri = $BaseUrl.TrimEnd('/') + $Route; Method = $Method; Headers = $Extra; SkipHttpErrorCheck = $true; TimeoutSec = 20; NoProxy = $true; MaximumRedirection = 0; ErrorAction = 'SilentlyContinue' }
  if ($Body) { $options.Body = $Body; $options.ContentType = 'application/json' }
  try { $response = Invoke-WebRequest @options } catch { throw "Local HTTP probe failed: $Method $Route (timeout/transport)." }
  if (-not $response) { throw "No local response: $Method $Route" }
  return $response
}
function Expect($Actual, $Expected, [string]$Label) { if ($Actual -ne $Expected) { throw "$Label expected $Expected, received $Actual" } }
$receipt = 'JF-' + [guid]::NewGuid().ToString()
foreach ($route in @('/api/admin/inquiries','/api/admin/summary','/api/admin/session',"/api/admin/inquiries/$receipt")) {
  $reply = Probe $route 'GET' @{ 'Cf-Access-Jwt-Assertion' = 'forged'; 'Cf-Access-Authenticated-User-Email' = 'fixture@example.invalid' }
  Expect $reply.StatusCode 401 $route
  Expect ($reply.Headers['Cache-Control'] -join ',') 'no-store' $route
  if ($reply.Content -match 'customer_name|01000000000') { throw 'PII in unauthorized response' }
}
Expect (Probe "/api/admin/inquiries/$receipt" 'PATCH' @{ Origin = $BaseUrl } '{"status":"completed","version":0}').StatusCode 401 'unauthenticated PATCH'
Expect (Probe '/api/admin/session' 'POST' @{ Origin = $BaseUrl; 'X-Local-Admin-Secret' = 'pretend-local-key' } '{}').StatusCode 403 'built local login'
$login = Probe '/admin/login'
Expect $login.StatusCode 200 'login guide'
Expect ($login.Headers['Cache-Control'] -join ',') 'no-store' 'admin HTML cache'
if ($login.Content -notmatch 'noindex' -or $login.Content -match 'name="local-secret"') { throw 'Production login HTML gate/noindex failed' }
foreach ($route in @('/admin','/admin/inquiries',"/admin/inquiries/$receipt")) {
  $reply = Probe $route
  if ($reply.StatusCode -notin @(302,303,307,308)) { throw "Protected page did not redirect: $route" }
  Expect ($reply.Headers['Location'] -join ',') '/admin/login' 'server authentication redirect'
  Expect ($reply.Headers['Cache-Control'] -join ',') 'no-store' 'protected HTML cache'
}
Expect (Probe '/api/inquiries' 'POST' @{ Origin = $BaseUrl; 'Idempotency-Key' = [guid]::NewGuid().ToString() } '{}').StatusCode 503 'unconfigured operating intake'
Expect (Probe '/api/inquiries').StatusCode 405 'public read forbidden'
foreach ($route in @('/','/christmas','/planterior','/landscape','/portfolio','/inquiry','/privacy','/portfolio/penthouse-planterior')) {
  $reply = Probe $route
  Expect $reply.StatusCode 200 $route
  Expect ([regex]::Matches($reply.Content, '<script[^>]+type="application/ld\+json"').Count) 1 'single JSON-LD'
}
$inquiry = Probe '/inquiry?service=landscape'
if ($inquiry.Content -notmatch '조경관리 상담 정보' -or $inquiry.Content -notmatch '<button[^>]+disabled[^>]*>견적 접수하기') { throw 'SSR service/policy gate failed' }
Expect (Probe '/robots.txt').StatusCode 200 'robots'
$sitemap = Probe '/sitemap.xml'
Expect $sitemap.StatusCode 200 'sitemap'
if ($sitemap.Content -match '/admin') { throw 'Admin URL in sitemap' }
Expect (Probe '/not-a-real-page').StatusCode 404 'missing URL'
$projectRoot = Split-Path $PSScriptRoot -Parent
$vars = Get-Content -LiteralPath (Join-Path $projectRoot '.dev.vars') -Raw
$keys = [regex]::Matches($vars, '(?:ADMIN_LOCAL_SECRET|INQUIRY_RATE_LIMIT_SECRET)="([^"]+)"')
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot 'dist') -File -Recurse | Where-Object { $_.Extension -in @('.js','.json','.html') }) {
  $jfBuildText = [System.IO.File]::ReadAllText($file.FullName)
  foreach ($jfKeyMatch in $keys) { if ([regex]::IsMatch($jfBuildText, [regex]::Escape($jfKeyMatch.Groups[1].Value))) { throw 'Local secret in build' } }
}
Write-Output 'PASS built Worker: server auth, forged JWT rejection, no-store/noindex, local login disabled, inquiry regression, public SEO/SSR, 404 and no bundled secrets.'
