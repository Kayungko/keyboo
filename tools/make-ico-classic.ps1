# 生成经典 ICO(BMP/DIB 条目),兼容老版 rc.exe;绘制函数见 icon-draw.ps1
. "$PSScriptRoot\icon-draw.ps1"

$dir = "C:\Users\admin\AppData\Local\.aimana\projects\AIMana\keyboo\src-tauri\icons"

$sizes = @(16, 24, 32, 48, 64)
$entries = @()
foreach ($s in $sizes) {
    $entries += ,@($s, (New-KeybooBitmap $s))
}

$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($ms)
$w.Write([uint16]0)
$w.Write([uint16]1)
$w.Write([uint16]$entries.Count)

$images = @()
foreach ($e in $entries) {
    $s = $e[0]; $bmp = $e[1]
    $andRowBytes = [int](((($s + 31) / 32))) * 4
    $dataSize = 40 + $s * $s * 4 + $andRowBytes * $s
    $images += ,@($s, $bmp, $dataSize)
}

$offset = 6 + 16 * $entries.Count
foreach ($img in $images) {
    $s = $img[0]; $dataSize = $img[2]
    $w.Write([byte]$s)
    $w.Write([byte]$s)
    $w.Write([byte]0)
    $w.Write([byte]0)
    $w.Write([uint16]1)
    $w.Write([uint16]32)
    $w.Write([uint32]$dataSize)
    $w.Write([uint32]$offset)
    $offset += $dataSize
}

foreach ($img in $images) {
    $s = $img[0]; $bmp = $img[1]
    $w.Write([uint32]40)
    $w.Write([int32]$s)
    $w.Write([int32]($s * 2))
    $w.Write([uint16]1)
    $w.Write([uint16]32)
    $w.Write([uint32]0)
    $w.Write([uint32]0)
    $w.Write([int32]0)
    $w.Write([int32]0)
    $w.Write([uint32]0)
    $w.Write([uint32]0)
    for ($y = $s - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $s; $x++) {
            $px = $bmp.GetPixel($x, $y)
            $w.Write([byte]$px.B)
            $w.Write([byte]$px.G)
            $w.Write([byte]$px.R)
            $w.Write([byte]$px.A)
        }
    }
    $andRowBytes = [int](((($s + 31) / 32))) * 4
    $w.Write((New-Object byte[] ($andRowBytes * $s)))
    $bmp.Dispose()
}

$w.Flush()
[System.IO.File]::WriteAllBytes("$dir\icon.ico", $ms.ToArray())
$w.Dispose(); $ms.Dispose()

Get-Item "$dir\icon.ico" | Select-Object Name, Length
