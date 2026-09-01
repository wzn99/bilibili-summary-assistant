Add-Type -AssemblyName System.Drawing

$assetDir = Join-Path $PSScriptRoot "..\assets"
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

foreach ($size in 16, 32, 48, 128) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $margin = [Math]::Max(1, $size * 0.04)
  $background = New-RoundedPath $margin $margin ($size - 2 * $margin) ($size - 2 * $margin) ($size * 0.21)
  $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 16, 23, 34)), $background)

  $cardX = $size * 0.18
  $cardY = $size * 0.22
  $cardW = $size * 0.64
  $cardH = $size * 0.52
  $card = New-RoundedPath $cardX $cardY $cardW $cardH ($size * 0.09)
  $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 0, 174, 236)), $card)

  $penWidth = [Math]::Max(1.2, $size * 0.055)
  $whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, $penWidth)
  $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($whitePen, $size * 0.30, $size * 0.38, $size * 0.58, $size * 0.38)
  $graphics.DrawLine($whitePen, $size * 0.30, $size * 0.50, $size * 0.66, $size * 0.50)
  $graphics.DrawLine($whitePen, $size * 0.30, $size * 0.62, $size * 0.51, $size * 0.62)

  $tail = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($size * 0.56, $size * 0.72),
    [System.Drawing.PointF]::new($size * 0.69, $size * 0.72),
    [System.Drawing.PointF]::new($size * 0.61, $size * 0.83)
  )
  $graphics.FillPolygon([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 0, 174, 236)), $tail)

  $output = Join-Path $assetDir "icon-$size.png"
  $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  $whitePen.Dispose()
  $background.Dispose()
  $card.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
