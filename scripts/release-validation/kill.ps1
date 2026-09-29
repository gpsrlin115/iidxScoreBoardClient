# Stops only the test browsers drive.ps1 started: their profile folder is <work folder>\profile-<browser>.
# The user's own Chrome/Firefox never use such a profile, so they are left alone.
# Matches on the work folder's name only: $env:TEMP can come back as an 8.3 short path
# (C:\Users\ADMINI~1\...) while the browser was started with the long one.
param([string]$Root = 'relval')
$pattern = "*\$(Split-Path $Root -Leaf)\profile-*"
Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe' OR Name = 'firefox.exe'" |
  Where-Object { $_.CommandLine -like $pattern } |
  ForEach-Object { "{0} {1}" -f $_.ProcessId, $_.Name; Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
