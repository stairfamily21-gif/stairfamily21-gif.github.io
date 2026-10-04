# Tiny local web server for previewing the site: http://localhost:8765
#   powershell -ExecutionPolicy Bypass -File .\serve.ps1
param([int]$Port = 8765)

$root = $PSScriptRoot
$types = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
    '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.ico' = 'image/x-icon'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/  (Ctrl+C to stop)"
try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
            if ($path -eq '') { $path = 'index.html' }
            $file = [IO.Path]::GetFullPath((Join-Path $root $path))
            if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
                $bytes = [IO.File]::ReadAllBytes($file)
                $ext = [IO.Path]::GetExtension($file).ToLower()
                $ctx.Response.ContentType = $(if ($types[$ext]) { $types[$ext] } else { 'application/octet-stream' })
                $ctx.Response.Headers.Add('Cache-Control', 'no-store')
                $ctx.Response.ContentLength64 = $bytes.Length
                if ($ctx.Request.HttpMethod -ne 'HEAD') { $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length) }
            } else {
                $ctx.Response.StatusCode = 404
            }
        } catch {
            Write-Host "Request failed: $($_.Exception.Message)"
        } finally {
            try { $ctx.Response.Close() } catch {}
        }
    }
} finally { $listener.Stop() }
