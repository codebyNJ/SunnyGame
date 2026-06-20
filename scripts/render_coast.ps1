Add-Type -AssemblyName System.Drawing
$j = Get-Content "d:/codes/game1/scripts/tmp/render.json" -Raw | ConvertFrom-Json
$src = "d:/codes/game1/public/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/Tileset/spr_tileset_sunnysideworld_16px.png"
$bmp = [System.Drawing.Bitmap]::FromFile($src)
$W=$j.W; $H=$j.H; $S=64
# crop to island region cols 3..12 rows 1..8
$cx0=7;$cy0=7;$cw=10;$ch=7
$o = New-Object System.Drawing.Bitmap(($cw*$S),($ch*$S)); $g=[System.Drawing.Graphics]::FromImage($o)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor; $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
function DrawTile($v,$px,$py){
  if($v -eq 0){return}
  $i = $v -band 0x7ffff; $f = ($v -shr 28) -band 7
  $col = $i % 64; $row = [math]::Floor($i/64)
  $tile = New-Object System.Drawing.Bitmap(16,16); $gt=[System.Drawing.Graphics]::FromImage($tile)
  $gt.DrawImage($bmp,(New-Object System.Drawing.Rectangle(0,0,16,16)),(New-Object System.Drawing.Rectangle(($col*16),($row*16),16,16)),[System.Drawing.GraphicsUnit]::Pixel); $gt.Dispose()
  $m=($f -band 1);$fl=($f -band 2);$r=($f -band 4)
  if($r){ if($fl -and $m){$tile.RotateFlip("Rotate270FlipNone")} elseif($fl){$tile.RotateFlip("Rotate90FlipX")} elseif($m){$tile.RotateFlip("Rotate90FlipY")} else {$tile.RotateFlip("Rotate90FlipNone")} }
  else { if($m -and $fl){$tile.RotateFlip("Rotate180FlipNone")} elseif($m){$tile.RotateFlip("RotateNoneFlipX")} elseif($fl){$tile.RotateFlip("RotateNoneFlipY")} }
  $g.DrawImage($tile,$px,$py,$S,$S); $tile.Dispose()
}
for($y=0;$y -lt $ch;$y++){ for($x=0;$x -lt $cw;$x++){
  $idx=($cy0+$y)*$W+($cx0+$x); $px=$x*$S; $py=$y*$S
  DrawTile $j.sea[$idx] $px $py
  DrawTile $j.land[$idx] $px $py
}}
$g.Dispose(); $o.Save("d:/codes/game1/scripts/tmp/render.png"); $o.Dispose()
Write-Output "rendered"
