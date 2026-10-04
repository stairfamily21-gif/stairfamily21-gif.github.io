# Captures a snapshot of this PC's hardware + current usage into stats.js,
# which the website reads. Run it any time to refresh the numbers:
#   powershell -ExecutionPolicy Bypass -File .\update-stats.ps1          (just update)
#   powershell -ExecutionPolicy Bypass -File .\update-stats.ps1 -Push    (update + publish)
#
# Privacy: only hardware models and usage numbers are saved. No serial numbers,
# computer name, user name, IP address or process list.

param([switch]$Push)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Sample($counter, $n = 3) {
    try {
        $s = Get-Counter $counter -SampleInterval 1 -MaxSamples $n
        return [math]::Round((($s.CounterSamples | Measure-Object CookedValue -Average).Average), 1)
    } catch { return $null }
}

Write-Host 'Reading hardware...'
$cpu  = Get-CimInstance Win32_Processor | Select-Object -First 1
$gpus = @(Get-CimInstance Win32_VideoController)
$mb   = Get-CimInstance Win32_BaseBoard
$bios = Get-CimInstance Win32_BIOS
$ram  = @(Get-CimInstance Win32_PhysicalMemory)
$os   = Get-CimInstance Win32_OperatingSystem
$disk = Get-PhysicalDisk | Sort-Object Size -Descending | Select-Object -First 1
$vol  = Get-Volume -DriveLetter C

Write-Host 'Sampling usage for a few seconds...'
$cpuLoad = Sample '\Processor(_Total)\% Processor Time'
$cpuPerf = Sample '\Processor Information(_Total)\% Processor Performance'
$diskBusy = Sample '\PhysicalDisk(_Total)\% Disk Time'
$diskRead = Sample '\PhysicalDisk(_Total)\Disk Read Bytes/sec'
$diskWrite = Sample '\PhysicalDisk(_Total)\Disk Write Bytes/sec'
$coreLoads = @()
try {
    $cs = Get-Counter '\Processor(*)\% Processor Time' -SampleInterval 1 -MaxSamples 2
    $coreLoads = @($cs[-1].CounterSamples |
        Where-Object { $_.InstanceName -ne '_total' } |
        Sort-Object { [int]$_.InstanceName } |
        ForEach-Object { [math]::Round($_.CookedValue, 1) })
} catch {}

$gpu = $null
$nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvsmi) {
    $q = 'name,memory.total,memory.used,utilization.gpu,temperature.gpu,power.draw,power.limit,clocks.gr,clocks.max.gr,fan.speed,driver_version'
    $line = (& nvidia-smi --query-gpu=$q --format=csv,noheader,nounits | Select-Object -First 1)
    $f = $line -split ',\s*'
    $num = { param($v) $d = 0.0; if ([double]::TryParse($v, [ref]$d)) { $d } else { $null } }
    $gpu = [ordered]@{
        name = $f[0]; vramTotalMB = & $num $f[1]; vramUsedMB = & $num $f[2]
        utilization = & $num $f[3]; tempC = & $num $f[4]
        powerW = & $num $f[5]; powerLimitW = & $num $f[6]
        clockMHz = & $num $f[7]; maxClockMHz = & $num $f[8]
        fanPercent = & $num $f[9]; driver = $f[10]
    }
} else {
    $d = $gpus | Where-Object { $_.Name -notmatch 'Radeon\(TM\) Graphics|Basic' } | Select-Object -First 1
    if ($d) { $gpu = [ordered]@{ name = $d.Name; driver = $d.DriverVersion } }
}
$igpu = $gpus | Where-Object { $_.Name -match 'Radeon\(TM\) Graphics|Intel.*Graphics' } | Select-Object -First 1
$display = $gpus | Where-Object { $_.CurrentHorizontalResolution } | Select-Object -First 1

$totalKB = [double]$os.TotalVisibleMemorySize
$freeKB  = [double]$os.FreePhysicalMemory
$memTypes = @{ 26 = 'DDR4'; 34 = 'DDR5'; 35 = 'LPDDR5' }

$stats = [ordered]@{
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    os = $os.Caption
    cpu = [ordered]@{
        name = $cpu.Name.Trim(); cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors
        baseClockMHz = $cpu.MaxClockSpeed; l2KB = $cpu.L2CacheSize; l3KB = $cpu.L3CacheSize
        load = $cpuLoad
        effectiveClockMHz = $(if ($cpuPerf) { [math]::Round($cpu.MaxClockSpeed * $cpuPerf / 100) } else { $null })
        coreLoads = $coreLoads
        integratedGraphics = $(if ($igpu) { $igpu.Name } else { $null })
    }
    gpu = $gpu
    display = $(if ($display) { [ordered]@{ width = $display.CurrentHorizontalResolution; height = $display.CurrentVerticalResolution; hz = $display.CurrentRefreshRate } } else { $null })
    memory = [ordered]@{
        totalGB = [math]::Round($totalKB / 1MB, 1)
        usedGB = [math]::Round(($totalKB - $freeKB) / 1MB, 1)
        modules = @($ram | ForEach-Object { [ordered]@{
            partNumber = $_.PartNumber.Trim(); capacityGB = [math]::Round($_.Capacity / 1GB)
            speedMTs = $_.ConfiguredClockSpeed; type = $memTypes[[int]$_.SMBIOSMemoryType] } })
    }
    motherboard = [ordered]@{ manufacturer = $mb.Manufacturer; product = $mb.Product; bios = $bios.SMBIOSBIOSVersion }
    storage = [ordered]@{
        name = $disk.FriendlyName; bus = "$($disk.BusType)"; mediaType = "$($disk.MediaType)"
        sizeGB = [math]::Round($disk.Size / 1e9)
        cTotalGB = [math]::Round($vol.Size / 1GB, 1); cUsedGB = [math]::Round(($vol.Size - $vol.SizeRemaining) / 1GB, 1)
        busyPercent = $(if ($null -ne $diskBusy) { [math]::Min(100, $diskBusy) } else { $null })
        readMBs = $(if ($null -ne $diskRead) { [math]::Round($diskRead / 1MB, 2) } else { $null })
        writeMBs = $(if ($null -ne $diskWrite) { [math]::Round($diskWrite / 1MB, 2) } else { $null })
    }
}

$json = $stats | ConvertTo-Json -Depth 6
$out = "// Generated by update-stats.ps1 - do not edit by hand.`nwindow.RIG_STATS = $json;`n"
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'stats.js'), $out, (New-Object Text.UTF8Encoding $false))
Write-Host "Wrote stats.js (captured $($stats.capturedAt))"

if ($Push) {
    git add stats.js
    git commit -m "Update PC stats snapshot"
    git push
    Write-Host 'Pushed. GitHub Pages will update in about a minute.'
}
