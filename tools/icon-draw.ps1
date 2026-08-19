# Keyboo black-white keycap icon drawing (shared function)
# Design: black key body (with bottom side-wall thickness) + white keycap top + black geometric K (round-cap strokes)
# Transparent background, legible on both light and dark taskbars.
#
# 渲染质量:超采样抗锯齿——先按目标尺寸 4 倍绘制,再高质量双三次下采样。
# GDI+ 原生 AA 在小尺寸产生散灰噪点(观感"糊"),超采样是图标光栅化的业界标准做法。
# 分尺寸参数:小图标收小边距+加粗笔画保可读(微软 Fluent:<48px 简化细节);
# 大图标留足安全边距,防标题栏/任务栏裁切。

Add-Type -AssemblyName System.Drawing

# 在 $px 像素画布上按给定边距/笔画参数绘制(局部坐标 0..$px)
function Draw-KeybooAt([int]$px, [float]$margin, [float]$stroke) {
    $bmp = New-Object System.Drawing.Bitmap($px, $px)
    $s = [float]$px
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # 顺序:GDI+ 默认 Prepend,「先 Translate 后 Scale」的书写顺序才得到先缩放后平移
    # (内容居中 [margin, 1-margin]);写反会偏左上。
    $g.TranslateTransform([single]($s * $margin), [single]($s * $margin))
    $g.ScaleTransform(1 - 2 * $margin, 1 - 2 * $margin)

    $ink = [System.Drawing.Color]::FromArgb(255, 20, 20, 20)
    $black = New-Object System.Drawing.SolidBrush($ink)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 250, 250))

    $rOut = $s * 0.24
    $dOut = $rOut * 2
    $pOut = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pOut.AddArc(0, 0, $dOut, $dOut, 180, 90)
    $pOut.AddArc($s - $dOut, 0, $dOut, $dOut, 270, 90)
    $pOut.AddArc($s - $dOut, $s - $dOut, $dOut, $dOut, 0, 90)
    $pOut.AddArc(0, $s - $dOut, $dOut, $dOut, 90, 90)
    $pOut.CloseFigure()
    $g.FillPath($black, $pOut)

    $tx = $s * 0.10; $ty = $s * 0.08
    $tw = $s * 0.80; $th = $s * 0.70
    $rTop = $s * 0.14
    $dTop = $rTop * 2
    $pTop = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pTop.AddArc($tx, $ty, $dTop, $dTop, 180, 90)
    $pTop.AddArc($tx + $tw - $dTop, $ty, $dTop, $dTop, 270, 90)
    $pTop.AddArc($tx + $tw - $dTop, $ty + $th - $dTop, $dTop, $dTop, 0, 90)
    $pTop.AddArc($tx, $ty + $th - $dTop, $dTop, $dTop, 90, 90)
    $pTop.CloseFigure()
    $g.FillPath($white, $pTop)

    # geometric K: vertical + two diagonals, round caps, font-independent
    # 笔画宽度按局部坐标补偿缩放,保证生效宽度 = s*stroke
    $pen = New-Object System.Drawing.Pen($ink)
    $pen.Width = [single]($s * $stroke / (1 - 2 * $margin))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawLine($pen, [single]($s * 0.36), [single]($s * 0.24), [single]($s * 0.36), [single]($s * 0.62))
    $g.DrawLine($pen, [single]($s * 0.64), [single]($s * 0.24), [single]($s * 0.41), [single]($s * 0.42))
    $g.DrawLine($pen, [single]($s * 0.45), [single]($s * 0.39), [single]($s * 0.64), [single]($s * 0.62))
    $pen.Dispose()

    $g.Dispose()
    return $bmp
}

# 目标尺寸位图 = 4x 超采样绘制 + 高质量下采样
function New-KeybooBitmap([int]$size) {
    if ($size -le 24)      { $margin = 0.05;  $stroke = 0.14 }
    elseif ($size -le 32) { $margin = 0.055; $stroke = 0.12 }
    elseif ($size -le 96) { $margin = 0.055; $stroke = 0.11 }
    else                  { $margin = 0.10;  $stroke = 0.11 }

    $big = Draw-KeybooAt ($size * 4) $margin $stroke
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($big, 0, 0, $size, $size)
    $g.Dispose()
    $big.Dispose()
    return $bmp
}
