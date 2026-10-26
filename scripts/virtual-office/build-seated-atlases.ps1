param(
  [Parameter(Mandatory = $true)]
  [string]$GeneratedRoot
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
$drawingAssembly = [System.Drawing.Bitmap].Assembly.Location
$drawingPrimitivesAssembly = [System.Drawing.Rectangle].Assembly.Location
$gdiPlusAssembly = Join-Path (Split-Path $drawingAssembly) 'System.Private.Windows.GdiPlus.dll'
$windowsCoreAssembly = Join-Path (Split-Path $drawingAssembly) 'System.Private.Windows.Core.dll'

Add-Type -ReferencedAssemblies @(
  $drawingAssembly,
  $drawingPrimitivesAssembly,
  $gdiPlusAssembly,
  $windowsCoreAssembly,
  'System.Core'
) -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class AexosSeatedAtlasBuilder
{
    private const int Columns = 3;
    private const int Rows = 6;

    public static void Build(string walkingAtlasPath, string seatedStripPath, string outputPath)
    {
        using (var walking = new Bitmap(walkingAtlasPath))
        using (var seatedSource = RemoveCheckerboard(seatedStripPath))
        using (var output = new Bitmap(walking.Width, walking.Height, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(output))
        {
            graphics.Clear(Color.Transparent);
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.SmoothingMode = SmoothingMode.HighQuality;

            var cellWidth = walking.Width / Columns;
            var cellHeight = walking.Height / Rows;
            graphics.DrawImage(
                walking,
                new Rectangle(0, 0, cellWidth * 2, walking.Height),
                new Rectangle(0, 0, cellWidth * 2, walking.Height),
                GraphicsUnit.Pixel
            );

            var stripCellHeight = seatedSource.Height / Rows;
            for (var row = 0; row < Rows; row++)
            {
                var sourceCell = new Rectangle(
                    0,
                    row * stripCellHeight,
                    seatedSource.Width,
                    row == Rows - 1 ? seatedSource.Height - row * stripCellHeight : stripCellHeight
                );
                var bounds = FindVisibleBounds(seatedSource, sourceCell);
                if (bounds.Width == 0 || bounds.Height == 0)
                {
                    throw new InvalidDataException($"No seated subject found in row {row + 1}.");
                }

                var maxWidth = cellWidth * 0.90;
                var maxHeight = cellHeight * 0.78;
                var scale = Math.Min(maxWidth / bounds.Width, maxHeight / bounds.Height);
                var targetWidth = Math.Max(1, (int)Math.Round(bounds.Width * scale));
                var targetHeight = Math.Max(1, (int)Math.Round(bounds.Height * scale));
                var targetX = cellWidth * 2 + (cellWidth - targetWidth) / 2;
                var targetBottom = (row + 1) * cellHeight - (int)Math.Round(cellHeight * 0.025);
                var targetY = targetBottom - targetHeight;

                graphics.DrawImage(
                    seatedSource,
                    new Rectangle(targetX, targetY, targetWidth, targetHeight),
                    bounds,
                    GraphicsUnit.Pixel
                );
            }

            Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
            output.Save(outputPath, ImageFormat.Png);
        }
    }

    private static Bitmap RemoveCheckerboard(string path)
    {
        using (var source = new Bitmap(path))
        {
            var output = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var color = source.GetPixel(x, y);
                    var min = Math.Min(color.R, Math.Min(color.G, color.B));
                    var max = Math.Max(color.R, Math.Max(color.G, color.B));
                    var chroma = max - min;
                    var alpha = 255;

                    if (chroma <= 14 && min >= 238)
                    {
                        alpha = 0;
                    }
                    else if (chroma <= 18 && min >= 212)
                    {
                        alpha = Math.Max(0, Math.Min(255, (238 - min) * 10));
                    }

                    if (alpha == 0)
                    {
                        output.SetPixel(x, y, Color.Transparent);
                    }
                    else
                    {
                        output.SetPixel(x, y, Color.FromArgb(alpha, color.R, color.G, color.B));
                    }
                }
            }
            return output;
        }
    }

    private static Rectangle FindVisibleBounds(Bitmap image, Rectangle cell)
    {
        var left = cell.Right;
        var top = cell.Bottom;
        var right = cell.Left - 1;
        var bottom = cell.Top - 1;

        for (var y = cell.Top; y < cell.Bottom; y++)
        {
            for (var x = cell.Left; x < cell.Right; x++)
            {
                if (image.GetPixel(x, y).A <= 18) continue;
                left = Math.Min(left, x);
                top = Math.Min(top, y);
                right = Math.Max(right, x);
                bottom = Math.Max(bottom, y);
            }
        }

        return right < left || bottom < top
            ? Rectangle.Empty
            : Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
    }
}
'@

$assetRoot = Join-Path $PSScriptRoot '..\..\.aexos-core\core\virtual-office\public\assets'
$sources = @(
  @{ Id = 'a'; File = 'exec-75b2fd8b-b2b1-45b7-a8ad-faa6dcfd4d1b.png' },
  @{ Id = 'b'; File = 'exec-76bd1220-6ac1-479d-b610-0038e19d1c9c.png' },
  @{ Id = 'c'; File = 'exec-40c6dd0d-1604-401f-ba40-9b8d9c35acd0.png' },
  @{ Id = 'd'; File = 'exec-8fa48648-b935-4006-b2ba-45f3e0e8b179.png' }
)

foreach ($source in $sources) {
  $walking = Join-Path $assetRoot "cyryx-agent-identity-$($source.Id)-v4.png"
  $seated = Join-Path $GeneratedRoot $source.File
  $output = Join-Path $assetRoot "cyryx-agent-identity-$($source.Id)-v5.png"

  if (-not (Test-Path -LiteralPath $walking)) {
    throw "Walking atlas not found: $walking"
  }
  if (-not (Test-Path -LiteralPath $seated)) {
    throw "Generated seated strip not found: $seated"
  }

  [AexosSeatedAtlasBuilder]::Build($walking, $seated, $output)
  Write-Output $output
}
