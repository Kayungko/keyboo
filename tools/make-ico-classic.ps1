# 生成 Keyboo icon.ico:
# - 16~64:经典 BMP/DIB 条目(兼容老版 rc.exe)
# - 128/256:PNG 压缩条目(高分辨率档,Vista+ 标准;修复任务栏/Alt-Tab 高 DPI 放大模糊)
# 绘制函数见 icon-draw.ps1;几何同源 tools/keyboo-icon.svg
. "$PSScriptRoot\icon-draw.ps1"

$dir = "C:\Users\admin\AppData\Local\.aimana\projects\AIMana\keyboo\src-tauri\icons"

$bmpSizes = @(16, 24, 32, 48, 64)
$pngSizes = @(128, 256)

# 条目:@(size, kind, payload, dataSize)
$entries = @()
foreach ($s in $bmpSizes) {
    $entries += ,@($s, "bmp", (New-KeybooBitmap $s), 0)
}
foreach ($s in $pngSizes) {
    $bmp = New-KeybooBitmap $s
    $pms = New-Object System.IO.MemoryStream
    $bmp.Save($pms, [System.Drawing.Imaging.ImageFormat]::Png)
    $entries += ,@($s, "png", $pms.ToArray(), [int]$pms.Length)
    $pms.Dispose()
    $bmp.Dispose()
}

# BMP 条目数据量:BITMAPINFOHEADER(40)+ 像素(BGRA)+ AND 掩码行
for ($i = 0; $i -lt $entries.Count; $i++) {
    if ($entries[$i][1] -eq "bmp") {
        $s = $entries[$i][0]
        $andRowBytes = [int](((($s + 31) / 32))) * 4
        $entries[$i][3] = 40 + $s * $s * 4 + $andRowBytes * $s
    }
}

$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($ms)
$w.Write([uint16]0)
$w.Write([uint16]1)
$w.Write([uint16]$entries.Count)

$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
    $s = $e[0]; $dataSize = $e[3]
    # ICO 目录:256 档宽高字节写 0
    $b = if ($s -ge 256) { 0 } else { $s }
    $w.Write([byte]$b)
    $w.Write([byte]$b)
    $w.Write([byte]0)
    $w.Write([byte]0)
    $w.Write([uint16]1)
    $w.Write([uint16]32)
    $w.Write([uint32]$dataSize)
    $w.Write([uint32]$offset)
    $offset += $dataSize
}

foreach ($e in $entries) {
    if ($e[1] -eq "png") {
        $w.Write([byte[]]$e[2])
        continue
    }
    $s = $e[0]; $bmp = $e[2]
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
