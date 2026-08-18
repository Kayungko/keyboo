# 生成 PNG 图标(32/128/256),绘制函数见 icon-draw.ps1
. "$PSScriptRoot\icon-draw.ps1"

$dir = "C:\Users\admin\AppData\Local\.aimana\projects\AIMana\keyboo\src-tauri\icons"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

foreach ($pair in @(@(32, "32x32.png"), @(128, "128x128.png"), @(256, "128x128@2x.png"))) {
    $bmp = New-KeybooBitmap $pair[0]
    $bmp.Save("$dir\$($pair[1])", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

Get-ChildItem $dir -Filter *.png | Select-Object Name, Length
