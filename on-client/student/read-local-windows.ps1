# 학생 추가: 설정 변경 없이 방화벽 프로필과 두 로그의 건수만 읽는다.
Set-StrictMode -Version 3
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
function FailureCode($record) {
  if ($record.CategoryInfo.Category -eq 'PermissionDenied' -or $record.Exception -is [UnauthorizedAccessException]) { return 'PC_ACCESS_DENIED' }
  return 'PC_QUERY_FAILED'
}
$result = [ordered]@{}
try {
  $profiles = @(Get-NetFirewallProfile -PolicyStore ActiveStore -ErrorAction Stop | ForEach-Object {
    $enabled = $null
    if ($_.Enabled.ToString() -eq 'True') { $enabled = $true }
    if ($_.Enabled.ToString() -eq 'False') { $enabled = $false }
    [ordered]@{ profile = $_.Name.ToString(); enabled = $enabled }
  })
  $result.firewall = [ordered]@{ state='ok'; checkedAt=[DateTime]::UtcNow.ToString('o'); profiles=$profiles }
} catch {
  $result.firewall = [ordered]@{ state='unavailable'; checkedAt=[DateTime]::UtcNow.ToString('o'); code=(FailureCode $_) }
}
$windowStart = (Get-Date).AddHours(-24)
foreach ($logName in @('System', 'Application')) {
  try {
    $events = @(Get-WinEvent -FilterHashtable @{LogName=$logName; Level=2,3; StartTime=$windowStart} -MaxEvents 5001 -ErrorAction Stop)
    $truncated = $events.Count -gt 5000
    $selected = @($events | Select-Object -First 5000)
    $errors = @($selected | Where-Object { $_.Level -eq 2 }).Count
    $warnings = @($selected | Where-Object { $_.Level -eq 3 }).Count
    $result[$logName] = [ordered]@{
      state='ok'; checkedAt=[DateTime]::UtcNow.ToString('o')
      windowStart=$windowStart.ToUniversalTime().ToString('o')
      errors=$errors; warnings=$warnings; truncated=$truncated; limit=5000
    }
  } catch {
    # 이 오류만 조건에 맞는 기록 0건이다. 권한 오류를 0건으로 바꾸지 않는다.
    if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') {
      $result[$logName] = [ordered]@{
        state='ok'; checkedAt=[DateTime]::UtcNow.ToString('o')
        windowStart=$windowStart.ToUniversalTime().ToString('o')
        errors=0; warnings=0; truncated=$false; limit=5000
      }
    } else {
      $result[$logName] = [ordered]@{ state='unavailable'; checkedAt=[DateTime]::UtcNow.ToString('o'); code=(FailureCode $_) }
    }
  }
}
$result | ConvertTo-Json -Depth 5 -Compress
