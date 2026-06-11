param(
  [string]$InJson = "d:\codes\game1\scripts\room1_layers.json",
  [string]$OutPng = "d:\codes\game1\scripts\tmp\room1_render.png",
  [int]$Scale = 1
)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$root = "d:\codes\game1"
$layers = Get-Content $InJson -Raw | ConvertFrom-Json
$tsMain = [System.Drawing.Bitmap]::FromFile("$root\public\Sunnyside_World_ASSET_PACK_V2.1\Sunnyside_World_Assets\Tileset\spr_tileset_sunnysideworld_16px.png")
$tsForest = [System.Drawing.Bitmap]::FromFile("$root\public\Sunnyside_World_ASSET_PACK_V2.1\Sunnyside_World_Assets\Tileset\spr_tileset_sunnysideworld_forest_32px.png")

$maxW = 0; $maxH = 0
foreach ($layer in $layers) {
  $t = if ($layer.tileset -eq "tileset_forest") { 32 } else { 16 }
  if ($layer.width * $t -gt $maxW) { $maxW = $layer.width * $t }
  if ($layer.height * $t -gt $maxH) { $maxH = $layer.height * $t }
}
$W = $maxW; $H = $maxH
$out = New-Object System.Drawing.Bitmap $W,$H
$g = [System.Drawing.Graphics]::FromImage($out)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::FromArgb(255, 90, 90, 110))

# paint order: descending depth
$ordered = $layers | Sort-Object -Property depth -Descending

$flipTypes = @{
  0 = [System.Drawing.RotateFlipType]::RotateNoneFlipNone
  1 = [System.Drawing.RotateFlipType]::RotateNoneFlipX
  2 = [System.Drawing.RotateFlipType]::RotateNoneFlipY
  3 = [System.Drawing.RotateFlipType]::RotateNoneFlipXY
  4 = [System.Drawing.RotateFlipType]::Rotate90FlipNone
  5 = [System.Drawing.RotateFlipType]::Rotate90FlipX
  6 = [System.Drawing.RotateFlipType]::Rotate90FlipY
  7 = [System.Drawing.RotateFlipType]::Rotate90FlipXY
}

foreach ($layer in $ordered) {
  $isForest = $layer.tileset -eq "tileset_forest"
  $ts = if ($isForest) { $tsForest } else { $tsMain }
  $tile = if ($isForest) { 32 } else { 16 }
  $cols = if ($isForest) { 10 } else { 64 }
  $lw = $layer.width
  for ($i = 0; $i -lt $layer.cells.Count; $i++) {
    $v = $layer.cells[$i]
    if ($v -eq 0) { continue }
    $idx = $v -band 0x7FFFF
    if ($idx -eq 0) { continue }
    $mirror = ($v -band 0x10000000) -ne 0
    $flip   = ($v -band 0x20000000) -ne 0
    $rotate = ($v -band 0x40000000) -ne 0
    $sx = ($idx % $cols) * $tile
    $sy = [math]::Floor($idx / $cols) * $tile
    $dx = ($i % $lw) * $tile
    $dy = [math]::Floor($i / $lw) * $tile
    $srcR = New-Object System.Drawing.Rectangle $sx,$sy,$tile,$tile
    if ($mirror -or $flip -or $rotate) {
      $key = 0
      if ($mirror) { $key = $key -bor 1 }
      if ($flip)   { $key = $key -bor 2 }
      if ($rotate) { $key = $key -bor 4 }
      $piece = $ts.Clone($srcR, $ts.PixelFormat)
      $piece.RotateFlip($flipTypes[$key])
      $g.DrawImage($piece, $dx, $dy, $tile, $tile)
      $piece.Dispose()
    } else {
      $dstR = New-Object System.Drawing.Rectangle $dx,$dy,$tile,$tile
      $g.DrawImage($ts, $dstR, $srcR, [System.Drawing.GraphicsUnit]::Pixel)
    }
  }
  Write-Host "painted $($layer.name)"
}
$g.Dispose()
if ($Scale -gt 1) {
  $big = New-Object System.Drawing.Bitmap ($W*$Scale),($H*$Scale)
  $g2 = [System.Drawing.Graphics]::FromImage($big)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g2.DrawImage($out, 0, 0, $W*$Scale, $H*$Scale)
  $g2.Dispose()
  $big.Save($OutPng)
  $big.Dispose()
} else {
  $out.Save($OutPng)
}
$out.Dispose(); $tsMain.Dispose(); $tsForest.Dispose()
"saved $OutPng"
