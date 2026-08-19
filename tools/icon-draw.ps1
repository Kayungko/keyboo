# Keyboo black-white keycap icon drawing (shared function)
# Design: black key body (with bottom side-wall thickness) + white keycap top + black geometric K (round-cap strokes)
# Transparent background, legible on both light and dark taskbars.

Add-Type -AssemblyName System.Drawing

function New-KeybooBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $s = [float]$size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # 安全边距:主体缩放到 80% 并居中(四周留 10% 透明边距)。
    # 微软图标规范:图标内容须比画布略小,否则标题栏/任务栏显示时会裁切顶格的圆角边缘;
    # 10% 边距保证小尺寸(16px)与壳层非整数缩放下,裁切/舍入只消耗透明区,不伤主体。
    $g.ScaleTransform(0.8, 0.8)
    $g.TranslateTransform([single]($s * 0.1), [single]($s * 0.1))

    $ink = [System.Drawing.Color]::FromArgb(255, 20, 20, 20)
    $black = New-Object System.Drawing.SolidBrush($ink)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 250, 250, 250))

    $rOut = $s * 0.24
    $dOut = $rOut * 2
    $pOut = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pOut.AddArc(0, 0, $dOut, $dOut, 180, 90)
    $pOut.AddArc($size - $dOut, 0, $dOut, $dOut, 270, 90)
    $pOut.AddArc($size - $dOut, $size - $dOut, $dOut, $dOut, 0, 90)
    $pOut.AddArc(0, $size - $dOut, $dOut, $dOut, 90, 90)
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
    $pen = New-Object System.Drawing.Pen($ink)
    $pen.Width = [single]($s * 0.11)
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
