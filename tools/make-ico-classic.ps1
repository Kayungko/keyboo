Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\admin\AppData\Local\.aimana\projects\AIMana\keyboo\src-tauri\icons"

function New-KeybooBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 107, 107))
    $radius = [int]($size * 0.22)
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $pathBg = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $pathBg.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $pathBg.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $pathBg.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $pathBg.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $pathBg.CloseFigure()
    $g.FillPath($bg, $pathBg)

    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $bw = [int]($size * 0.56); $bh = [int]($size * 0.42)
    $bx = [int](($size - $bw) / 2); $by = [int]($size * 0.22)
    $bubble = New-Object System.Drawing.Rectangle($bx, $by, $bw, $bh)
    $g.FillEllipse($white, $bubble)
    $tailPts = @(
        (New-Object System.Drawing.Point([int]($bx + $bw * 0.22), [int]($by + $bh * 0.82))),
        (New-Object System.Drawing.Point([int]($bx + $bw * 0.14), [int]($by + $bh * 1.18))),
        (New-Object System.Drawing.Point([int]($bx + $bw * 0.44), [int]($by + $bh * 0.92)))
    )
    $g.FillPolygon($white, $tailPts)

    $coral = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 107, 107))
    $fontSize = [int]($bh * 0.62)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF($bx, $by, $bw, $bh)
    $g.DrawString("K", $font, $coral, $textRect, $sf)

    $g.Dispose()
    return $bmp
}

# 经典 ICO(BMP/DIB 条目),兼容老版 rc.exe
$sizes = @(16, 24, 32, 48, 64)
$entries = @()
foreach ($s in $sizes) {
    $bmp = New-KeybooBitmap $s
    $entries += ,@($s, $bmp)
}

$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($ms)
$w.Write([uint16]0)
$w.Write([uint16]1)
$w.Write([uint16]$entries.Count)

# 预计算各条目数据
$images = @()
foreach ($e in $entries) {
    $s = $e[0]; $bmp = $e[1]
    $andRowBytes = [int]((($s + 31) / 32)) * 4
    $xorBytes = $s * $s * 4
    $dataSize = 40 + $xorBytes + $andRowBytes * $s
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
    # BITMAPINFOHEADER(biHeight 为 2×高度:XOR + AND)
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
    # XOR 数据:自底向上 BGRA
    for ($y = $s - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $s; $x++) {
            $px = $bmp.GetPixel($x, $y)
            $w.Write([byte]$px.B)
            $w.Write([byte]$px.G)
            $w.Write([byte]$px.R)
            $w.Write([byte]$px.A)
        }
    }
    # AND 掩码:32bpp 下全零(透明度由 alpha 通道表达)
    $andRowBytes = [int]((($s + 31) / 32)) * 4
    $zeros = New-Object byte[] ($andRowBytes * $s)
    $w.Write($zeros)
    $bmp.Dispose()
}

$w.Flush()
[System.IO.File]::WriteAllBytes("$dir\icon.ico", $ms.ToArray())
$w.Dispose(); $ms.Dispose()

Get-Item "$dir\icon.ico" | Select-Object Name, Length
