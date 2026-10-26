param(
  [Parameter(Mandatory = $true)]
  [string] $BeforePath,

  [Parameter(Mandatory = $true)]
  [string] $AfterPath,

  [Parameter(Mandatory = $true)]
  [string] $OutputPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$before = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $BeforePath))
$after = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $AfterPath))

try {
  $panelWidth = [Math]::Max($before.Width, $after.Width)
  $panelHeight = [Math]::Max($before.Height, $after.Height)
  $headerHeight = 54
  $canvas = [System.Drawing.Bitmap]::new($panelWidth * 2, $panelHeight + $headerHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.Clear([System.Drawing.Color]::FromArgb(5, 6, 7))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($before, 0, $headerHeight, $panelWidth, $panelHeight)
    $graphics.DrawImage($after, $panelWidth, $headerHeight, $panelWidth, $panelHeight)

    $font = [System.Drawing.Font]::new('Segoe UI Semibold', 18)
    $mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(140, 148, 158))
    $glowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 199, 192))
    try {
      $graphics.DrawString('BEFORE · FLAT RASTER PLACEMENT', $font, $mutedBrush, 18, 13)
      $graphics.DrawString('AFTER · LAYERED 2.5D SCENE', $font, $glowBrush, $panelWidth + 18, 13)
    } finally {
      $font.Dispose()
      $mutedBrush.Dispose()
      $glowBrush.Dispose()
    }

    $divider = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(25, 199, 192), 2)
    try {
      $graphics.DrawLine($divider, $panelWidth, 0, $panelWidth, $canvas.Height)
    } finally {
      $divider.Dispose()
    }
  } finally {
    $graphics.Dispose()
  }

  $outputDirectory = Split-Path -Parent $OutputPath
  if ($outputDirectory) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  }
  $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
} finally {
  $before.Dispose()
  $after.Dispose()
}

Write-Output (Resolve-Path -LiteralPath $OutputPath)
