param(
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

function Get-RegistryValue {
  param(
    [Parameter(Mandatory = $true)]
    [psobject]$Item,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    $Default = $null
  )

  if ($Item.PSObject.Properties.Name -contains $Name) {
    return $Item.$Name
  }

  return $Default
}

function Get-SystemProxyState {
  $settings = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
  $proxyEnable = [int](Get-RegistryValue -Item $settings -Name "ProxyEnable" -Default 0)
  $proxyServer = [string](Get-RegistryValue -Item $settings -Name "ProxyServer" -Default "")
  $autoConfigUrl = [string](Get-RegistryValue -Item $settings -Name "AutoConfigURL" -Default "")
  $autoDetect = [int](Get-RegistryValue -Item $settings -Name "AutoDetect" -Default 0)

  $systemProxyEnabled = ($proxyEnable -eq 1) -or -not [string]::IsNullOrWhiteSpace($autoConfigUrl)

  $mode = "off"
  if (-not [string]::IsNullOrWhiteSpace($autoConfigUrl)) {
    $mode = "pac"
  } elseif ($proxyEnable -eq 1) {
    $mode = "manual"
  }

  return @{
    autoConfigUrl = $autoConfigUrl
    autoDetect = ($autoDetect -eq 1)
    helperVersion = "0.1.0"
    mode = $mode
    proxyEnable = ($proxyEnable -eq 1)
    proxyServer = $proxyServer
    source = "windows-registry"
    systemProxyEnabled = $systemProxyEnabled
    timestamp = (Get-Date).ToString("o")
  }
}

function Write-JsonResponse {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.Sockets.TcpClient]$Client,
    [Parameter(Mandatory = $true)]
    [int]$StatusCode,
    [Parameter(Mandatory = $true)]
    [object]$Payload
  )

  $statusText = switch ($StatusCode) {
    200 { "OK" }
    404 { "Not Found" }
    default { "Error" }
  }

  $json = $Payload | ConvertTo-Json -Depth 6 -Compress
  $body = [System.Text.Encoding]::UTF8.GetBytes($json)
  $header = @(
    "HTTP/1.1 $StatusCode $statusText"
    "Content-Type: application/json; charset=utf-8"
    "Access-Control-Allow-Origin: *"
    "Cache-Control: no-store"
    "Content-Length: $($body.Length)"
    "Connection: close"
    ""
    ""
  ) -join "`r`n"

  $stream = $Client.GetStream()
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  $stream.Write($body, 0, $body.Length)
  $stream.Flush()
}

function Read-RequestPath {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.Sockets.TcpClient]$Client
  )

  $stream = $Client.GetStream()
  $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
  $requestLine = $reader.ReadLine()

  while ($true) {
    $line = $reader.ReadLine()
    if ([string]::IsNullOrEmpty($line)) {
      break
    }
  }

  if ($requestLine -match "^[A-Z]+\s+(\S+)") {
    return $Matches[1]
  }

  return "/"
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()

    try {
      $path = Read-RequestPath -Client $client

      switch ($path) {
        "/state" {
          Write-JsonResponse -Client $client -StatusCode 200 -Payload (Get-SystemProxyState)
        }
        "/healthz" {
          Write-JsonResponse -Client $client -StatusCode 200 -Payload @{
            ok = $true
            timestamp = (Get-Date).ToString("o")
          }
        }
        default {
          Write-JsonResponse -Client $client -StatusCode 404 -Payload @{
            error = "Not found"
            path = $path
          }
        }
      }
    } catch {
      try {
        Write-JsonResponse -Client $client -StatusCode 500 -Payload @{
          error = $_.Exception.Message
        }
      } catch {
        # Ignore secondary write failures.
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
