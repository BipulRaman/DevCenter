# Generates a 1024x1024 DevCenter app icon (layers glyph on indigo->purple gradient).
Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Rounded-square background path
function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$bg = New-RoundedRect 0 0 $size $size 230
$indigo = [System.Drawing.Color]::FromArgb(99, 102, 241)
$purple = [System.Drawing.Color]::FromArgb(168, 85, 247)
$grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point($size, $size)),
  $indigo, $purple)
$g.FillPath($grad, $bg)

# Layers glyph (lucide "layers"), mapped from 24-space: X' = 152 + x*30, Y' = 152 + y*30
$white = [System.Drawing.Color]::White
$whiteBrush = New-Object System.Drawing.SolidBrush($white)
$pen = New-Object System.Drawing.Pen($white, 46)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

# Top face (filled diamond): (12,2)(2,7)(12,12)(22,7)
$top = @(
  (New-Object System.Drawing.PointF(512, 212)),
  (New-Object System.Drawing.PointF(212, 362)),
  (New-Object System.Drawing.PointF(512, 512)),
  (New-Object System.Drawing.PointF(812, 362))
)
$g.FillPolygon($whiteBrush, $top)

# Middle layer: (2,12)->(12,17)->(22,12)
$mid = @(
  (New-Object System.Drawing.PointF(212, 512)),
  (New-Object System.Drawing.PointF(512, 662)),
  (New-Object System.Drawing.PointF(812, 512))
)
$g.DrawLines($pen, $mid)

# Bottom layer: (2,17)->(12,22)->(22,17)
$bot = @(
  (New-Object System.Drawing.PointF(212, 662)),
  (New-Object System.Drawing.PointF(512, 812)),
  (New-Object System.Drawing.PointF(812, 662))
)
$g.DrawLines($pen, $bot)

$g.Dispose()
$out = Join-Path $PSScriptRoot 'app-logo.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Saved $out"
