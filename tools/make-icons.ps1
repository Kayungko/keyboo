Add-Type -AssemblyName System.Drawing

$dir = "C:\Users\admin\AppData\Local\.aimana\projects\AIMana\keyboo\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

function New-KeybooIcon([int]$size, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    # 珊瑚色圆角方形底 + 白色对话泡(啵)+ 小尾巴,Keyboo 品牌图形
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

    # 白色对话泡泡
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $bw = [int]($size * 0.56); $bh = [int]($size * 0.42)
    $bx = [int](($size - $bw) / 2); $by = [int]($size * 0.22)
    $bubble = New-Object System.Drawing.Rectangle($bx, $by, $bw, $bh)
    $g.FillEllipse($white, $bubble)
    # 泡泡尾巴(左下小三角)
    $tailPts = @(
        (New-Object System.Drawing.Point([int]($bx + $bw * 0.22), [int]($by + $bh * 0.82))),
        (New-Object System.Drawing.Point([int]($bx + $bw * 0.14), [int]($by + $bh * 1.18))),
        (New-Object System.Drawing.Point([int]($bx + $bw * 0.44), [int]($by + $bh * 0.92)))
    )
    $g.FillPolygon($white, $tailPts)

    # 泡泡里的珊瑚色字母 K
    $coral = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 107, 107))
    $fontSize = [int]($bh * 0.62)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF($bx, $by, $bw, $bh)
    $g.DrawString("K", $font, $coral, $textRect, $sf)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

New-KeybooIcon 32 "$dir\32x32.png"
New-KeybooIcon 128 "$dir\128x128.png"
New-KeybooIcon 256 "$dir\128x128@2x.png"

# 生成 icon.ico:多尺寸 PNG 压缩条目(ICO 头 + 目录项 + PNG 数据)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBytes = @()
foreach ($s in $sizes) {
    $tmp = [System.IO.Path]::GetTempFileName()
    New-KeybooIcon $s $tmp
    $pngBytes += ,([System.IO.File]::ReadAllBytes($tmp))
    Remove-Item $tmp
}

$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($ms)
# ICONDIR
$w.Write([uint16]0)          # reserved
$w.Write([uint16]1)          # type: icon
$w.Write([uint16]$sizes.Count)
# 目录项
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $data = $pngBytes[$i]
    $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))   # width
    $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))   # height
    $w.Write([byte]0)         # palette
    $w.Write([byte]0)         # reserved
    $w.Write([uint16]1)       # planes
    $w.Write([uint16]32)      # bpp
    $w.Write([uint32]$data.Length)
    $w.Write([uint32]$offset)
    $offset += $data.Length
}
foreach ($data in $pngBytes) { $w.Write($data) }
$w.Flush()
[System.IO.File]::WriteAllBytes("$dir\icon.ico", $ms.ToArray())
$w.Dispose(); $ms.Dispose()

Get-ChildItem $dir | Select-Object Name, Length
