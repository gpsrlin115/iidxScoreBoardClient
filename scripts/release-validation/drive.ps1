# Drives headless Chrome (CDP) or Firefox (WebDriver BiDi) through a list of probe URLs,
# saving each probe report, a screenshot, and any exported PNG.
param(
  [Parameter(Mandatory = $true)][ValidateSet('chrome', 'firefox')][string]$Browser,
  [Parameter(Mandatory = $true)][string]$JobsFile,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions
$ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$ser.MaxJsonLength = [int]::MaxValue
$root = Split-Path -Parent $JobsFile
$profileDir = Join-Path $root "profile-$Browser"
$logFile = Join-Path $OutDir "drive-$Browser.log"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null
function Log($m) { Add-Content -Path $logFile -Value ("{0} {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) -Encoding UTF8 }

$port = if ($Browser -eq 'chrome') { 9333 } else { 9334 }
if ($Browser -eq 'chrome') {
  $exe = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  $argList = @('--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    "--user-data-dir=$profileDir", "--remote-debugging-port=$port", '--window-size=1440,1000', 'about:blank')
} else {
  $exe = 'C:\Program Files\Mozilla Firefox\firefox.exe'
  Set-Content -Path (Join-Path $profileDir 'user.js') -Encoding ASCII -Value @(
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("browser.download.useDownloadDir", true);'
  )
  $argList = @('--headless', '--remote-debugging-port', "$port", '--profile', $profileDir, '--no-remote', '--width=1440', '--height=1000')
}
Start-Process -FilePath $exe -ArgumentList $argList | Out-Null
Log "started $Browser"

$ws = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [Threading.CancellationToken]::None
$script:msgId = 0
function Receive-Msg {
  $buf = New-Object byte[] 1048576
  $ms = New-Object IO.MemoryStream
  do {
    $r = $ws.ReceiveAsync((New-Object 'ArraySegment[byte]' -ArgumentList @(, $buf)), $ct).GetAwaiter().GetResult()
    $ms.Write($buf, 0, $r.Count)
  } while (-not $r.EndOfMessage)
  return [Text.Encoding]::UTF8.GetString($ms.ToArray())
}
function Cmd($method, $params) {
  $script:msgId++
  $myId = $script:msgId
  $json = $ser.Serialize(@{ id = $myId; method = $method; params = $params })
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  [void]$ws.SendAsync((New-Object 'ArraySegment[byte]' -ArgumentList @(, $bytes)), [Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).GetAwaiter().GetResult()
  while ($true) {
    $o = $ser.DeserializeObject((Receive-Msg))
    if ($o.ContainsKey('id') -and $o['id'] -eq $myId) {
      if ($o.ContainsKey('error') -and $o['error']) { throw ("{0} failed: {1}" -f $method, $ser.Serialize($o)) }
      return ,$o['result']
    }
  }
}

# connect
$deadline = (Get-Date).AddSeconds(30)
$connected = $false
while (-not $connected -and (Get-Date) -lt $deadline) {
  try {
    if ($Browser -eq 'chrome') {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 3
      $page = $targets | Where-Object { $_.type -eq 'page' } | Select-Object -First 1
      if ($page) { $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, $ct).Wait(); $connected = $true }
    } else {
      $ws.ConnectAsync([Uri]"ws://127.0.0.1:$port/session", $ct).Wait(); $connected = $true
    }
  } catch { Start-Sleep -Milliseconds 500; $ws = New-Object System.Net.WebSockets.ClientWebSocket }
}
if (-not $connected) { Log 'could not connect'; exit 2 }
Log 'connected'

$context = $null
if ($Browser -eq 'firefox') {
  Cmd 'session.new' @{ capabilities = @{} } | Out-Null
  # A fresh tab: the first context in getTree can be a privileged window that rejects setViewport.
  $created = Cmd 'browsingContext.create' @{ type = 'tab' }
  $context = $created['context']
}
function Eval($expr) {
  if ($Browser -eq 'chrome') {
    $r = Cmd 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true; awaitPromise = $true }
    return $r['result']['value']
  }
  $r = Cmd 'script.evaluate' @{ expression = $expr; target = @{ context = $context }; awaitPromise = $true }
  return $r['result']['value']
}
function Shot($path) {
  if ($Browser -eq 'chrome') { $r = Cmd 'Page.captureScreenshot' @{ format = 'png' } }
  else { $r = Cmd 'browsingContext.captureScreenshot' @{ context = $context } }
  [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($r['data']))
}

$jobs = Get-Content -Raw -Encoding UTF8 $JobsFile | ConvertFrom-Json
$i = 0
foreach ($job in $jobs) {
  $i++
  $nonce = "n$i$(Get-Random)"
  $sep = if ($job.url.Contains('?')) { '&' } else { '?' }
  $url = "$($job.url)$sep" + "nonce=$nonce"
  $w = if ($job.width) { [int]$job.width } else { 1440 }
  $h = if ($job.height) { [int]$job.height } else { 1000 }
  try {
    if ($Browser -eq 'chrome') {
      Cmd 'Emulation.setDeviceMetricsOverride' @{ width = $w; height = $h; deviceScaleFactor = 1; mobile = $false } | Out-Null
      Cmd 'Page.navigate' @{ url = $url } | Out-Null
    } else {
      Cmd 'browsingContext.setViewport' @{ context = $context; viewport = @{ width = $w; height = $h } } | Out-Null
      Cmd 'browsingContext.navigate' @{ context = $context; url = $url; wait = 'complete' } | Out-Null
    }
    $done = $false
    $until = (Get-Date).AddSeconds(90)
    while (-not $done -and (Get-Date) -lt $until) {
      Start-Sleep -Milliseconds 300
      # The app may rewrite the query (public tier table) or navigate in-app, so match the URL the probe started on.
      try { $done = [bool](Eval "Boolean(window.__probe && window.__probe.done && window.__probe.report.url.includes('$nonce'))") } catch { $done = $false }
    }
    Start-Sleep -Milliseconds 400
    $fin = if ($done) { 'true' } else { 'false' }
    $report = Eval "JSON.stringify(Object.assign({}, window.__probe ? window.__probe.report : {missing:true}, {finished: $fin}))"
    [IO.File]::WriteAllText((Join-Path $OutDir "$($job.name).json"), $report, (New-Object Text.UTF8Encoding($false)))
    if ($job.shot -ne $false) { Shot (Join-Path $OutDir "$($job.name).png") }
    $png = Eval "window.__probe && window.__probe.pngBase64 || ''"
    if ($png) { [IO.File]::WriteAllBytes((Join-Path $OutDir "$($job.name)-export.png"), [Convert]::FromBase64String($png)) }
    Log "$($job.name) done=$done"
  } catch {
    Log "$($job.name) ERROR $($_.Exception.Message)"
  }
}

try { if ($Browser -eq 'firefox') { Cmd 'session.end' @{} | Out-Null } } catch { }
$name = if ($Browser -eq 'chrome') { 'chrome.exe' } else { 'firefox.exe' }
Get-CimInstance Win32_Process -Filter "Name = '$name'" | Where-Object { $_.CommandLine -like "*$profileDir*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Log 'finished'
